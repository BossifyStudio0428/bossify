ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_method_1_bank text,
  ADD COLUMN IF NOT EXISTS payment_method_2_bank text;