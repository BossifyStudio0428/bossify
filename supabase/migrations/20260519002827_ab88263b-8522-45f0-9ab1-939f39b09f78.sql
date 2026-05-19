GRANT EXECUTE ON FUNCTION public.handle_new_user_subscription() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO supabase_auth_admin;

-- Ensure the profile trigger is actually attached (it may have been dropped)
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();