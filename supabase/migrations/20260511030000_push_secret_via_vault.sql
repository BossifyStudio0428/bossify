-- Use Supabase Vault instead of GUC (ALTER DATABASE SET is denied on Lovable Cloud)
create extension if not exists supabase_vault with schema vault;

create or replace function public.trigger_push_kind(_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _endpoint text := current_setting('app.push_endpoint', true);
  _secret text;
begin
  select decrypted_secret into _secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret'
  limit 1;

  if _endpoint is null or _endpoint = '' then return; end if;
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
