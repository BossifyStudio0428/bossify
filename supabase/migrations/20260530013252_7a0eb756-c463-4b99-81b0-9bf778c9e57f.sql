CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.profiles
  ALTER COLUMN notif_evening SET DEFAULT true;

UPDATE public.profiles
SET notif_evening = true
WHERE notif_evening = false;

CREATE OR REPLACE FUNCTION public.trigger_push_kind(_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE WARNING 'PUSH_WEBHOOK_SECRET not configured; skipping scheduled push kind %', _kind;
    RETURN;
  END IF;

  SELECT net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object('kind', _kind, 'broadcast', true),
    timeout_milliseconds := 10000
  ) INTO _request_id;

  RAISE NOTICE 'Queued scheduled push kind %, request id %', _kind, _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_push_kind(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_followup_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  _request_id bigint;
  r record;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'PUSH_WEBHOOK_SECRET'
  LIMIT 1;

  IF _secret IS NULL THEN
    RAISE WARNING 'PUSH_WEBHOOK_SECRET not configured; skipping follow-up reminders';
    RETURN;
  END IF;

  FOR r IN
    SELECT user_id
    FROM public.follow_ups
    WHERE is_done = false
      AND follow_up_date <= current_date
    GROUP BY user_id
  LOOP
    SELECT net.http_post(
      url := _endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', _secret
      ),
      body := jsonb_build_object(
        'kind', 'follow_up_reminder',
        'targetUserId', r.user_id
      ),
      timeout_milliseconds := 10000
    ) INTO _request_id;

    RAISE NOTICE 'Queued follow-up push for user %, request id %', r.user_id, _request_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_followup_reminders() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_new_order_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  _title text := 'New order received! 🛍️';
  _body text;
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

  _body := concat_ws(' · ', nullif(NEW.customer_name, ''), nullif(NEW.product, ''), 'RM ' || to_char(coalesce(NEW.amount, 0), 'FM999999990.00'));

  SELECT net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object(
      'kind', 'new_order',
      'targetUserId', NEW.user_id,
      'title', _title,
      'body', _body,
      'link', '/orders'
    ),
    timeout_milliseconds := 10000
  ) INTO _request_id;

  RAISE NOTICE 'Queued new order push for order %, request id %', NEW.id, _request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_order_push ON public.orders;
CREATE TRIGGER trg_notify_new_order_push
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_order_push();

REVOKE EXECUTE ON FUNCTION public.notify_new_order_push() FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bossify_morning_summary') THEN
    PERFORM cron.unschedule('bossify_morning_summary');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bossify_unpaid_reminder') THEN
    PERFORM cron.unschedule('bossify_unpaid_reminder');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bossify_closing_report') THEN
    PERFORM cron.unschedule('bossify_closing_report');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-followup-reminders-daily') THEN
    PERFORM cron.unschedule('send-followup-reminders-daily');
  END IF;
END $$;

SELECT cron.schedule('bossify_morning_summary', '0 1 * * *', $$SELECT public.trigger_push_kind('morning_summary');$$);
SELECT cron.schedule('bossify_unpaid_reminder', '0 2 * * *', $$SELECT public.trigger_push_kind('unpaid_reminder');$$);
SELECT cron.schedule('bossify_closing_report', '0 13 * * *', $$SELECT public.trigger_push_kind('closing_report');$$);
SELECT cron.schedule('send-followup-reminders-daily', '0 1 * * *', $$SELECT public.send_followup_reminders();$$);