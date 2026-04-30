-- Add Google Play billing tracking columns to subscriptions
alter table public.subscriptions
  add column if not exists provider text,
  add column if not exists provider_product_id text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_purchase_token text,
  add column if not exists current_period_end timestamptz;
