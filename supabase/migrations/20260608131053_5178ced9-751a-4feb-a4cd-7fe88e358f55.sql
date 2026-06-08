CREATE OR REPLACE FUNCTION public.notify_new_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  _request_id bigint;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'PUSH_WEBHOOK_SECRET'
  LIMIT 1;

  IF _secret IS NULL THEN
    RAISE WARNING 'PUSH_WEBHOOK_SECRET not configured; skipping new order push for order %', NEW.id;
    RETURN NEW;
  END IF;

  -- Do NOT pass title/body. Let the send-push edge function pick the
  -- biz-type + language-aware template using the merchant's profile.
  SELECT net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object(
      'kind', 'new_order',
      'targetUserId', NEW.user_id,
      'link', '/orders',
      'vars', jsonb_build_object(
        'customer', coalesce(NEW.customer_name, ''),
        'product',  coalesce(NEW.product, ''),
        'amount',   to_char(coalesce(NEW.amount, 0), 'FM999999990.00')
      )
    ),
    timeout_milliseconds := 10000
  ) INTO _request_id;

  RAISE NOTICE 'Queued new order push for order %, request id %', NEW.id, _request_id;
  RETURN NEW;
END;
$function$;