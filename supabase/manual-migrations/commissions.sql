-- =====================================================================
-- Property Commissions — manual migration
-- Run this in your external SQL editor (project: knouahqwazerjiyiqgmh)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid,
  client_name text NOT NULL DEFAULT '',
  transaction_type text NOT NULL DEFAULT 'sale', -- 'sale' | 'rental'
  transaction_price numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 3,
  commission_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending | received | cancelled
  transaction_date date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commissions_user_id_idx ON public.commissions(user_id);
CREATE INDEX IF NOT EXISTS commissions_listing_id_idx ON public.commissions(listing_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'commissions_select_own_or_team' AND tablename = 'commissions') THEN
    CREATE POLICY commissions_select_own_or_team ON public.commissions
      FOR SELECT TO authenticated USING (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'commissions_insert_own' AND tablename = 'commissions') THEN
    CREATE POLICY commissions_insert_own ON public.commissions
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'commissions_update_own_or_team' AND tablename = 'commissions') THEN
    CREATE POLICY commissions_update_own_or_team ON public.commissions
      FOR UPDATE TO authenticated USING (can_access_user_data(user_id)) WITH CHECK (can_access_user_data(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'commissions_delete_own_or_team' AND tablename = 'commissions') THEN
    CREATE POLICY commissions_delete_own_or_team ON public.commissions
      FOR DELETE TO authenticated USING (can_access_user_data(user_id));
  END IF;
END $$;

DROP TRIGGER IF EXISTS commissions_set_updated_at ON public.commissions;
CREATE TRIGGER commissions_set_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_services_updated_at();