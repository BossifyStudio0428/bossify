CREATE POLICY "order_receipts_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'order-receipts' AND public.can_access_user_data((storage.foldername(name))[1]::uuid));

CREATE POLICY "order_receipts_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "order_receipts_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'order-receipts' AND public.can_access_user_data((storage.foldername(name))[1]::uuid));

CREATE POLICY "order_receipts_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-receipts' AND public.can_access_user_data((storage.foldername(name))[1]::uuid));