CREATE TABLE public.listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'condo',
  listing_type TEXT NOT NULL DEFAULT 'sale',
  price NUMERIC NOT NULL DEFAULT 0,
  address TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  size_sqft INTEGER,
  status TEXT NOT NULL DEFAULT 'available',
  description TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  interested_customer_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings_select_own_or_team"
ON public.listings FOR SELECT TO authenticated
USING (public.can_access_user_data(user_id));

CREATE POLICY "listings_insert_own"
ON public.listings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "listings_update_own_or_team"
ON public.listings FOR UPDATE TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

CREATE POLICY "listings_delete_own_or_team"
ON public.listings FOR DELETE TO authenticated
USING (public.can_access_user_data(user_id));

CREATE TRIGGER set_listings_updated_at
BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.set_services_updated_at();

CREATE INDEX idx_listings_user_id ON public.listings(user_id);