-- Make the team helpers bypass RLS internally to prevent recursion when
-- they are evaluated from within team_members / teams RLS policies.
CREATE OR REPLACE FUNCTION public.is_active_team_member(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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

-- Replace the teams SELECT policy to use the helper (no inline subquery
-- through team_members RLS).
DROP POLICY IF EXISTS team_select_own_or_member ON public.teams;
CREATE POLICY team_select_own_or_member ON public.teams
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_active_team_member(id, auth.uid())
);

-- Replace the teams UPDATE policy similarly.
DROP POLICY IF EXISTS team_update_owner_or_admin ON public.teams;
CREATE POLICY team_update_owner_or_admin ON public.teams
FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_team_admin(id, auth.uid())
);

-- Recreate get_my_team with RLS bypass too.
CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TABLE (
  id uuid,
  name text,
  plan text,
  owner_id uuid,
  current_period_end timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.plan::text, t.owner_id, t.current_period_end
  FROM public.teams t
  WHERE t.owner_id = uid
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.plan::text, t.owner_id, t.current_period_end
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = uid AND tm.status = 'active'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;

-- Tell PostgREST to reload the schema cache so get_my_team is callable now.
NOTIFY pgrst, 'reload schema';