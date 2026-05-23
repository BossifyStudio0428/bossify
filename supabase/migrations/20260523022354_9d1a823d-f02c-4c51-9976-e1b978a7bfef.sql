
-- 1) Remove the broad anon SELECT policy on profiles.
-- Public order form access is served by a server function using the
-- service role key, so anon clients no longer need direct profile reads.
DROP POLICY IF EXISTS "Public can read enabled order form profiles" ON public.profiles;

-- 2) Prevent privilege escalation: block users from changing is_admin on their own profile.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Only existing admins may change admin status.
    IF NOT coalesce(OLD.is_admin, false) THEN
      RAISE EXCEPTION 'is_admin cannot be changed by non-admin users';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3) Lock down subscription billing fields from user tampering.
-- Users can still own their row, but plan/status/expiry/counters/provider tokens
-- can only be modified by trusted server code (service role).
CREATE OR REPLACE FUNCTION public.protect_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.order_count IS DISTINCT FROM OLD.order_count
     OR NEW.inventory_created_total IS DISTINCT FROM OLD.inventory_created_total
     OR NEW.count_period_start IS DISTINCT FROM OLD.count_period_start
     OR NEW.last_reset_at IS DISTINCT FROM OLD.last_reset_at
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_product_id IS DISTINCT FROM OLD.provider_product_id
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
     OR NEW.provider_purchase_token IS DISTINCT FROM OLD.provider_purchase_token
     OR NEW.lifetime_email IS DISTINCT FROM OLD.lifetime_email
     OR NEW.lifetime_google_token IS DISTINCT FROM OLD.lifetime_google_token
     OR NEW.lifetime_activated_at IS DISTINCT FROM OLD.lifetime_activated_at
     OR NEW.lifetime_purchase_date IS DISTINCT FROM OLD.lifetime_purchase_date
     OR NEW.lifetime_device_limit IS DISTINCT FROM OLD.lifetime_device_limit
  THEN
    RAISE EXCEPTION 'Subscription billing fields can only be modified by server-side processes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_subscription_fields();
