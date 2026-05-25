DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;

CREATE POLICY subscriptions_insert_own
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND plan = 'free'
  AND status = 'active'
  AND coalesce(order_count, 0) = 0
  AND coalesce(inventory_created_total, 0) = 0
  AND expires_at IS NULL
  AND current_period_end IS NULL
  AND provider IS NULL
  AND provider_product_id IS NULL
  AND provider_transaction_id IS NULL
  AND provider_purchase_token IS NULL
  AND lifetime_email IS NULL
  AND lifetime_google_token IS NULL
  AND lifetime_activated_at IS NULL
  AND lifetime_purchase_date IS NULL
);