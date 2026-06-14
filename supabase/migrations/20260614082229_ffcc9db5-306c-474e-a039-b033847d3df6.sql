ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit numeric NOT NULL DEFAULT 0;

UPDATE public.orders
SET
  cost = COALESCE(cost, 0),
  gross_profit = COALESCE(amount, 0) - COALESCE(cost, 0);

CREATE OR REPLACE FUNCTION public.set_order_profit_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cost := COALESCE(NEW.cost, 0);
  NEW.gross_profit := COALESCE(NEW.amount, 0) - NEW.cost;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_profit_fields ON public.orders;
CREATE TRIGGER trg_set_order_profit_fields
BEFORE INSERT OR UPDATE OF amount, cost ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_profit_fields();