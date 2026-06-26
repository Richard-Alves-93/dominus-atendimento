DROP POLICY IF EXISTS ticket_transfers_select ON public.ticket_transfers;

CREATE POLICY ticket_transfers_select ON public.ticket_transfers
FOR SELECT TO authenticated
USING (
  public.is_master(auth.uid())
  OR (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.user_company_role(auth.uid(), company_id) IN ('owner','admin','manager')
      OR auth.uid() = from_user_id
      OR auth.uid() = transferred_by
      OR auth.uid() = accepted_by
      OR auth.uid() = returned_to_user_id
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_transfers.ticket_id
          AND t.assigned_user_id = auth.uid()
      )
    )
  )
);