-- Add last_reset_at column to subscriptions for monthly counter reset tracking.
alter table public.subscriptions
  add column if not exists last_reset_at timestamptz default now();

-- Backfill existing rows so the column is not null.
update public.subscriptions
   set last_reset_at = coalesce(last_reset_at, count_period_start, now())
 where last_reset_at is null;
