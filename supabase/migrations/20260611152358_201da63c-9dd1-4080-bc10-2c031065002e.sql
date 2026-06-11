ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS rate_type text DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS addons jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS intake text,
  ADD COLUMN IF NOT EXISTS requirements text,
  ADD COLUMN IF NOT EXISTS turnaround_days integer,
  ADD COLUMN IF NOT EXISTS portfolio_links jsonb DEFAULT '[]'::jsonb;