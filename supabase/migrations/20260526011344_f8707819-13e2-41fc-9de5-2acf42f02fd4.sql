CREATE OR REPLACE FUNCTION public.is_active_team_member(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _actor_id
      AND tm.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _actor_id
      AND tm.role = 'admin'
      AND tm.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = _team_id
      AND t.owner_id = _actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_user_data(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;