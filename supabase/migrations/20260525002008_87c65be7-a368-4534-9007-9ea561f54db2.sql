CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qty integer := GREATEST(0, COALESCE(NEW.quantity, 0));
BEGIN
  IF _qty <= 0 OR NEW.product IS NULL OR length(btrim(NEW.product)) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.inventory
     SET stock = GREATEST(0, stock - _qty)
   WHERE user_id = NEW.user_id
     AND lower(btrim(name)) = lower(btrim(NEW.product));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_stock_on_order ON public.orders;

CREATE TRIGGER trg_deduct_stock_on_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.deduct_stock_on_order();

REVOKE EXECUTE ON FUNCTION public.deduct_stock_on_order() FROM PUBLIC, anon, authenticated;