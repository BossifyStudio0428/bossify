
-- Helper: orders-per-month cap per plan
CREATE OR REPLACE FUNCTION public.orders_limit_for_plan(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_plan, 'free'))
    WHEN 'free'    THEN 20
    WHEN 'starter' THEN 40
    ELSE 2147483647  -- effectively unlimited
  END
$$;

-- Trigger: before insert on orders — enforce monthly quota.
-- Auto-resets order_count when a new month starts, blocks insert when over cap,
-- and auto-disables the seller's public order form on cap hit.
CREATE OR REPLACE FUNCTION public.enforce_order_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub        public.subscriptions%ROWTYPE;
  _limit      integer;
  _month_start timestamptz := date_trunc('month', now());
  _current    integer;
BEGIN
  SELECT * INTO _sub
  FROM public.subscriptions
  WHERE user_id = NEW.user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  -- No subscription row → treat as free
  IF NOT FOUND THEN
    _limit := public.orders_limit_for_plan('free');
    _current := 0;
  ELSE
    _limit := public.orders_limit_for_plan(_sub.plan);
    -- Monthly reset
    IF _sub.count_period_start IS NULL
       OR _sub.count_period_start < _month_start THEN
      UPDATE public.subscriptions
        SET order_count = 0,
            count_period_start = _month_start,
            last_reset_at = now()
      WHERE id = _sub.id;
      _current := 0;
    ELSE
      _current := COALESCE(_sub.order_count, 0);
    END IF;
  END IF;

  IF _current >= _limit THEN
    -- Auto-disable the public order form so future customers see "shop closed"
    UPDATE public.profiles
      SET order_form_enabled = false
    WHERE id = NEW.user_id
      AND order_form_enabled = true;

    RAISE EXCEPTION 'order_quota_reached: plan allows % orders/month; already used %',
      _limit, _current
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_quota ON public.orders;
CREATE TRIGGER trg_enforce_order_quota
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_quota();

-- Trigger: after insert on orders — increment counter
CREATE OR REPLACE FUNCTION public.increment_order_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
    SET order_count = COALESCE(order_count, 0) + 1
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_order_count ON public.orders;
CREATE TRIGGER trg_increment_order_count
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.increment_order_count();
