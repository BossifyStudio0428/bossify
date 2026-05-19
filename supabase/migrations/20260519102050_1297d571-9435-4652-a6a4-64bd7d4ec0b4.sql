ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS payment_platform text
CHECK (payment_platform IN ('google_play', 'stripe'));