DROP POLICY IF EXISTS "message_media_read" ON storage.objects;

CREATE POLICY "message_media_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-media'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN app_private.is_master(auth.uid())
      OR app_private.user_belongs_to_company(auth.uid(), split_part(name, '/', 1)::uuid)
    ELSE false
  END
);