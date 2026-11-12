-- ============================================================
-- Stock fixes from the stock/profit audit (BUG 2, 4, 7).
--
-- Run this in the Supabase SQL editor BEFORE deploying the app code
-- that goes with it. Safe to run more than once.
--
--   STEP 1  two new inventory columns            (BUG 2)
--   STEP 2  order trigger: no double-deduct for  (BUG 2)
--           TikTok, and write Inventory History  (BUG 4)
--   STEP 3  one-step stock add/subtract function (BUG 7)
--
-- What happens if the app is deployed before this is run:
--   - TikTok product sync stops with an error (it refuses to run
--     without the STEP 1 columns). Nothing is written.
--   - Manual stock edits keep working the old way (the app falls
--     back when the STEP 3 function is missing).
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


-- ---------- STEP 2: order trigger ----------
-- Two changes to the function that deducts stock when an order is paid:
--
-- (a) BUG 2 — no double-deduct for TikTok. With the change-based sync, a
--     TikTok sale already lowers Bossify stock (TikTok's own number drops
--     and that drop is applied). So this trigger must NOT also deduct for
--     a TikTok order when the product is linked to TikTok. Manual /
--     order-form / other-channel orders, and TikTok orders for products
--     NOT linked to TikTok, deduct exactly as before.
--
-- (b) BUG 4 — every deduction now writes a row to inventory_audit_log
--     (source = 'order_sale'), so sales show up in Inventory History. If
--     writing that row fails for any reason, the order and the deduction
--     still go through — the log can never block a sale.
--
-- !! CHECK FIRST !!  This function body is based on the repo copy
-- (supabase/migrations/20260525132203_*.sql). The live database is ahead
-- of the repo in places, so the live function may be newer. Replacing it
-- blindly would undo those changes. Run this and compare first:
--
--   SELECT pg_get_functiondef('public.deduct_stock_on_order()'::regprocedure);
--
-- The ONLY intended differences from the repo copy are (a) and (b).
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qty integer := GREATEST(0, COALESCE(NEW.quantity, 0));
  _should_deduct boolean := false;
  _row record;
  _new_stock integer;
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

  FOR _row IN
    SELECT id, name, stock
      FROM public.inventory
     WHERE user_id = NEW.user_id
       AND lower(btrim(name)) = lower(btrim(NEW.product))
       -- (a) TikTok order + TikTok-linked product: the sync handles it.
       AND NOT (COALESCE(NEW.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL)
     FOR UPDATE
  LOOP
    _new_stock := GREATEST(0, _row.stock - _qty);

    UPDATE public.inventory
       SET stock = _new_stock
     WHERE id = _row.id;

    -- (b) Inventory History. Never allowed to block the sale.
    IF _new_stock <> _row.stock THEN
      BEGIN
        INSERT INTO public.inventory_audit_log
          (user_id, product_id, product_name, field_name, old_value, new_value, source)
        VALUES
          (NEW.user_id, _row.id, _row.name, 'stock', _row.stock::text, _new_stock::text, 'order_sale');
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;


-- ---------- STEP 3: one-step stock add/subtract (BUG 7) ----------
-- The app used to read a product's stock, work out the new number on the
-- phone, and write it back. Two devices doing that at nearly the same
-- moment each wrote their own total and one edit was lost. This function
-- does "stock = stock + change" inside the database in a single step, so
-- both edits always count. Stock never goes below 0.
--
-- p_cost_price is optional: stock receipts pass the new weighted-average
-- cost so stock and cost are saved together.
--
-- SECURITY INVOKER: it runs with the caller's own permissions, so the
-- existing row-level security on inventory still decides who may change
-- which product — this grants nobody anything new.
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_id uuid,
  p_delta numeric,
  p_cost_price numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  UPDATE public.inventory
     SET stock = GREATEST(0, stock + p_delta),
         cost_price = COALESCE(p_cost_price, cost_price)
   WHERE id = p_id
  RETURNING stock::numeric;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, numeric, numeric) TO authenticated;
