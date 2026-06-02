-- =====================================================================
-- Property Viewings — manual migration
-- Run this in your external SQL editor (project: knouahqwazerjiyiqgmh)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.property_viewings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid,
  customer_id uuid,
  viewing_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled
  interest_level text, -- high | medium | low
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_viewings_user_id_idx ON public.property_viewings(user_id);
CREATE INDEX IF NOT EXISTS property_viewings_listing_id_idx ON public.property_viewings(listing_id);
CREATE INDEX IF NOT EXISTS property_viewings_customer_id_idx ON public.property_viewings(customer_id);
CREATE INDEX IF NOT EXISTS property_viewings_viewing_at_idx ON public.property_viewings(viewing_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_viewings TO authenticated;
GRANT ALL ON public.property_viewings TO service_role;

ALTER TABLE public.property_viewings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'property_viewings_select_own_or_team' AND tablename = 'property_viewings') THEN
    CREATE POLICY property_viewings_select_own_or_team ON public.property_viewings
      FOR SELECT TO authenticated USING (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'property_viewings_insert_own' AND tablename = 'property_viewings') THEN
    CREATE POLICY property_viewings_insert_own ON public.property_viewings
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'property_viewings_update_own_or_team' AND tablename = 'property_viewings') THEN
    CREATE POLICY property_viewings_update_own_or_team ON public.property_viewings
      FOR UPDATE TO authenticated USING (can_access_user_data(user_id)) WITH CHECK (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'property_viewings_delete_own_or_team' AND tablename = 'property_viewings') THEN
    CREATE POLICY property_viewings_delete_own_or_team ON public.property_viewings
      FOR DELETE TO authenticated USING (can_access_user_data(user_id));
  END IF;
END $$;

DROP TRIGGER IF EXISTS property_viewings_set_updated_at ON public.property_viewings;
CREATE TRIGGER property_viewings_set_updated_at
  BEFORE UPDATE ON public.property_viewings
  FOR EACH ROW EXECUTE FUNCTION public.set_services_updated_at();