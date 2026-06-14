ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS order_form_show_stock boolean NOT NULL DEFAULT true;