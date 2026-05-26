
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;

CREATE POLICY subscriptions_update_own
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure the protection trigger is attached (idempotent)
DROP TRIGGER IF EXISTS protect_subscription_fields_trg ON public.subscriptions;
CREATE TRIGGER protect_subscription_fields_trg
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_subscription_fields();
