CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_count integer;
  _limit integer;
  _to_remove integer;
BEGIN
  -- Existing token refreshes are allowed.
  IF EXISTS (
    SELECT 1
    FROM public.device_tokens
    WHERE user_id = NEW.user_id
      AND token = NEW.token
  ) THEN
    RETURN NEW;
  END IF;

  _limit := public.device_limit_for_user(NEW.user_id);
  IF _limit IS NULL OR _limit < 1 THEN
    _limit := 1;
  END IF;

  SELECT count(*) INTO _existing_count
  FROM public.device_tokens
  WHERE user_id = NEW.user_id;

  -- Firebase can rotate tokens after reinstall / app data reset. Instead of
  -- blocking the new token forever, replace the oldest saved token(s) so the
  -- current device can receive notifications again.
  IF _existing_count >= _limit THEN
    _to_remove := (_existing_count - _limit) + 1;

    DELETE FROM public.device_tokens dt
    WHERE dt.id IN (
      SELECT id
      FROM public.device_tokens
      WHERE user_id = NEW.user_id
      ORDER BY updated_at ASC NULLS FIRST, id ASC
      LIMIT _to_remove
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_device_limit() FROM PUBLIC, anon, authenticated;