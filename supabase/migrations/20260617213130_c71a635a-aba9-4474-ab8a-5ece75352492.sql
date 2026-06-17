DROP POLICY IF EXISTS quick_replies_select_own ON public.quick_replies;
CREATE POLICY quick_replies_select_own ON public.quick_replies
FOR SELECT TO authenticated
USING (
  (user_id = auth.uid() AND app_private.user_belongs_to_company(auth.uid(), company_id))
  OR app_private.is_master(auth.uid())
);