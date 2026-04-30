-- Phase 4: Subscriptions + plan limits
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  plan text not null default 'free',
  status text not null default 'active',
  started_at timestamptz default now(),
  expires_at timestamptz,
  order_count int default 0,
  count_period_start timestamptz default date_trunc('month', now()),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription select" on public.subscriptions;
create policy "own subscription select" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "own subscription insert" on public.subscriptions;
create policy "own subscription insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own subscription update" on public.subscriptions;
create policy "own subscription update" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Backfill: ensure every existing user has a subscription row
insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from auth.users
on conflict (user_id) do nothing;

-- Update handle_new_user to also create subscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active') on conflict (user_id) do nothing;
  return new;
end; $$;

-- Auto-increment order_count, with monthly reset
create or replace function public.increment_order_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cur_period timestamptz := date_trunc('month', now());
begin
  -- Reset count if the stored period is older than current month
  update public.subscriptions
    set order_count = case
        when count_period_start is null or count_period_start < cur_period then 1
        else order_count + 1
      end,
      count_period_start = cur_period,
      updated_at = now()
    where user_id = new.user_id;
  return new;
end; $$;

drop trigger if exists on_order_created on public.orders;
create trigger on_order_created
  after insert on public.orders
  for each row execute function public.increment_order_count();

-- Admin upgrade requests
create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text default 'upgrade_request',
  status text default 'pending',
  notes text,
  created_at timestamptz default now()
);
alter table public.admin_requests enable row level security;
drop policy if exists "own admin requests" on public.admin_requests;
create policy "own admin requests" on public.admin_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
