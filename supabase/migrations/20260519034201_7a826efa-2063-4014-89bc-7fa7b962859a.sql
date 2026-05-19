ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_category text;
NOTIFY pgrst, 'reload schema';