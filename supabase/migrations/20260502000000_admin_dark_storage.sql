-- Profile columns
alter table public.profiles add column if not exists business_name text default 'My Business';
alter table public.profiles add column if not exists business_type text;
alter table public.profiles add column if not exists whatsapp_number text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_admin boolean default false;

-- User preferences theme
alter table public.user_preferences add column if not exists theme text default 'light';

-- Storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar own insert" on storage.objects;
create policy "avatar own insert" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatar own delete" on storage.objects;
create policy "avatar own delete" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Helper: is current user admin (security definer to avoid RLS recursion)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "admin read all profiles" on public.profiles;
create policy "admin read all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "admin update all subscriptions" on public.subscriptions;
create policy "admin update all subscriptions" on public.subscriptions
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read all subscriptions" on public.subscriptions;
create policy "admin read all subscriptions" on public.subscriptions
  for select using (public.is_admin());

drop policy if exists "admin read all orders" on public.orders;
create policy "admin read all orders" on public.orders
  for select using (public.is_admin());

create or replace view public.admin_users_view as
select
  p.id,
  p.business_name,
  p.business_type,
  p.is_admin,
  p.created_at,
  s.plan,
  s.status,
  s.expires_at,
  s.order_count,
  (select count(*) from public.orders o where o.user_id = p.id) as total_orders,
  (select coalesce(sum(o.amount),0) from public.orders o where o.user_id = p.id and o.status = 'Paid') as total_revenue
from public.profiles p
left join public.subscriptions s on s.user_id = p.id;

grant select on public.admin_users_view to authenticated;
