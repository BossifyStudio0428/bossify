-- Tighten team role assignment so admins cannot promote staff to admin,
-- and owners cannot grant owner role to anyone other than themselves.
CREATE OR REPLACE FUNCTION public.can_manage_team_member(
  _team_id uuid,
  _target_user_id uuid,
  _target_role text,
  _actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_owner(_team_id, _actor_id)
    OR (
      _target_user_id IS DISTINCT FROM _actor_id
      AND _target_role = 'staff'
      AND public.is_team_admin(_team_id, _actor_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_assign_team_role(
  _team_id uuid,
  _target_user_id uuid,
  _role text,
  _actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role = 'owner' THEN
      _target_user_id = _actor_id
      AND public.is_team_owner(_team_id, _actor_id)
    WHEN _role = 'admin' THEN
      public.is_team_owner(_team_id, _actor_id)
    WHEN _role = 'staff' THEN
      public.is_team_owner(_team_id, _actor_id)
      OR (
        _target_user_id IS DISTINCT FROM _actor_id
        AND public.is_team_admin(_team_id, _actor_id)
      )
    ELSE false
  END;
$$;

-- Overload for invitations where a target user does not exist yet.
CREATE OR REPLACE FUNCTION public.can_assign_team_invitation_role(
  _team_id uuid,
  _role text,
  _actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role = 'admin' THEN public.is_team_owner(_team_id, _actor_id)
    WHEN _role = 'staff' THEN public.is_team_owner(_team_id, _actor_id) OR public.is_team_admin(_team_id, _actor_id)
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS team_members_update_owner_or_admin ON public.team_members;
CREATE POLICY team_members_update_owner_or_admin
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  public.can_manage_team_member(team_id, user_id, role, auth.uid())
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
  public.can_manage_team_member(team_id, user_id, role, auth.uid())
);

DROP POLICY IF EXISTS team_invitations_insert_owner_or_admin ON public.team_invitations;
CREATE POLICY team_invitations_insert_owner_or_admin
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_assign_team_invitation_role(team_id, role, auth.uid())
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
  public.can_assign_team_invitation_role(team_id, role, auth.uid())
);

REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_active_team_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_team_member(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_team_member(uuid, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_assign_team_role(uuid, uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_assign_team_invitation_role(uuid, text, uuid) FROM anon;