-- 1. Device-limit helper, keyed by plan name.
CREATE OR REPLACE FUNCTION public.device_limit_for_plan(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_plan, 'free'))
    WHEN 'free'          THEN 1
    WHEN 'starter'       THEN 2
    WHEN 'pro'           THEN 3
    WHEN 'lifetime'      THEN 5
    WHEN 'team_starter'  THEN 3
    WHEN 'team_pro'      THEN 3
    WHEN 'team_business' THEN 3
    ELSE 1
  END
$$;

-- 2. Returns the device limit for a specific user, based on their active subscription.
CREATE OR REPLACE FUNCTION public.device_limit_for_user(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.device_limit_for_plan(
    coalesce(
      (SELECT plan FROM public.subscriptions
        WHERE user_id = _user_id
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1),
      'free'
    )
  )
$$;

-- 3. Trigger: enforce the limit when a NEW device token is inserted.
--    A re-registration of an existing token (same user_id + token) is treated
--    as a refresh and allowed through.
CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_count integer;
  _limit integer;
  _already_registered boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.device_tokens
    WHERE user_id = NEW.user_id AND token = NEW.token
  ) INTO _already_registered;

  IF _already_registered THEN
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT token) INTO _existing_count
  FROM public.device_tokens
  WHERE user_id = NEW.user_id;

  _limit := public.device_limit_for_user(NEW.user_id);

  IF _existing_count >= _limit THEN
    RAISE EXCEPTION
      'device_limit_reached: plan allows % device(s); already registered %',
      _limit, _existing_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_device_limit ON public.device_tokens;
CREATE TRIGGER trg_enforce_device_limit
BEFORE INSERT ON public.device_tokens
FOR EACH ROW
EXECUTE FUNCTION public.enforce_device_limit();

-- 4. Lock down the helper functions: only the server / triggers should call them.
REVOKE EXECUTE ON FUNCTION public.device_limit_for_plan(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.device_limit_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_device_limit()    FROM PUBLIC, anon, authenticated;
