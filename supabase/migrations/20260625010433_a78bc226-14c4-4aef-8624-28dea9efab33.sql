
-- 1) Percentual de comissão por usuário/empresa
ALTER TABLE public.company_users
  ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2) NOT NULL DEFAULT 0
    CHECK (commission_percentage >= 0 AND commission_percentage <= 100);

-- 2) Tabela de comissões
CREATE TABLE IF NOT EXISTS public.sales_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  commission_percentage numeric(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  opportunity_amount numeric(14,2) NOT NULL CHECK (opportunity_amount >= 0),
  commission_amount numeric(14,2) NOT NULL CHECK (commission_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','canceled')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_commissions TO authenticated;
GRANT ALL ON public.sales_commissions TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS sales_commissions_unique_active
  ON public.sales_commissions (company_id, opportunity_id)
  WHERE deleted_at IS NULL AND status <> 'canceled';

CREATE INDEX IF NOT EXISTS sales_commissions_company_idx
  ON public.sales_commissions (company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_commissions_seller_idx
  ON public.sales_commissions (seller_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_commissions_opportunity_idx
  ON public.sales_commissions (opportunity_id);

ALTER TABLE public.sales_commissions ENABLE ROW LEVEL SECURITY;

-- SELECT: master, qualquer membro ativo admin/owner/manager/financial, ou próprio vendedor
CREATE POLICY "sales_commissions_select"
ON public.sales_commissions FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.is_master(auth.uid())
    OR seller_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.company_id = sales_commissions.company_id
        AND cu.status = 'active'
        AND cu.role IN ('owner','admin','manager','financial')
    )
  )
);

-- UPDATE: master ou owner/admin/financial da empresa
CREATE POLICY "sales_commissions_update"
ON public.sales_commissions FOR UPDATE
TO authenticated
USING (
  public.is_master(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = sales_commissions.company_id
      AND cu.status = 'active'
      AND cu.role IN ('owner','admin','financial')
  )
)
WITH CHECK (
  public.is_master(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = sales_commissions.company_id
      AND cu.status = 'active'
      AND cu.role IN ('owner','admin','financial')
  )
);

-- INSERT/DELETE diretos pelo client são bloqueados (sem policies). Geração é via trigger SECURITY DEFINER.

CREATE TRIGGER sales_commissions_set_updated_at
  BEFORE UPDATE ON public.sales_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Trigger de geração/cancelamento a partir de opportunities
CREATE OR REPLACE FUNCTION public.opportunities_handle_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pct numeric(5,2);
  _seller uuid;
  _amount numeric(14,2);
  _existing public.sales_commissions%ROWTYPE;
  _new_id uuid;
  _seller_name text;
BEGIN
  -- Cancelamento: deixou de ser 'won'
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'won'
     AND NEW.status <> 'won' THEN
    UPDATE public.sales_commissions
       SET status = 'canceled', updated_at = now()
     WHERE opportunity_id = NEW.id
       AND status IN ('pending','approved')
       AND deleted_at IS NULL;
    INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
    SELECT NEW.company_id, 'commission.canceled', NEW.ticket_id, auth.uid(),
      jsonb_build_object(
        'opportunity_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    WHERE EXISTS (
      SELECT 1 FROM public.sales_commissions
       WHERE opportunity_id = NEW.id AND status = 'canceled'
    );
  END IF;

  -- Geração: virou 'won'
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won') THEN
    _seller := NEW.assigned_user_id;
    _amount := COALESCE(NEW.amount, 0);
    IF _seller IS NULL OR _amount <= 0 THEN
      RETURN NEW;
    END IF;
    SELECT commission_percentage INTO _pct
      FROM public.company_users
     WHERE company_id = NEW.company_id
       AND user_id = _seller
       AND status = 'active';
    IF _pct IS NULL OR _pct <= 0 THEN
      RETURN NEW;
    END IF;

    -- Idempotência
    SELECT * INTO _existing FROM public.sales_commissions
     WHERE opportunity_id = NEW.id AND deleted_at IS NULL
       AND status <> 'canceled'
     LIMIT 1;
    IF FOUND THEN
      -- Atualiza apenas comissões ainda pendentes/aprovadas (não toca em paga)
      IF _existing.status IN ('pending','approved') THEN
        UPDATE public.sales_commissions
           SET opportunity_amount = _amount,
               commission_percentage = _pct,
               commission_amount = round(_amount * _pct / 100.0, 2),
               seller_user_id = _seller,
               ticket_id = NEW.ticket_id,
               contact_id = NEW.contact_id,
               updated_at = now()
         WHERE id = _existing.id;
      END IF;
      RETURN NEW;
    END IF;

    INSERT INTO public.sales_commissions (
      company_id, opportunity_id, ticket_id, contact_id, seller_user_id,
      commission_percentage, opportunity_amount, commission_amount, status
    ) VALUES (
      NEW.company_id, NEW.id, NEW.ticket_id, NEW.contact_id, _seller,
      _pct, _amount, round(_amount * _pct / 100.0, 2), 'pending'
    ) RETURNING id INTO _new_id;

    INSERT INTO public.audit_logs (company_id, event_type, ticket_id, changed_by, metadata)
    VALUES (NEW.company_id, 'commission.generated', NEW.ticket_id, auth.uid(),
      jsonb_build_object(
        'commission_id', _new_id,
        'opportunity_id', NEW.id,
        'seller_user_id', _seller,
        'commission_percentage', _pct,
        'opportunity_amount', _amount,
        'commission_amount', round(_amount * _pct / 100.0, 2)
      ));

    -- Evento interno no atendimento (apenas se houver ticket + contato)
    IF NEW.ticket_id IS NOT NULL AND NEW.contact_id IS NOT NULL THEN
      SELECT full_name INTO _seller_name FROM public.profiles WHERE id = _seller;
      BEGIN
        INSERT INTO public.messages (
          company_id, ticket_id, contact_id, channel_id,
          direction, from_me, msg_type, source, body, delivery_status
        ) VALUES (
          NEW.company_id, NEW.ticket_id, NEW.contact_id, NULL,
          'inbound', false, 'system', 'system',
          'Comissão pendente gerada para ' || COALESCE(_seller_name,'vendedor') ||
            ' no valor de R$ ' || to_char(round(_amount * _pct / 100.0, 2), 'FM999G999G990D00'),
          'sent'
        );
      EXCEPTION WHEN OTHERS THEN
        -- não bloquear a geração da comissão
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_handle_commission_trg ON public.opportunities;
CREATE TRIGGER opportunities_handle_commission_trg
  AFTER INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunities_handle_commission();

-- 4) Auditoria de alteração de percentual
CREATE OR REPLACE FUNCTION public.company_users_audit_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage THEN
    INSERT INTO public.audit_logs (company_id, event_type, changed_by, metadata)
    VALUES (NEW.company_id, 'company_user.commission_percentage_changed', auth.uid(),
      jsonb_build_object(
        'user_id', NEW.user_id,
        'old_percentage', OLD.commission_percentage,
        'new_percentage', NEW.commission_percentage
      ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_users_audit_commission_trg ON public.company_users;
CREATE TRIGGER company_users_audit_commission_trg
  AFTER UPDATE OF commission_percentage ON public.company_users
  FOR EACH ROW EXECUTE FUNCTION public.company_users_audit_commission();
