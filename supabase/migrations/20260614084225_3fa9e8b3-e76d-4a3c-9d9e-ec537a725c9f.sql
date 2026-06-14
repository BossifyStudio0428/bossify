REVOKE ALL ON FUNCTION public.cleanup_customer_related_records() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_customer_related_records() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_customer_related_records() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_customer_related_records() TO service_role;