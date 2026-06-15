
DROP POLICY IF EXISTS "message_media_read" ON storage.objects;
CREATE POLICY "message_media_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-media' AND (
    public.is_master(auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.status = 'active'
        AND cu.company_id::text = split_part(name, '/', 1)
    )
  )
);
