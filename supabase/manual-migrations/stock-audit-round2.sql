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


-- ---------- STEP 2 ----------
-- Before: stock was found by matching orders.product to an inventory name
-- exactly. Order-form orders store product as "T-shirt x 2, Cap x 1", which
-- never matches, so order-form sales never reduced stock. Multi-item orders
-- had the same problem.
--
-- Now:
--   * If the order has line items linked to products (order_items.product_id),
--     each product goes down by its own quantity.
--   * Otherwise the old name match is used (e.g. a manual order saved as
--     Paid straight away, before its line item is written).
--   * It fires when an order first becomes paid, shipped or delivered
--     (was: only "Paid"), so a TikTok order first seen as Shipped also counts.
--     Going Paid -> Shipped does not deduct a second time.
--   * TikTok orders on TikTok-linked products are still skipped (the product
--     sync applies TikTok's own stock change), and every deduction is still
--     written to Inventory History as 'order_sale'.
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qty integer := GREATEST(0, COALESCE(NEW.quantity, 0));
  _should_deduct boolean := false;
  _paid_now boolean := NEW.status IN ('Paid', 'Shipped', 'Delivered');
  _row record;
  _old_stock integer;
  _new_stock integer;
  _used_items boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _should_deduct := _paid_now;
  ELSIF TG_OP = 'UPDATE' THEN
    _should_deduct := _paid_now AND COALESCE(OLD.status, '') NOT IN ('Paid', 'Shipped', 'Delivered');
  END IF;

  IF NOT _should_deduct THEN
    RETURN NEW;
  END IF;

  -- 1) Line items linked to products
  FOR _row IN
    SELECT oi.product_id AS id, sum(GREATEST(0, COALESCE(oi.quantity, 0)))::integer AS qty
      FROM public.order_items oi
      JOIN public.inventory i ON i.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND i.user_id = NEW.user_id
     GROUP BY oi.product_id
  LOOP
    _used_items := true;
    SELECT stock INTO _old_stock FROM public.inventory
     WHERE id = _row.id
       AND NOT (COALESCE(NEW.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL)
     FOR UPDATE;
    IF NOT FOUND OR _row.qty <= 0 THEN
      CONTINUE;
    END IF;
    _new_stock := GREATEST(0, _old_stock - _row.qty);
    UPDATE public.inventory SET stock = _new_stock WHERE id = _row.id;
    IF _new_stock <> _old_stock THEN
      BEGIN
        INSERT INTO public.inventory_audit_log
          (user_id, product_id, product_name, field_name, old_value, new_value, source)
        SELECT NEW.user_id, i.id, i.name, 'stock', _old_stock::text, _new_stock::text, 'order_sale'
          FROM public.inventory i WHERE i.id = _row.id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  IF _used_items THEN
    RETURN NEW;
  END IF;

  -- 2) Fallback: match the order's product text to an inventory name
  IF _qty <= 0 OR NEW.product IS NULL OR length(btrim(NEW.product)) = 0 THEN
    RETURN NEW;
  END IF;

  FOR _row IN
    SELECT id, name, stock
      FROM public.inventory
     WHERE user_id = NEW.user_id
       AND lower(btrim(name)) = lower(btrim(NEW.product))
       AND NOT (COALESCE(NEW.order_source, '') = 'tiktok' AND tiktok_product_id IS NOT NULL)
     FOR UPDATE
  LOOP
    _new_stock := GREATEST(0, _row.stock - _qty);
    UPDATE public.inventory SET stock = _new_stock WHERE id = _row.id;
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
