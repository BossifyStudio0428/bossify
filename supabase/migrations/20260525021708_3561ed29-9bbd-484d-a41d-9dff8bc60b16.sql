CREATE OR REPLACE FUNCTION public.can_access_user_data(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL OR target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _actor_id = target_user_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = _actor_id
      AND tm2.user_id = target_user_id
      AND tm1.status = 'active'
      AND tm2.status = 'active'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.can_access_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid) TO service_role;