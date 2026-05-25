CREATE OR REPLACE FUNCTION public.trigger_push_kind(_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
begin
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets WHERE name = 'PUSH_WEBHOOK_SECRET' LIMIT 1;
  IF _secret IS NULL THEN
    RAISE NOTICE 'PUSH_WEBHOOK_SECRET not configured; skipping push.';
    RETURN;
  END IF;
  perform net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object('kind', _kind, 'broadcast', true)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_followup_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  r record;
begin
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets WHERE name = 'PUSH_WEBHOOK_SECRET' LIMIT 1;
  IF _secret IS NULL THEN
    RAISE NOTICE 'PUSH_WEBHOOK_SECRET not configured; skipping follow-up reminders.';
    RETURN;
  END IF;
  for r in
    select user_id
    from public.follow_ups
    where is_done = false
      and follow_up_date <= current_date
    group by user_id
  loop
    perform net.http_post(
      url := _endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', _secret
      ),
      body := jsonb_build_object(
        'kind', 'follow_up_reminder',
        'targetUserId', r.user_id
      )
    );
  end loop;
end;
$function$;