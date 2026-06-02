-- Run this in the external Supabase SQL editor (project: knouahqwazerjiyiqgmh)

-- 1) Client Requirements
CREATE TABLE IF NOT EXISTS public.property_client_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  property_type text NOT NULL DEFAULT 'condo',
  listing_type text NOT NULL DEFAULT 'buy',
  budget_min numeric DEFAULT 0,
  budget_max numeric DEFAULT 0,
  preferred_location text,
  min_bedrooms integer,
  min_bathrooms integer,
  min_size_sqft integer,
  other_requirements text,
  status text NOT NULL DEFAULT 'searching',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_client_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcr_select_own ON public.property_client_requirements;
CREATE POLICY pcr_select_own ON public.property_client_requirements FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pcr_insert_own ON public.property_client_requirements;
CREATE POLICY pcr_insert_own ON public.property_client_requirements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pcr_update_own ON public.property_client_requirements;
CREATE POLICY pcr_update_own ON public.property_client_requirements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pcr_delete_own ON public.property_client_requirements;
CREATE POLICY pcr_delete_own ON public.property_client_requirements FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2) Document Checklists
CREATE TABLE IF NOT EXISTS public.property_document_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  listing_id uuid,
  title text NOT NULL DEFAULT 'Document Checklist',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_document_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdc_select_own ON public.property_document_checklists;
CREATE POLICY pdc_select_own ON public.property_document_checklists FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pdc_insert_own ON public.property_document_checklists;
CREATE POLICY pdc_insert_own ON public.property_document_checklists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pdc_update_own ON public.property_document_checklists;
CREATE POLICY pdc_update_own ON public.property_document_checklists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pdc_delete_own ON public.property_document_checklists;
CREATE POLICY pdc_delete_own ON public.property_document_checklists FOR DELETE TO authenticated USING (auth.uid() = user_id);