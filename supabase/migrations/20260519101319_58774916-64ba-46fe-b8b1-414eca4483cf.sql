
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS lifetime_email text,
  ADD COLUMN IF NOT EXISTS lifetime_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifetime_device_limit integer DEFAULT 1;
