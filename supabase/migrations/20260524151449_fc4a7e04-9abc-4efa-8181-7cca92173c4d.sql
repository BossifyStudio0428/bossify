
-- 1) PROFILES: prevent self-escalation to admin via UPDATE policy
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2) INVENTORY: drop public anon read. Reads happen server-side via service key.
DROP POLICY IF EXISTS "Public can read enabled seller inventory" ON public.inventory;

-- 3) SERVICES: drop public anon read for the same reason.
DROP POLICY IF EXISTS "Public can read enabled seller services" ON public.services;

-- 4) STORAGE: restrict listing of product-images bucket to the owner's folder.
--    The bucket remains public=true so the public CDN URL still serves images
--    directly; this only restricts the listing/SELECT through the SQL API.
DROP POLICY IF EXISTS "Product images are publicly readable" ON storage.objects;
CREATE POLICY "Users can list own product images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
