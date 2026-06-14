ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;