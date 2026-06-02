-- Replace register_device_session: BLOCK when limit reached (do not evict).
-- This enforces the subscription device limit. Web = 1 device, Android = 1 device.
-- When limit hit, raises 'device_limit_reached: used/limit' so the client
-- shows the device management screen and forces the user to remove a device.

CREATE OR REPLACE FUNCTION public.register_device_session(
  _device_id text,
  _device_name text,
  _device_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF _limit IS NULL OR _limit < 1 THEN
    _limit := 1;
  END IF;

  -- Check if this exact device already has a session: just refresh it.
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
    -- New device. Count existing sessions.
    SELECT count(*) INTO _used FROM public.device_sessions WHERE user_id = _uid;

    IF _used >= _limit THEN
      -- BLOCK: do not evict. Force user to manage devices manually.
      RAISE EXCEPTION 'device_limit_reached: %/%', _used, _limit
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.device_sessions (user_id, device_id, device_name, device_type)
    VALUES (
      _uid,
      _device_id,
      COALESCE(NULLIF(_device_name, ''), 'Unknown device'),
      COALESCE(NULLIF(_device_type, ''), 'web')
    );
  END IF;

  SELECT count(*) INTO _used FROM public.device_sessions WHERE user_id = _uid;
  RETURN jsonb_build_object(
    'used', _used,
    'limit', _limit,
    'current_device_id', _device_id
  );
END;
$function$;