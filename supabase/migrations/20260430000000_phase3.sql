create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  language text default 'en',
  wa_order_template text,
  wa_reminder_template text,
  updated_at timestamptz default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists "own preferences" on public.user_preferences;
create policy "own preferences" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_preferences add column if not exists wa_order_template text;
alter table public.user_preferences add column if not exists wa_reminder_template text;
