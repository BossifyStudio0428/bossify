-- ============================================================
-- TikTok stock sync: apply TikTok's stock CHANGE, don't overwrite.
--
-- Run this in the Supabase SQL editor BEFORE deploying the app code
-- that goes with it (src/lib/platforms/tiktok-products-sync.server.ts).
-- The new sync refuses to run until these columns exist, so nothing
-- is written with the old columns half-present.
--
-- Safe to run more than once.
-- ============================================================

-- ---------- STEP 1: two new columns on inventory ----------
-- tiktok_sku_id       : which TikTok variant (S / M / L ...) this row is.
--                       Until now every variant row of one product shared
--                       only tiktok_product_id, so the sync could not tell
--                       them apart and wrote every variant's stock onto
--                       one row.
-- tiktok_stock_synced : TikTok's stock number as of the last sync. The
--                       next sync adds (TikTok now - this number) to the
--                       Bossify stock instead of overwriting it, so manual
--                       deductions for other sales channels survive.
-- Neither column changes any existing stock number by itself.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS tiktok_sku_id text,
  ADD COLUMN IF NOT EXISTS tiktok_stock_synced integer;

CREATE INDEX IF NOT EXISTS inventory_user_tiktok_sku_idx
  ON public.inventory (user_id, tiktok_sku_id)
  WHERE tiktok_sku_id IS NOT NULL;


-- ---------- STEP 2: stop double-deducting TikTok sales ----------
-- With the change-based sync, a TikTok sale already lowers Bossify stock
-- (TikTok's own number drops, and that drop is applied). The order trigger
-- must therefore NOT also deduct for a TikTok order when the product is
-- linked to TikTok. Manual / order-form / other-channel orders, and TikTok
-- orders for products that are NOT linked to TikTok, deduct exactly as
-- before.
--
-- !! CHECK FIRST !!  This function body is copied from the repo
-- (supabase/migrations/20260525132203_*.sql). If the live database has a
-- newer version, replacing it would undo those changes. Run this and
-- compare before running the CREATE OR REPLACE below:
--
--   SELECT pg_get_functiondef('public.deduct_stock_on_order()'::regprocedure);
--
-- The ONLY intended difference is the last AND NOT (...) condition.
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qty integer := GREATEST(0, COALESCE(NEW.quantity, 0));
  _should_deduct boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _should_deduct := (NEW.status = 'Paid');
  ELSIF TG_OP = 'UPDATE' THEN
    _should_deduct := (NEW.status = 'Paid' AND COALESCE(OLD.status, '') <> 'Paid');
  END IF;

  IF NOT _should_deduct THEN
    RETURN NEW;
  END IF;

  IF _qty <= 0 OR NEW.product IS NULL OR length(btrim(NEW.product)) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.inventory
     SET stock = GREATEST(0, stock - _qty)
   WHERE user_id = NEW.user_id
     AND lower(btrim(name)) = lower(btrim(NEW.product))
     AND NOT (COALESCE(NEW.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL);

  RETURN NEW;
END;
$function$;
