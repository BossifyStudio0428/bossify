ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_type text DEFAULT 'manual';

NOTIFY pgrst, 'reload schema';