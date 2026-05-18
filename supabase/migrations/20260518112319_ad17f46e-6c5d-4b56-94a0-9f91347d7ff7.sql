CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  business_name text DEFAULT 'My Business',
  business_type text,
  whatsapp_number text,
  avatar_url text,
  is_admin boolean NOT NULL DEFAULT false,
  payment_method_1_type text,
  payment_method_1_number text,
  payment_method_1_name text,
  payment_method_1_qr_url text,
  payment_method_2_type text,
  payment_method_2_number text,
  payment_method_2_name text,
  payment_method_2_qr_url text,
  notif_new_order boolean NOT NULL DEFAULT true,
  notif_unpaid boolean NOT NULL DEFAULT true,
  notif_inventory boolean NOT NULL DEFAULT true,
  notif_morning boolean NOT NULL DEFAULT true,
  notif_evening boolean NOT NULL DEFAULT false,
  notif_milestone boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

DROP POLICY IF EXISTS "own profile select" ON public.profiles;
CREATE POLICY "own profile select"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own profile delete" ON public.profiles;
CREATE POLICY "own profile delete"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin read all profiles" ON public.profiles;
CREATE POLICY "admin read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, business_name)
  VALUES (NEW.id, coalesce(nullif(NEW.raw_user_meta_data ->> 'business_name', ''), 'My Business'))
  ON CONFLICT (id) DO UPDATE
  SET business_name = coalesce(nullif(EXCLUDED.business_name, ''), public.profiles.business_name);

  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_subscription();

INSERT INTO public.profiles (id, business_name)
SELECT u.id, coalesce(nullif(u.raw_user_meta_data ->> 'business_name', ''), 'My Business')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subscriptions (user_id, plan, status)
SELECT u.id, 'free', 'active'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;