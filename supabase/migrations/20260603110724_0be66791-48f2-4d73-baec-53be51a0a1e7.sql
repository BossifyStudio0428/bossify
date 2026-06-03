ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS interested_listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_interested_listing_id ON public.customers(interested_listing_id);