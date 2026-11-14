-- ============================================================
-- TikTok buyers in the customer list.
--
-- Run this in the Supabase SQL editor (app DB) BEFORE deploying the app
-- code that goes with it. Safe to run more than once.
--
--   STEP 1  two new columns on customers
--   STEP 2  one customer row per TikTok buyer from existing orders
--
-- TikTok does not give sellers a buyer's name or phone. The only stable
-- per-buyer value is orders.platform_buyer_id, so each TikTok customer is
-- keyed by it and named "TikTok #<last 6 characters>". The seller can
-- rename it later; orders stay linked because matching uses the id, not
-- the name.
--
-- Nothing here changes or deletes any order, and nothing changes the
-- existing (non-TikTok) customers apart from giving them source = 'manual'.
-- ============================================================


-- ---------- STEP 1: columns ----------
-- source            : 'tiktok' for rows created from TikTok buyers,
--                     'manual' for everything else (the default).
-- platform_buyer_id : TikTok's buyer id, the same value stored on that
--                     buyer's orders.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS platform_buyer_id text;

-- One customer row per TikTok buyer per seller.
CREATE UNIQUE INDEX IF NOT EXISTS customers_user_platform_buyer_uidx
  ON public.customers (user_id, platform_buyer_id)
  WHERE platform_buyer_id IS NOT NULL;


-- ---------- STEP 2: backfill from existing TikTok orders ----------
-- Every buyer with at least one TikTok order gets a row. Totals count
-- paid / shipped / delivered orders only (cancelled, refunded, unpaid and
-- pending are left out), same rule as the rest of the app. The app
-- recalculates these totals from the orders each time the page loads, so
-- they are only a starting point.
INSERT INTO public.customers
  (user_id, name, source, platform_buyer_id, total_orders, total_spent, last_order_at)
SELECT o.user_id,
       'TikTok #' || right(o.platform_buyer_id, 6),
       'tiktok',
       o.platform_buyer_id,
       count(*) FILTER (WHERE o.status IN ('Paid', 'Shipped', 'Delivered')),
       COALESCE(sum(o.amount) FILTER (WHERE o.status IN ('Paid', 'Shipped', 'Delivered')), 0),
       max(o.created_at)
  FROM public.orders o
 WHERE o.order_source = 'tiktok'
   AND o.platform_buyer_id IS NOT NULL
 GROUP BY o.user_id, o.platform_buyer_id
ON CONFLICT (user_id, platform_buyer_id) WHERE platform_buyer_id IS NOT NULL
DO UPDATE SET total_orders  = EXCLUDED.total_orders,
              total_spent   = EXCLUDED.total_spent,
              last_order_at = EXCLUDED.last_order_at;
