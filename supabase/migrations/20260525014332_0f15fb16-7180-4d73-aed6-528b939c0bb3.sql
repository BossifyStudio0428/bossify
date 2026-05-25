
-- 1) team_members: constrain role values + prevent role escalation to owner
DROP POLICY IF EXISTS team_members_insert_owner_or_admin ON public.team_members;
DROP POLICY IF EXISTS team_members_update_owner_or_admin ON public.team_members;

CREATE POLICY team_members_insert_owner_or_admin
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  role IN ('owner', 'admin', 'staff')
  AND (
    -- Team owner can grant any role
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
    )
    OR
    -- Admin (who is not the team owner) can only grant admin or staff, never owner
    (
      role IN ('admin', 'staff')
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = team_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role = 'admin'
          AND tm.status = 'active'
      )
    )
  )
);

CREATE POLICY team_members_update_owner_or_admin
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = ANY (ARRAY['owner','admin'])
      AND tm.status = 'active'
  )
)
WITH CHECK (
  role IN ('owner','admin','staff')
  AND (
    -- Team owner can set any role
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
    )
    OR
    -- Admins can only set admin/staff roles
    (
      role IN ('admin','staff')
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = team_members.team_id
          AND tm.user_id = auth.uid()
          AND tm.role = 'admin'
          AND tm.status = 'active'
      )
    )
  )
);

-- Same for invitations: admins cannot invite as owner
DROP POLICY IF EXISTS team_invitations_insert_owner_or_admin ON public.team_invitations;

CREATE POLICY team_invitations_insert_owner_or_admin
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  role IN ('owner','admin','staff')
  AND (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_invitations.team_id AND t.owner_id = auth.uid()
    )
    OR (
      role IN ('admin','staff')
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = team_invitations.team_id
          AND tm.user_id = auth.uid()
          AND tm.role = 'admin'
          AND tm.status = 'active'
      )
    )
  )
);

-- 2) orders: remove the unused anon insert policy. Online form submissions
-- go through the submitPublicOrder server function which uses the service role
-- key (bypassing RLS), so this anon policy is dead weight and would otherwise
-- allow anyone who knows a merchant's user_id to insert orders without ever
-- knowing the order form code.
DROP POLICY IF EXISTS "Public can insert online_form orders" ON public.orders;
