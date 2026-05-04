-- Profit tracking columns
alter table public.inventory
  add column if not exists cost_price numeric not null default 0;

alter table public.orders
  add column if not exists cost numeric not null default 0;

alter table public.orders
  add column if not exists gross_profit numeric not null default 0;
