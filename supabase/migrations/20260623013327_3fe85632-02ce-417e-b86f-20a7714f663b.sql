
-- 1) subscriptions.lifetime_google_token must never be readable by clients.
--    Replace table-level SELECT with column-level SELECT excluding the token.
REVOKE SELECT ON public.subscriptions FROM authenticated;
REVOKE SELECT ON public.subscriptions FROM anon;
GRANT SELECT (
  id, user_id, plan, status, started_at, expires_at,
  order_count, inventory_created_total, count_period_start, last_reset_at,
  provider, provider_product_id, provider_transaction_id, provider_purchase_token,
  current_period_end, lifetime_purchase_date,
  created_at, updated_at, lifetime_email, lifetime_activated_at, lifetime_device_limit
) ON public.subscriptions TO authenticated;

-- 2) platform_connections encrypted tokens must never be readable by clients.
REVOKE SELECT ON public.platform_connections FROM authenticated;
REVOKE SELECT ON public.platform_connections FROM anon;
GRANT SELECT (
  id, user_id, platform, platform_shop_id, platform_shop_name,
  token_expires_at, scopes, status, last_synced_at, last_error,
  connected_at, updated_at
) ON public.platform_connections TO authenticated;

-- 3) Dine-in anon SELECT policies allowed cross-tenant enumeration.
--    Replace with a scoped SECURITY DEFINER RPC that requires the table id
--    (which anonymous diners already know from the QR-code URL).
DROP POLICY IF EXISTS "Anon can read open tickets" ON public.dine_in_tickets;
DROP POLICY IF EXISTS "Anon read own ticket orders" ON public.dine_in_orders;
DROP POLICY IF EXISTS "Anon read items via open ticket" ON public.dine_in_order_items;

CREATE OR REPLACE FUNCTION public.get_open_dine_in_ticket(_table_id uuid)
RETURNS TABLE(id uuid, table_id uuid, user_id uuid, total_amount numeric, status text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.table_id, t.user_id, t.total_amount, t.status, t.created_at
  FROM public.dine_in_tickets t
  JOIN public.restaurant_tables rt ON rt.id = t.table_id
  WHERE t.table_id = _table_id
    AND t.status = 'open'
    AND rt.active = true
  ORDER BY t.created_at DESC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_open_dine_in_ticket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_dine_in_ticket(uuid) TO anon, authenticated;

-- 4) Lock down SECURITY DEFINER trigger functions from being directly
--    callable by anon/authenticated/public. Triggers run regardless of EXECUTE
--    privilege, so this only removes the public RPC surface area.
REVOKE EXECUTE ON FUNCTION public.deduct_on_ticket_paid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_on_ticket_paid() FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_on_ticket_paid() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_dine_in_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_dine_in_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_dine_in_order() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.recalc_dine_in_ticket_total() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_dine_in_ticket_total() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_dine_in_ticket_total() FROM authenticated;
