-- ============================================
-- 1. 先创建所有表
-- ============================================

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'team_starter' CHECK (plan IN ('team_starter', 'team_pro', 'team_business')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 32)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, email)
);

-- ============================================
-- 2. 启用 RLS
-- ============================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. 辅助函数
-- ============================================
CREATE OR REPLACE FUNCTION public.can_access_user_data(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = target_user_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = target_user_id
      AND tm1.status = 'active'
      AND tm2.status = 'active'
  );
END;
$$;

-- ============================================
-- 4. teams 策略
-- ============================================

CREATE POLICY "team_select_own_or_member"
ON public.teams
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = teams.id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "team_insert_owner"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "team_update_owner_or_admin"
ON public.teams
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = teams.id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
);

CREATE POLICY "team_delete_owner"
ON public.teams
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- ============================================
-- 5. team_members 策略
-- ============================================

CREATE POLICY "team_members_select_own_team"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "team_members_insert_owner_or_admin"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "team_members_update_owner_or_admin"
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "team_members_delete_owner_or_admin"
ON public.team_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.owner_id = auth.uid()
  )
);

-- ============================================
-- 6. team_invitations 策略
-- ============================================

CREATE POLICY "team_invitations_select_own_team"
ON public.team_invitations
FOR SELECT
TO authenticated
USING (
  invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_invitations.team_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

CREATE POLICY "team_invitations_insert_owner_or_admin"
ON public.team_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_invitations.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_invitations.team_id
      AND t.owner_id = auth.uid()
  )
);

CREATE POLICY "team_invitations_update_owner_or_admin"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_invitations.team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_invitations.team_id
      AND t.owner_id = auth.uid()
  )
);

-- ============================================
-- 7. 更新现有表 RLS 支持团队共享
-- ============================================

-- orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own or team orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own or team orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;
CREATE POLICY "Users can delete their own or team orders"
ON public.orders
FOR DELETE
TO authenticated
USING (public.can_access_user_data(user_id));

-- inventory
DROP POLICY IF EXISTS "Users can view their own inventory" ON public.inventory;
CREATE POLICY "Users can view their own or team inventory"
ON public.inventory
FOR SELECT
TO authenticated
USING (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can update their own inventory" ON public.inventory;
CREATE POLICY "Users can update their own or team inventory"
ON public.inventory
FOR UPDATE
TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can delete their own inventory" ON public.inventory;
CREATE POLICY "Users can delete their own or team inventory"
ON public.inventory
FOR DELETE
TO authenticated
USING (public.can_access_user_data(user_id));

-- customers
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
CREATE POLICY "Users can view their own or team customers"
ON public.customers
FOR SELECT
TO authenticated
USING (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
CREATE POLICY "Users can update their own or team customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;
CREATE POLICY "Users can delete their own or team customers"
ON public.customers
FOR DELETE
TO authenticated
USING (public.can_access_user_data(user_id));

-- services
DROP POLICY IF EXISTS "services_select_own" ON public.services;
CREATE POLICY "services_select_own_or_team"
ON public.services
FOR SELECT
TO authenticated
USING (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "services_update_own" ON public.services;
CREATE POLICY "services_update_own_or_team"
ON public.services
FOR UPDATE
TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "services_delete_own" ON public.services;
CREATE POLICY "services_delete_own_or_team"
ON public.services
FOR DELETE
TO authenticated
USING (public.can_access_user_data(user_id));

-- follow_ups
DROP POLICY IF EXISTS "follow_ups_select_own" ON public.follow_ups;
CREATE POLICY "follow_ups_select_own_or_team"
ON public.follow_ups
FOR SELECT
TO authenticated
USING (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "follow_ups_update_own" ON public.follow_ups;
CREATE POLICY "follow_ups_update_own_or_team"
ON public.follow_ups
FOR UPDATE
TO authenticated
USING (public.can_access_user_data(user_id))
WITH CHECK (public.can_access_user_data(user_id));

DROP POLICY IF EXISTS "follow_ups_delete_own" ON public.follow_ups;
CREATE POLICY "follow_ups_delete_own_or_team"
ON public.follow_ups
FOR DELETE
TO authenticated
USING (public.can_access_user_data(user_id));

-- ============================================
-- 8. 触发器
-- ============================================
DROP TRIGGER IF EXISTS set_teams_updated_at ON public.teams;
CREATE TRIGGER set_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();

DROP TRIGGER IF EXISTS set_team_members_updated_at ON public.team_members;
CREATE TRIGGER set_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();

DROP TRIGGER IF EXISTS set_team_invitations_updated_at ON public.team_invitations;
CREATE TRIGGER set_team_invitations_updated_at
BEFORE UPDATE ON public.team_invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();