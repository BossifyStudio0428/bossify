
-- Replace subscriptions_update_own to also pin usage counter fields
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;

CREATE POLICY subscriptions_update_own
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan IS NOT DISTINCT FROM (SELECT s.plan FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND status IS NOT DISTINCT FROM (SELECT s.status FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND expires_at IS NOT DISTINCT FROM (SELECT s.expires_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND order_count IS NOT DISTINCT FROM (SELECT s.order_count FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND inventory_created_total IS NOT DISTINCT FROM (SELECT s.inventory_created_total FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND count_period_start IS NOT DISTINCT FROM (SELECT s.count_period_start FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND last_reset_at IS NOT DISTINCT FROM (SELECT s.last_reset_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
);
