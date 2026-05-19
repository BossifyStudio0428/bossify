CREATE TABLE IF NOT EXISTS public.client_education_details (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  course_interest text,
  university_preference text,
  academic_result text,
  family_income text CHECK (family_income IN ('below_3k', '3k_5k', '5k_10k', 'above_10k')),
  scholarship_interest boolean DEFAULT false,
  application_status text DEFAULT 'not_applied' CHECK (
    application_status IN ('not_applied', 'applied', 'interview', 'offer_received', 'accepted', 'rejected')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.client_education_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY ced_select_own ON public.client_education_details FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ced_insert_own ON public.client_education_details FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ced_update_own ON public.client_education_details FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ced_delete_own ON public.client_education_details FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ced_user ON public.client_education_details(user_id);
CREATE INDEX IF NOT EXISTS idx_ced_client ON public.client_education_details(client_id);

CREATE TRIGGER trg_ced_updated_at
BEFORE UPDATE ON public.client_education_details
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();