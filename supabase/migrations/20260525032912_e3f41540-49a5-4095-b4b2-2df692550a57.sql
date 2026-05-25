DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;

CREATE POLICY subscriptions_update_own
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan                    = (SELECT s.plan                    FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND status                  = (SELECT s.status                  FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND NOT (expires_at              IS DISTINCT FROM (SELECT s.expires_at              FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (current_period_end      IS DISTINCT FROM (SELECT s.current_period_end      FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (provider                IS DISTINCT FROM (SELECT s.provider                FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (provider_product_id     IS DISTINCT FROM (SELECT s.provider_product_id     FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (provider_transaction_id IS DISTINCT FROM (SELECT s.provider_transaction_id FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (provider_purchase_token IS DISTINCT FROM (SELECT s.provider_purchase_token FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (lifetime_email          IS DISTINCT FROM (SELECT s.lifetime_email          FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (lifetime_google_token   IS DISTINCT FROM (SELECT s.lifetime_google_token   FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (lifetime_activated_at   IS DISTINCT FROM (SELECT s.lifetime_activated_at   FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (lifetime_purchase_date  IS DISTINCT FROM (SELECT s.lifetime_purchase_date  FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (lifetime_device_limit   IS DISTINCT FROM (SELECT s.lifetime_device_limit   FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  -- NEW: lock usage counters so clients can't reset/lower them
  AND order_count             = (SELECT s.order_count             FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND inventory_created_total = (SELECT s.inventory_created_total FROM public.subscriptions s WHERE s.user_id = auth.uid())
  AND NOT (last_reset_at      IS DISTINCT FROM (SELECT s.last_reset_at      FROM public.subscriptions s WHERE s.user_id = auth.uid()))
  AND NOT (count_period_start IS DISTINCT FROM (SELECT s.count_period_start FROM public.subscriptions s WHERE s.user_id = auth.uid()))
);