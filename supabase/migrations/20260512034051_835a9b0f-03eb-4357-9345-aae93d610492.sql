create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_select_own" on public.device_tokens;
drop policy if exists "device_tokens_insert_own" on public.device_tokens;
drop policy if exists "device_tokens_update_own" on public.device_tokens;
drop policy if exists "device_tokens_delete_own" on public.device_tokens;

create policy "device_tokens_select_own"
on public.device_tokens
for select
to authenticated
using (auth.uid() = user_id);

create policy "device_tokens_insert_own"
on public.device_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "device_tokens_update_own"
on public.device_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "device_tokens_delete_own"
on public.device_tokens
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists device_tokens_user_id_idx on public.device_tokens(user_id);
create index if not exists device_tokens_updated_at_idx on public.device_tokens(updated_at desc);

create or replace function public.set_device_tokens_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_device_tokens_updated_at on public.device_tokens;
create trigger set_device_tokens_updated_at
before update on public.device_tokens
for each row
execute function public.set_device_tokens_updated_at();