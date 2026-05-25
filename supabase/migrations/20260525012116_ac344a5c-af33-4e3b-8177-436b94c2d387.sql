REVOKE EXECUTE ON FUNCTION public.can_access_user_data(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_user_data(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_user_data(UUID) FROM anon;