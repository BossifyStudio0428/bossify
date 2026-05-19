
CREATE OR REPLACE FUNCTION public.protect_lifetime_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses all checks
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow setting any field for the FIRST time (NULL -> value).
  -- Block changing an already-set value to anything else (including NULL).
  IF OLD.lifetime_email IS NOT NULL
     AND NEW.lifetime_email IS DISTINCT FROM OLD.lifetime_email THEN
    RAISE EXCEPTION 'lifetime_email is immutable once set';
  END IF;

  IF OLD.lifetime_activated_at IS NOT NULL
     AND NEW.lifetime_activated_at IS DISTINCT FROM OLD.lifetime_activated_at THEN
    RAISE EXCEPTION 'lifetime_activated_at is immutable once set';
  END IF;

  IF OLD.lifetime_purchase_date IS NOT NULL
     AND NEW.lifetime_purchase_date IS DISTINCT FROM OLD.lifetime_purchase_date THEN
    RAISE EXCEPTION 'lifetime_purchase_date is immutable once set';
  END IF;

  -- lifetime_google_token can be refreshed (e.g. restore on new device
  -- issues a new token for the same purchase), but cannot be cleared
  -- once set.
  IF OLD.lifetime_google_token IS NOT NULL
     AND NEW.lifetime_google_token IS NULL THEN
    RAISE EXCEPTION 'lifetime_google_token cannot be cleared once set';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_lifetime_fields() FROM PUBLIC, anon, authenticated;
