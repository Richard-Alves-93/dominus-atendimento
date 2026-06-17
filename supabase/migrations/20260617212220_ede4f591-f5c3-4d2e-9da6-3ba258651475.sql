DROP POLICY IF EXISTS quick_replies_select_own ON public.quick_replies;
DROP POLICY IF EXISTS quick_replies_insert_own ON public.quick_replies;
DROP POLICY IF EXISTS quick_replies_update_own ON public.quick_replies;
DROP POLICY IF EXISTS quick_replies_delete_own ON public.quick_replies;

CREATE POLICY quick_replies_select_own ON public.quick_replies
  FOR SELECT TO authenticated
  USING (
    ((user_id = auth.uid()) AND app_private.user_belongs_to_company(auth.uid(), company_id))
    OR public.is_master(auth.uid())
  );

CREATE POLICY quick_replies_insert_own ON public.quick_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid()) AND app_private.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY quick_replies_update_own ON public.quick_replies
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) AND app_private.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK ((user_id = auth.uid()) AND app_private.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY quick_replies_delete_own ON public.quick_replies
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) AND app_private.user_belongs_to_company(auth.uid(), company_id));