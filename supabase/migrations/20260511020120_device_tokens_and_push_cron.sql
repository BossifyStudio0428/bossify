-- Device tokens for FCM push (Android only for now)
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_tokens enable row level security;

create policy "device_tokens_select_own" on public.device_tokens
  for select using (auth.uid() = user_id);
create policy "device_tokens_insert_own" on public.device_tokens
  for insert with check (auth.uid() = user_id);
create policy "device_tokens_update_own" on public.device_tokens
  for update using (auth.uid() = user_id);
create policy "device_tokens_delete_own" on public.device_tokens
  for delete using (auth.uid() = user_id);

create index if not exists device_tokens_user_id_idx on public.device_tokens(user_id);

-- pg_cron schedules to fire push notifications via /api/public/send-push
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Default GUCs (overridable via ALTER DATABASE ... SET app.push_endpoint = ...)
do $$ begin
  perform set_config('app.push_endpoint',
    'https://project--db91ee30-ba9c-4741-9a03-2d8ed9ec2d81.lovable.app/api/public/send-push',
    false);
exception when others then null; end $$;

create or replace function public.trigger_push_kind(_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _endpoint text := current_setting('app.push_endpoint', true);
  _secret text := current_setting('app.push_secret', true);
begin
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

-- 09:00 MYT = 01:00 UTC  → morning summary
-- 10:00 MYT = 02:00 UTC  → unpaid reminder
-- 21:00 MYT = 13:00 UTC  → closing report
select cron.schedule('bossify_morning_summary', '0 1 * * *',
  $cron$select public.trigger_push_kind('morning_summary')$cron$);
select cron.schedule('bossify_unpaid_reminder', '0 2 * * *',
  $cron$select public.trigger_push_kind('unpaid_reminder')$cron$);
select cron.schedule('bossify_closing_report', '0 13 * * *',
  $cron$select public.trigger_push_kind('closing_report')$cron$);
