
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  device_type text NOT NULL DEFAULT 'web',
  last_active timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS device_sessions_user_idx ON public.device_sessions(user_id);

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_sessions_select_own ON public.device_sessions;
CREATE POLICY device_sessions_select_own ON public.device_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS device_sessions_delete_own ON public.device_sessions;
CREATE POLICY device_sessions_delete_own ON public.device_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Inserts/updates happen via the SECURITY DEFINER RPC below; no direct insert policy needed.

CREATE OR REPLACE FUNCTION public.register_device_session(
  _device_id text,
  _device_name text,
  _device_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _limit integer;
  _used integer;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  _limit := public.device_limit_for_user(_uid);

  SELECT EXISTS (
    SELECT 1 FROM public.device_sessions
     WHERE user_id = _uid AND device_id = _device_id
  ) INTO _exists;

  IF _exists THEN
    UPDATE public.device_sessions
       SET last_active = now(),
           device_name = COALESCE(NULLIF(_device_name, ''), device_name),
           device_type = COALESCE(NULLIF(_device_type, ''), device_type)
     WHERE user_id = _uid AND device_id = _device_id;
  ELSE
    SELECT count(*) INTO _used FROM public.device_sessions WHERE user_id = _uid;
    IF _used >= _limit THEN
      RAISE EXCEPTION 'device_limit_reached: %/%', _used, _limit
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.device_sessions (user_id, device_id, device_name, device_type)
    VALUES (_uid, _device_id, COALESCE(NULLIF(_device_name, ''), 'Unknown device'), COALESCE(NULLIF(_device_type, ''), 'web'));
  END IF;

  SELECT count(*) INTO _used FROM public.device_sessions WHERE user_id = _uid;
  RETURN jsonb_build_object(
    'used', _used,
    'limit', _limit,
    'current_device_id', _device_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_device_session(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_device_session(text, text, text) TO authenticated;
