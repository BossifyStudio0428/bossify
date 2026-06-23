ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_address text,
  ADD COLUMN IF NOT EXISTS store_lat numeric,
  ADD COLUMN IF NOT EXISTS store_lng numeric,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_zones jsonb NOT NULL DEFAULT '[]'::jsonb;