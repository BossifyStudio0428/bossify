-- ============================================================
-- Round 2 fixes. Run in the Supabase SQL editor (app DB) BEFORE
-- deploying the matching app code. Safe to run more than once.
--
--   STEP 1  customers.address  (TikTok buyer delivery address)
--   STEP 2  order trigger: deduct stock from the order's line items
-- ============================================================

-- ---------- STEP 1 ----------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address text;


-- ---------- STEP 2: stock follows the order ----------
-- Before:
--   * stock was found by matching orders.product to an inventory name
--     exactly. Order-form orders store product as "T-shirt x 2, Cap x 1",
--     which never matches, so order-form (and multi-item) sales never
--     reduced stock;
--   * marking an order Paid -> Unpaid -> Paid deducted twice and never gave
--     the first deduction back;
--   * deleting a paid order never put its stock back.
--
-- Now (one shared helper, used in both directions):
--   * if the order has line items linked to products (order_items.product_id)
--     each product moves by its own quantity; otherwise the old name match
--     is used (e.g. a manual order saved as Paid before its line item exists);
--   * stock goes DOWN when an order first becomes paid / shipped / delivered,
--     and comes BACK when it goes from one of those to Unpaid, Pending or
--     Cancelled, or when a paid order is deleted (unless a refund already
--     restocked it). Refunded orders are left to the refund screen, which
--     asks whether goods came back;
--   * TikTok orders on TikTok-linked products are still skipped (the product
--     sync applies TikTok's own stock change);
--   * every change is written to Inventory History.

CREATE OR REPLACE FUNCTION public.order_stock_apply(_o public.orders, _sign integer, _source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qty integer := GREATEST(0, COALESCE(_o.quantity, 0));
  _row record;
  _old_stock integer;
  _new_stock integer;
  _used_items boolean := false;
BEGIN
  -- 1) Line items linked to products
  FOR _row IN
    SELECT oi.product_id AS id, sum(GREATEST(0, COALESCE(oi.quantity, 0)))::integer AS qty
      FROM public.order_items oi
      JOIN public.inventory i ON i.id = oi.product_id
     WHERE oi.order_id = _o.id
       AND i.user_id = _o.user_id
     GROUP BY oi.product_id
  LOOP
    _used_items := true;
    SELECT stock INTO _old_stock FROM public.inventory
     WHERE id = _row.id
       AND NOT (COALESCE(_o.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL)
     FOR UPDATE;
    IF NOT FOUND OR _row.qty <= 0 THEN
      CONTINUE;
    END IF;
    _new_stock := GREATEST(0, _old_stock + _sign * _row.qty);
    UPDATE public.inventory SET stock = _new_stock WHERE id = _row.id;
    IF _new_stock <> _old_stock THEN
      BEGIN
        INSERT INTO public.inventory_audit_log
          (user_id, product_id, product_name, field_name, old_value, new_value, source)
        SELECT _o.user_id, i.id, i.name, 'stock', _old_stock::text, _new_stock::text, _source
          FROM public.inventory i WHERE i.id = _row.id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  IF _used_items THEN
    RETURN;
  END IF;

  -- 2) Fallback: match the order's product text to an inventory name
  IF _qty <= 0 OR _o.product IS NULL OR length(btrim(_o.product)) = 0 THEN
    RETURN;
  END IF;

  FOR _row IN
    SELECT id, name, stock
      FROM public.inventory
     WHERE user_id = _o.user_id
       AND lower(btrim(name)) = lower(btrim(_o.product))
       AND NOT (COALESCE(_o.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL)
     FOR UPDATE
  LOOP
    _new_stock := GREATEST(0, _row.stock + _sign * _qty);
    UPDATE public.inventory SET stock = _new_stock WHERE id = _row.id;
    IF _new_stock <> _row.stock THEN
      BEGIN
        INSERT INTO public.inventory_audit_log
          (user_id, product_id, product_name, field_name, old_value, new_value, source)
        VALUES
          (_o.user_id, _row.id, _row.name, 'stock', _row.stock::text, _new_stock::text, _source);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;
END;
$function$;

-- Same name as before, so the two existing triggers on orders pick it up.
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _paid_now boolean := NEW.status IN ('Paid', 'Shipped', 'Delivered');
  _paid_before boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _paid_before := COALESCE(OLD.status, '') IN ('Paid', 'Shipped', 'Delivered');
  END IF;

  IF _paid_now AND NOT _paid_before THEN
    PERFORM public.order_stock_apply(NEW, -1, 'order_sale');
  ELSIF _paid_before AND NEW.status IN ('Unpaid', 'Pending', 'Cancelled') THEN
    PERFORM public.order_stock_apply(NEW, 1, 'order_unpaid');
  END IF;

  RETURN NEW;
END;
$function$;

-- Deleting a paid order gives its stock back — unless a refund on it
-- already restocked goods (that would count them twice).
CREATE OR REPLACE FUNCTION public.restock_on_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.status, '') IN ('Paid', 'Shipped', 'Delivered')
     AND NOT EXISTS (
       SELECT 1 FROM public.order_adjustments a
        WHERE a.order_id = OLD.id AND a.restocked = true
     ) THEN
    PERFORM public.order_stock_apply(OLD, 1, 'order_deleted');
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS restock_on_order_delete ON public.orders;
CREATE TRIGGER restock_on_order_delete
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.restock_on_order_delete();
