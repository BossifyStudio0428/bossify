-- 1. Drop ambiguous 3-arg overload of can_manage_team_member
DROP FUNCTION IF EXISTS public.can_manage_team_member(uuid, uuid, uuid);

-- 2. Profile: prevent self-escalation explicitly
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (
    -- Non-admins must keep is_admin = false. Admins may keep it true.
    (COALESCE(is_admin, false) = false)
    OR public.is_admin()
  )
);

-- 3. Subscriptions: explicit policy-level block on billing-field writes
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;
CREATE POLICY subscriptions_update_own
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan = (SELECT plan FROM public.subscriptions WHERE user_id = auth.uid())
  AND status = (SELECT status FROM public.subscriptions WHERE user_id = auth.uid())
  AND expires_at IS NOT DISTINCT FROM (SELECT expires_at FROM public.subscriptions WHERE user_id = auth.uid())
  AND current_period_end IS NOT DISTINCT FROM (SELECT current_period_end FROM public.subscriptions WHERE user_id = auth.uid())
  AND provider IS NOT DISTINCT FROM (SELECT provider FROM public.subscriptions WHERE user_id = auth.uid())
  AND provider_product_id IS NOT DISTINCT FROM (SELECT provider_product_id FROM public.subscriptions WHERE user_id = auth.uid())
  AND provider_transaction_id IS NOT DISTINCT FROM (SELECT provider_transaction_id FROM public.subscriptions WHERE user_id = auth.uid())
  AND provider_purchase_token IS NOT DISTINCT FROM (SELECT provider_purchase_token FROM public.subscriptions WHERE user_id = auth.uid())
  AND lifetime_email IS NOT DISTINCT FROM (SELECT lifetime_email FROM public.subscriptions WHERE user_id = auth.uid())
  AND lifetime_google_token IS NOT DISTINCT FROM (SELECT lifetime_google_token FROM public.subscriptions WHERE user_id = auth.uid())
  AND lifetime_activated_at IS NOT DISTINCT FROM (SELECT lifetime_activated_at FROM public.subscriptions WHERE user_id = auth.uid())
  AND lifetime_purchase_date IS NOT DISTINCT FROM (SELECT lifetime_purchase_date FROM public.subscriptions WHERE user_id = auth.uid())
  AND lifetime_device_limit IS NOT DISTINCT FROM (SELECT lifetime_device_limit FROM public.subscriptions WHERE user_id = auth.uid())
);