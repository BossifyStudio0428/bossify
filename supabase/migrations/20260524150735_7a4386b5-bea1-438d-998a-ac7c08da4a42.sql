
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_services_user_category
  ON public.services (user_id, category);

-- Public (anon) read access for services of sellers with enabled order form
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'services'
      AND policyname = 'Public can read enabled seller services'
  ) THEN
    CREATE POLICY "Public can read enabled seller services"
      ON public.services
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = services.user_id
            AND p.order_form_enabled IS TRUE
            AND p.order_form_code IS NOT NULL
        )
        AND is_active = true
      );
  END IF;
END $$;
