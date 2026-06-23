ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS estimated_arrival text,
  ADD COLUMN IF NOT EXISTS store_address_snapshot text;