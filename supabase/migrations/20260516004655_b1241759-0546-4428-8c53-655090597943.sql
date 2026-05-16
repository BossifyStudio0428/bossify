-- Create subscriptions table with lifetime support baked in
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','lifetime')),
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz,
  expires_at timestamptz,
  order_count integer NOT NULL DEFAULT 0,
  inventory_created_total integer NOT NULL DEFAULT 0,
  count_period_start timestamptz DEFAULT date_trunc('month', now()),
  last_reset_at timestamptz,
  provider text,
  provider_product_id text,
  provider_transaction_id text,
  provider_purchase_token text,
  current_period_end timestamptz,
  lifetime_purchase_date timestamptz,
  lifetime_google_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_insert_own" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscriptions_update_own" ON public.subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create a free subscription row for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_subscriptions_updated_at();