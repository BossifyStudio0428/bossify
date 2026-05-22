-- =====================================================================
-- Public Order Form — manual migration
-- Run this in your external SQL editor if the live backend is missing
-- the public order form fields/tables.
-- =====================================================================

-- 1) profiles: unique public code + enabled flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS order_form_code text,
  ADD COLUMN IF NOT EXISTS order_form_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_order_form_code_key'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_order_form_code_key UNIQUE (order_form_code);
  END IF;
END $$;

UPDATE public.profiles
SET order_form_code = lower(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
WHERE order_form_code IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN order_form_code SET DEFAULT lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

CREATE INDEX IF NOT EXISTS profiles_order_form_code_idx
  ON public.profiles(order_form_code)
  WHERE order_form_code IS NOT NULL;

-- 2) orders: create if missing + track source
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  customer_name text NOT NULL,
  phone text,
  product text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Unpaid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_check CHECK (status IN ('Unpaid', 'Paid', 'Pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_source_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_source_check CHECK (order_source IN ('manual', 'online_form'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx
  ON public.orders(user_id, created_at DESC);

-- 3) customers: create if missing for automatic customer records
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_user_id_phone_idx
  ON public.customers(user_id, phone)
  WHERE phone IS NOT NULL;

-- 4) inventory: create if missing so products can appear in public forms
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_user_id_name_idx
  ON public.inventory(user_id, name);

-- 5) Row level security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Seller access: own data only
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;
CREATE POLICY "Users can delete their own orders"
  ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
CREATE POLICY "Users can view their own customers"
  ON public.customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own customers" ON public.customers;
CREATE POLICY "Users can create their own customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
CREATE POLICY "Users can update their own customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;
CREATE POLICY "Users can delete their own customers"
  ON public.customers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own inventory" ON public.inventory;
CREATE POLICY "Users can view their own inventory"
  ON public.inventory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own inventory" ON public.inventory;
CREATE POLICY "Users can create their own inventory"
  ON public.inventory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own inventory" ON public.inventory;
CREATE POLICY "Users can update their own inventory"
  ON public.inventory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own inventory" ON public.inventory;
CREATE POLICY "Users can delete their own inventory"
  ON public.inventory FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Public customer access: enabled order form links only
DROP POLICY IF EXISTS "Public can read enabled order form profiles" ON public.profiles;
CREATE POLICY "Public can read enabled order form profiles"
  ON public.profiles FOR SELECT TO anon
  USING (order_form_enabled IS TRUE AND order_form_code IS NOT NULL);

DROP POLICY IF EXISTS "Public can read enabled seller inventory" ON public.inventory;
CREATE POLICY "Public can read enabled seller inventory"
  ON public.inventory FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = inventory.user_id
        AND p.order_form_enabled IS TRUE
        AND p.order_form_code IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Public can insert online_form orders" ON public.orders;
CREATE POLICY "Public can insert online_form orders"
  ON public.orders FOR INSERT TO anon
  WITH CHECK (
    order_source = 'online_form'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = orders.user_id
        AND p.order_form_enabled IS TRUE
        AND p.order_form_code IS NOT NULL
    )
  );