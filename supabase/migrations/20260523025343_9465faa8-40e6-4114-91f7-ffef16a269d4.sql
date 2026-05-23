ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'bossifystudio@gmail.com' LIMIT 1);
ALTER TABLE public.profiles ENABLE TRIGGER USER;