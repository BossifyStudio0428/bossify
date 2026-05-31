CREATE OR REPLACE FUNCTION public.register_device_session(_device_id text, _device_name text, _device_type text)
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
  _to_remove integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  _limit := public.device_limit_for_user(_uid);
  IF _limit IS NULL OR _limit < 1 THEN
    _limit := 1;
  END IF;

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
      -- Evict oldest device(s) to make room for the new login. This mirrors
      -- the enforce_device_limit trigger behavior for device_tokens and
      -- ensures a fresh login (e.g. web browser) always succeeds.
      _to_remove := (_used - _limit) + 1;
      DELETE FROM public.device_sessions ds
      WHERE ds.id IN (
        SELECT id
          FROM public.device_sessions
         WHERE user_id = _uid
         ORDER BY last_active ASC NULLS FIRST, created_at ASC
         LIMIT _to_remove
      );
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
$function$;