
-- 1) Revoke encrypted OAuth token columns from authenticated on platform_connections
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.platform_connections FROM authenticated;
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.platform_connections FROM anon;

-- 2) Revoke lifetime_google_token from authenticated on subscriptions
REVOKE SELECT (lifetime_google_token) ON public.subscriptions FROM authenticated;
REVOKE SELECT (lifetime_google_token) ON public.subscriptions FROM anon;

-- 3) Remove broad anon SELECT on restaurant_tables; replace with a scoped
--    SECURITY DEFINER RPC for the dine-in QR flow.
DROP POLICY IF EXISTS "Anyone can view active tables" ON public.restaurant_tables;
REVOKE SELECT ON public.restaurant_tables FROM anon;

CREATE OR REPLACE FUNCTION public.get_dine_in_table(_table_id uuid)
RETURNS TABLE(id uuid, label text, user_id uuid, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.label, t.user_id, t.active
  FROM public.restaurant_tables t
  WHERE t.id = _table_id AND t.active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_dine_in_table(uuid) TO anon, authenticated;
