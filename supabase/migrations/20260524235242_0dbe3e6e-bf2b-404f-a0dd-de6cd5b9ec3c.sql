
-- 1) platform_connections
CREATE TABLE IF NOT EXISTS public.platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL,
  platform_shop_id text,
  platform_shop_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  last_synced_at timestamptz,
  last_error text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_connections_platform_check
    CHECK (platform IN ('tiktok','shopee','lazada','facebook','instagram')),
  CONSTRAINT platform_connections_status_check
    CHECK (status IN ('active','expired','revoked','error')),
  CONSTRAINT platform_connections_user_platform_unique UNIQUE (user_id, platform)
);

ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own platform connections"
  ON public.platform_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform connections"
  ON public.platform_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Note: INSERT/UPDATE are intentionally restricted to service_role only
-- (no policy granted to authenticated). Tokens are written by server code.

CREATE TRIGGER set_platform_connections_updated_at
  BEFORE UPDATE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_profiles_updated_at();

-- 2) platform_order_events (idempotency log)
CREATE TABLE IF NOT EXISTS public.platform_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_order_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  order_id uuid,
  raw_payload jsonb,
  CONSTRAINT platform_order_events_platform_check
    CHECK (platform IN ('tiktok','shopee','lazada','facebook','instagram')),
  CONSTRAINT platform_order_events_unique
    UNIQUE (platform, platform_order_id, event_type)
);

ALTER TABLE public.platform_order_events ENABLE ROW LEVEL SECURITY;
-- server-only: no policies granted

-- 3) orders extensions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_order_id text,
  ADD COLUMN IF NOT EXISTS platform_metadata jsonb;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_source_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_check
  CHECK (order_source IN ('manual','online_form','tiktok','shopee','lazada','facebook','instagram'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('Unpaid','Paid','Pending','Shipped','Delivered','Cancelled','Refunded'));

CREATE INDEX IF NOT EXISTS orders_user_platform_order_idx
  ON public.orders(user_id, platform_order_id)
  WHERE platform_order_id IS NOT NULL;

-- 4) Sync profiles.connected_platforms cache from platform_connections
CREATE OR REPLACE FUNCTION public.sync_connected_platforms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _platforms jsonb;
BEGIN
  _user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT jsonb_object_agg(p, true) INTO _platforms
  FROM (
    SELECT platform AS p
    FROM public.platform_connections
    WHERE user_id = _user_id AND status = 'active'
  ) s;

  UPDATE public.profiles
  SET connected_platforms = jsonb_build_object(
        'tiktok',    COALESCE((_platforms->>'tiktok')::boolean, false),
        'shopee',    COALESCE((_platforms->>'shopee')::boolean, false),
        'lazada',    COALESCE((_platforms->>'lazada')::boolean, false),
        'facebook',  COALESCE((_platforms->>'facebook')::boolean, false),
        'instagram', COALESCE((_platforms->>'instagram')::boolean, false)
      )
  WHERE id = _user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_connected_platforms_trg ON public.platform_connections;
CREATE TRIGGER sync_connected_platforms_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.sync_connected_platforms();
