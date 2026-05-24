-- Attach protective triggers (functions already exist but were never wired up)

-- Subscriptions: block users from self-upgrading plan / billing fields
DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields();

DROP TRIGGER IF EXISTS trg_protect_lifetime_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_lifetime_fields
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.protect_lifetime_fields();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_subscriptions_updated_at();

-- Profiles: block non-admins from flipping is_admin to true
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profiles_updated_at();

-- Services: updated_at maintenance
DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.set_services_updated_at();

-- Device tokens: updated_at maintenance
DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
BEFORE UPDATE ON public.device_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_device_tokens_updated_at();