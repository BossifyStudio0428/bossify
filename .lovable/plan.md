## Restaurant Dine-in Order System (FnB)

A QR-code based dine-in flow: owner sets up tables → each table has a QR → customer scans, picks menu items, submits → owner gets notified → kitchen workflow → checkout & receipt → inventory auto-deducts.

### 1. New Database Tables

```sql
-- Tables (dine-in physical tables)
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  label text NOT NULL,              -- "Table 1", "T-A1"
  seats integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, label)
);

-- Dine-in tickets (one open ticket per table at a time)
CREATE TABLE public.dine_in_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',      -- open | paid | cancelled
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,                      -- cash | qr | bank
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each submission from a table (one ticket can have many submissions)
CREATE TABLE public.dine_in_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.dine_in_tickets ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'received',  -- received | preparing | ready | served
  note text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Line items
CREATE TABLE public.dine_in_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.dine_in_orders ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Plus GRANTs, RLS (owner-only for tickets/orders; **anon SELECT** on `restaurant_tables` by id and `inventory` already public via existing menu, **anon INSERT** for new tickets/orders scoped to a valid table_id → user_id lookup), update triggers, and a trigger that recalculates `dine_in_tickets.total_amount` when items change.

### 2. Public Customer Menu Route

- `src/routes/dine/$tableId.tsx` (public, no auth) — fetches table → resolves `user_id` → loads owner's inventory (menu) with photo/price → cart UI → submit creates `dine_in_orders` + items (auto-opens or attaches to existing open ticket).
- Server fns in `src/lib/dine.functions.ts` (publishable-key client; safe SELECT/INSERT).

### 3. Settings: Table Manager

- New route `src/routes/tables.tsx` (auth, FnB only):
  - Bulk create N tables, edit/delete, toggle active.
  - Each row shows QR (uses `qrcode` lib → already in deps, else add) pointing to `https://<published>/dine/<tableId>`.
  - Print all QRs button.

### 4. Kitchen / Orders Integration

- New route `src/routes/dine-in.tsx` — live list of open tickets grouped by table with status pills (Received → Preparing → Ready → Served) and "Checkout" action.
- Push notification on new `dine_in_orders` row via existing `notify_new_order_push` pattern (new trigger function `notify_new_dine_in_order`).
- Sidebar/nav entry added for FnB users only.

### 5. Checkout

- Inside `dine-in.tsx`: open ticket modal → list all items across submissions → total → payment method selector → "Mark Paid" updates ticket, then:
  - Creates a row in existing `orders` table (so it flows into reports/analytics) with `customer_name = "Table X"`.
  - Triggers existing `deduct_stock_on_order` (already deducts when Paid).
- "Send WhatsApp Receipt" button opens `wa.me` with formatted bill (optional phone input).

### 6. Inventory Auto-Deduct via Recipes

- New server fn `confirmDineInOrder`: when an order moves to `preparing` (or on Paid), for each line item:
  - If inventory item has linked recipe (via existing `recipes`/`ingredients`), deduct each ingredient by `qty * recipe_qty`.
  - Else fall back to deducting `inventory.stock` directly.
- Reuse logic similar to existing `deduct_stock_on_order` but recipe-aware.

### 7. i18n

- Add EN/MS/ZH keys for: tables, qr_code, dine_in, received, preparing, ready, served, checkout, mark_paid, send_receipt, scan_to_order, add_table, table_label, etc.

### 8. Files Touched

**New:**
- `src/routes/dine/$tableId.tsx` (public menu)
- `src/routes/tables.tsx` (table manager + QR)
- `src/routes/dine-in.tsx` (kitchen view + checkout)
- `src/lib/dine.functions.ts` (server fns)

**Edited:**
- `src/contexts/I18nContext.tsx` (translations)
- Sidebar/nav component (FnB-only entries)
- One DB migration with all tables, GRANTs, RLS, triggers

### Out of scope (ask if needed)
- Multi-language menu per item, modifiers/variants, splitting bills across guests, kitchen printer integration.
