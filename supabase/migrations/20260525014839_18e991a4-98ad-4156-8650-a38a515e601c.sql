-- Harden profile creation against self-assigned admin access
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND coalesce(is_admin, false) = false
);

-- Keep profile updates owner-scoped and prevent admin flag changes via RLS as an extra guard
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = public.is_admin()
);

-- Protected helpers for team access decisions. These avoid recursive RLS checks
-- and centralize role-escalation constraints.
CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = _team_id
      AND t.owner_id = _actor_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_team_member(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _actor_id
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(_team_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _actor_id
      AND tm.role = 'admin'
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_member(_team_id uuid, _target_user_id uuid, _actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_owner(_team_id, _actor_id)
    OR (
      _target_user_id IS DISTINCT FROM _actor_id
      AND public.is_team_admin(_team_id, _actor_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_assign_team_role(_team_id uuid, _target_user_id uuid, _role text, _actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _role = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])
    AND (
      public.is_team_owner(_team_id, _actor_id)
      OR (
        _target_user_id IS DISTINCT FROM _actor_id
        AND _role = ANY (ARRAY['admin'::text, 'staff'::text])
        AND public.is_team_admin(_team_id, _actor_id)
      )
    );
$$;

-- Replace team member policies with non-recursive, escalation-safe rules.
DROP POLICY IF EXISTS team_members_select_own_team ON public.team_members;
CREATE POLICY team_members_select_own_team
ON public.team_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR invited_by = auth.uid()
  OR public.is_active_team_member(team_id, auth.uid())
);

DROP POLICY IF EXISTS team_members_insert_owner_or_admin ON public.team_members;
CREATE POLICY team_members_insert_owner_or_admin
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_assign_team_role(team_id, user_id, role, auth.uid())
);

DROP POLICY IF EXISTS team_members_update_owner_or_admin ON public.team_members;
CREATE POLICY team_members_update_owner_or_admin
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  public.can_manage_team_member(team_id, user_id, auth.uid())
)
WITH CHECK (
  public.can_assign_team_role(team_id, user_id, role, auth.uid())
);

DROP POLICY IF EXISTS team_members_delete_owner_or_admin ON public.team_members;
CREATE POLICY team_members_delete_owner_or_admin
ON public.team_members
FOR DELETE
TO authenticated
USING (
  public.can_manage_team_member(team_id, user_id, auth.uid())
);

-- Tighten invitation role changes and allow owners/admins to revoke invitations.
DROP POLICY IF EXISTS team_invitations_insert_owner_or_admin ON public.team_invitations;
CREATE POLICY team_invitations_insert_owner_or_admin
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_assign_team_role(team_id, NULL, role, auth.uid())
);

DROP POLICY IF EXISTS team_invitations_update_owner_or_admin ON public.team_invitations;
CREATE POLICY team_invitations_update_owner_or_admin
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  public.is_team_owner(team_id, auth.uid())
  OR public.is_team_admin(team_id, auth.uid())
)
WITH CHECK (
  public.can_assign_team_role(team_id, NULL, role, auth.uid())
);

DROP POLICY IF EXISTS team_invitations_delete_owner_or_admin ON public.team_invitations;
CREATE POLICY team_invitations_delete_owner_or_admin
ON public.team_invitations
FOR DELETE
TO authenticated
USING (
  public.is_team_owner(team_id, auth.uid())
  OR public.is_team_admin(team_id, auth.uid())
);