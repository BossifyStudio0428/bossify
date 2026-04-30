ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 0;
