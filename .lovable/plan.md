# Fix: "Failed to save order" on /order/{code}

## What's actually wrong

The public order form loads correctly (logo, business name, products all
show). It fails only on **submit** with `Failed to save order`.

Root cause: your live app's data lives in a backend (call it **Backend A**,
ref `knouahqwazerjiyiqgmh`) that predates this Lovable project. The
migration tools in this environment are bound to a **different** backend
(**Backend B**, ref `utqlrdbhvnugqvemjegi`). Every order-form migration I
ran earlier landed in Backend B — none of them reached Backend A.

I verified this directly just now: an anonymous INSERT into the `orders`
table on Backend A returns
`new row violates row-level security policy for table "orders"`.
That is exactly the "Failed to save order" you are seeing.

The earlier fix (pointing the public form server function at Backend A's
anon key) was correct — but Backend A still has no policies that let an
un-logged-in customer insert an order, so the database rejects it.

## The fix (one-time SQL on Backend A)

Run the SQL below **once** in the Supabase SQL editor of Backend A
(`knouahqwazerjiyiqgmh`). It is idempotent (safe to re-run) and only adds
the missing public-access policies. It does not touch your existing data,
sellers, or orders.

```sql
-- Ensure order-form columns exist on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS order_form_code text,
  ADD COLUMN IF NOT EXISTS order_form_enabled boolean NOT NULL DEFAULT true;

-- Track where each order came from
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_source_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_source_check
      CHECK (order_source IN ('manual', 'online_form'));
  END IF;
END $$;

-- Public read: seller profile (only when their form is enabled)
DROP POLICY IF EXISTS "Public can read enabled order form profiles" ON public.profiles;
CREATE POLICY "Public can read enabled order form profiles"
  ON public.profiles FOR SELECT TO anon
  USING (order_form_enabled IS TRUE AND order_form_code IS NOT NULL);

-- Public read: that seller's inventory
DROP POLICY IF EXISTS "Public can read enabled seller inventory" ON public.inventory;
CREATE POLICY "Public can read enabled seller inventory"
  ON public.inventory FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = inventory.user_id
      AND p.order_form_enabled IS TRUE
      AND p.order_form_code IS NOT NULL
  ));

-- Public INSERT: only online_form orders for enabled sellers
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

-- Public customer upsert (the form also records the customer)
DROP POLICY IF EXISTS "Public can read customers for online form" ON public.customers;
CREATE POLICY "Public can read customers for online form"
  ON public.customers FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = customers.user_id
      AND p.order_form_enabled IS TRUE
      AND p.order_form_code IS NOT NULL
  ));

DROP POLICY IF EXISTS "Public can insert customers for online form" ON public.customers;
CREATE POLICY "Public can insert customers for online form"
  ON public.customers FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = customers.user_id
      AND p.order_form_enabled IS TRUE
      AND p.order_form_code IS NOT NULL
  ));

DROP POLICY IF EXISTS "Public can update customers for online form" ON public.customers;
CREATE POLICY "Public can update customers for online form"
  ON public.customers FOR UPDATE TO anon
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = customers.user_id
      AND p.order_form_enabled IS TRUE
      AND p.order_form_code IS NOT NULL
  ));
```

## Where to run it

Backend A's Supabase SQL Editor (project ref `knouahqwazerjiyiqgmh`). Paste
→ Run. Only needed once. After that:

- Customers submitting `/order/{code}` succeed instantly.
- The order appears in your **Orders** tab with the green "Online Form" badge.
- You get the push notification "New order received!".

## After you approve

Beyond surfacing this SQL, I will also make one small code improvement so
future failures aren't a generic message:

- Show the real database error inside the alert on submit failure (so any
  next issue is diagnosable from the screenshot alone).
- No other code changes — the server function already points at the
  correct backend.

## Why I can't run this SQL for you

The migration / database tools available in this environment are wired to
Backend B. Backend A predates this Lovable project, so its SQL editor is
the only place these policies can be created from. One paste-and-run there
and `/order/{code}` is permanently fixed.