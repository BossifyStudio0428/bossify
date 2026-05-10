-- Notification preferences (per-user toggles)
alter table public.profiles add column if not exists notif_new_order boolean not null default true;
alter table public.profiles add column if not exists notif_unpaid boolean not null default true;
alter table public.profiles add column if not exists notif_inventory boolean not null default true;
alter table public.profiles add column if not exists notif_morning boolean not null default true;
alter table public.profiles add column if not exists notif_evening boolean not null default false;
alter table public.profiles add column if not exists notif_milestone boolean not null default true;
