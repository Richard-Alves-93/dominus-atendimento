
CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  shortcut text,
  body text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quick_replies_company_user_idx
  ON public.quick_replies (company_id, user_id);

CREATE INDEX quick_replies_company_user_active_idx
  ON public.quick_replies (company_id, user_id, is_active);

CREATE INDEX quick_replies_shortcut_idx
  ON public.quick_replies (shortcut);

CREATE UNIQUE INDEX quick_replies_company_user_shortcut_uidx
  ON public.quick_replies (company_id, user_id, shortcut)
  WHERE shortcut IS NOT NULL AND shortcut <> '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- SELECT: dono na sua empresa, ou Master global
CREATE POLICY "quick_replies_select_own"
ON public.quick_replies FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id))
  OR public.is_master(auth.uid())
);

-- INSERT: só pode criar para si mesmo na empresa em que está vinculado
CREATE POLICY "quick_replies_insert_own"
ON public.quick_replies FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- UPDATE: só as próprias
CREATE POLICY "quick_replies_update_own"
ON public.quick_replies FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));

-- DELETE: só as próprias
CREATE POLICY "quick_replies_delete_own"
ON public.quick_replies FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND public.user_belongs_to_company(auth.uid(), company_id));

CREATE TRIGGER quick_replies_set_updated_at
BEFORE UPDATE ON public.quick_replies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
