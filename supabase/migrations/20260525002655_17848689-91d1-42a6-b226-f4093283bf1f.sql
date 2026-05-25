-- Guard INSERTs on subscriptions: force safe defaults for non-service-role callers
CREATE OR REPLACE FUNCTION public.protect_subscription_fields_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role bypasses all checks
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Force safe defaults; ignore any privileged values supplied by the client.
  NEW.plan := 'free';
  NEW.status := 'active';
  NEW.expires_at := NULL;
  NEW.current_period_end := NULL;
  NEW.started_at := now();
  NEW.order_count := 0;
  NEW.inventory_created_total := 0;
  NEW.count_period_start := NULL;
  NEW.last_reset_at := NULL;
  NEW.provider := NULL;
  NEW.provider_product_id := NULL;
  NEW.provider_transaction_id := NULL;
  NEW.provider_purchase_token := NULL;
  NEW.lifetime_email := NULL;
  NEW.lifetime_google_token := NULL;
  NEW.lifetime_activated_at := NULL;
  NEW.lifetime_purchase_date := NULL;
  NEW.lifetime_device_limit := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_subscription_fields_insert ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields_insert
BEFORE INSERT ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_subscription_fields_insert();