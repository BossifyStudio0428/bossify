-- Revoke anon execute on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.get_my_team() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_user_data(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_user_data(uuid) TO authenticated;

-- Add INSERT policy for device_sessions so users can register their own sessions
CREATE POLICY "device_sessions_insert_own"
ON public.device_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "device_sessions_update_own"
ON public.device_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);