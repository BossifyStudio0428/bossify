-- =====================================================================
-- Public Order Form — manual migration
-- Run this in Supabase SQL editor (do NOT auto-execute).
-- =====================================================================

-- 1) profiles: unique public code + enabled flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS order_form_code text UNIQUE
    DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  ADD COLUMN IF NOT EXISTS order_form_enabled boolean NOT NULL DEFAULT true;

-- Backfill existing users
UPDATE public.profiles
SET order_form_code = lower(substr(md5(random()::text || id::text), 1, 8))
WHERE order_form_code IS NULL;

-- 2) orders: track where the order came from
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_source_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_source_check
      CHECK (order_source IN ('manual', 'online_form'));
  END IF;
END $$;

-- 3) Public lookup index for the order form code
CREATE INDEX IF NOT EXISTS profiles_order_form_code_idx
  ON public.profiles(order_form_code)
  WHERE order_form_code IS NOT NULL;