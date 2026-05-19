ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_business_category_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_business_category_chk
      CHECK (business_category IS NULL OR business_category IN
        ('retail','education','beauty','property','fnb','freelance'));
  END IF;
END $$;