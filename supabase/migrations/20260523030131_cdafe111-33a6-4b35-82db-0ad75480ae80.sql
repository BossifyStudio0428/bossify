-- Attach privilege-escalation guard to profiles
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Attach subscription billing-field guard
DROP TRIGGER IF EXISTS protect_subscription_fields_trg ON public.subscriptions;
CREATE TRIGGER protect_subscription_fields_trg
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_subscription_fields();
