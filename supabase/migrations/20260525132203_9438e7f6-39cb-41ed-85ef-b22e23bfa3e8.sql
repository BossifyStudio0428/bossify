
-- Replace the deduct function: only deduct on transition to 'Paid'
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
     AND lower(btrim(name)) = lower(btrim(NEW.product));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deduct_stock_on_order_insert ON public.orders;
DROP TRIGGER IF EXISTS deduct_stock_on_order_update ON public.orders;

CREATE TRIGGER deduct_stock_on_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.deduct_stock_on_order();

CREATE TRIGGER deduct_stock_on_order_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.deduct_stock_on_order();
