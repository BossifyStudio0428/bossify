create or replace function public.trigger_push_kind(_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text := current_setting('app.push_secret', true);
begin
  perform net.http_post(
    url := _endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(_secret, '')
    ),
    body := jsonb_build_object('kind', _kind, 'broadcast', true)
  );
end;
$$;