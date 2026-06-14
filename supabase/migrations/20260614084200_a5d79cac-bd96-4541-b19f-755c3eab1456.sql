CREATE OR REPLACE FUNCTION public.cleanup_customer_related_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_phone text := regexp_replace(coalesce(OLD.phone, ''), '\D', '', 'g');
BEGIN
  DELETE FROM public.follow_ups
  WHERE user_id = OLD.user_id
    AND customer_id = OLD.id;

  DELETE FROM public.orders
  WHERE user_id = OLD.user_id
    AND (
      (_old_phone <> '' AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = _old_phone)
      OR (
        _old_phone = ''
        AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = ''
        AND lower(btrim(customer_name)) = lower(btrim(OLD.name))
      )
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_customer_related_records ON public.customers;
CREATE TRIGGER trg_cleanup_customer_related_records
AFTER DELETE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_customer_related_records();