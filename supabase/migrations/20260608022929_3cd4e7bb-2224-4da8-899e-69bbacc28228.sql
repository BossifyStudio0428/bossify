
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;

CREATE POLICY subscriptions_update_own ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan       IS NOT DISTINCT FROM (SELECT s.plan       FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND status     IS NOT DISTINCT FROM (SELECT s.status     FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND expires_at IS NOT DISTINCT FROM (SELECT s.expires_at FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND current_period_end       IS NOT DISTINCT FROM (SELECT s.current_period_end       FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND started_at               IS NOT DISTINCT FROM (SELECT s.started_at               FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND provider                 IS NOT DISTINCT FROM (SELECT s.provider                 FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND provider_product_id      IS NOT DISTINCT FROM (SELECT s.provider_product_id      FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND provider_transaction_id  IS NOT DISTINCT FROM (SELECT s.provider_transaction_id  FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND provider_purchase_token  IS NOT DISTINCT FROM (SELECT s.provider_purchase_token  FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND lifetime_email           IS NOT DISTINCT FROM (SELECT s.lifetime_email           FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND lifetime_google_token    IS NOT DISTINCT FROM (SELECT s.lifetime_google_token    FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND lifetime_activated_at    IS NOT DISTINCT FROM (SELECT s.lifetime_activated_at    FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND lifetime_purchase_date   IS NOT DISTINCT FROM (SELECT s.lifetime_purchase_date   FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND lifetime_device_limit    IS NOT DISTINCT FROM (SELECT s.lifetime_device_limit    FROM public.subscriptions s WHERE s.user_id = auth.uid())
);
