
-- Prevent users from tampering with lifetime binding fields.
-- Only service_role (server admin) can change lifetime_email,
-- lifetime_google_token, lifetime_activated_at, lifetime_purchase_date.
CREATE OR REPLACE FUNCTION public.protect_lifetime_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to do anything
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (OLD.lifetime_email IS DISTINCT FROM NEW.lifetime_email)
     OR (OLD.lifetime_google_token IS DISTINCT FROM NEW.lifetime_google_token)
     OR (OLD.lifetime_activated_at IS DISTINCT FROM NEW.lifetime_activated_at)
     OR (OLD.lifetime_purchase_date IS DISTINCT FROM NEW.lifetime_purchase_date) THEN
    RAISE EXCEPTION 'Lifetime binding fields are immutable from client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_lifetime_fields_trigger ON public.subscriptions;
CREATE TRIGGER protect_lifetime_fields_trigger
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_lifetime_fields();

-- One email = at most one active lifetime row
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_lifetime_email_unique
ON public.subscriptions (lower(lifetime_email))
WHERE plan = 'lifetime' AND lifetime_email IS NOT NULL;

-- Auto-sync lifetime_email when user changes their auth email,
-- so legitimate email changes don't lock the user out.
CREATE OR REPLACE FUNCTION public.sync_lifetime_email_on_user_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.email IS NOT NULL THEN
    UPDATE public.subscriptions
    SET lifetime_email = NEW.email
    WHERE user_id = NEW.id
      AND plan = 'lifetime'
      AND lower(lifetime_email) = lower(OLD.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_lifetime_email_trigger ON auth.users;
CREATE TRIGGER sync_lifetime_email_trigger
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_lifetime_email_on_user_change();
