# Customers Retail Redesign

## Investigation findings

**Data model (via live DB inspection):**

- `public.customers` real columns: `id, user_id, name, phone, total_orders, total_spent, last_order_at, created_at, updated_at, package_id, package_name, interested_listing_id`.
- `customer_status` and `remarks` **do not exist in the database** — the client TypeScript type marks them optional, and every `.update({ customer_status })` / `.update({ remarks })` call has been silently erroring for months. So `customer_status` is dead data and nothing depends on it in the DB.
- `follow_ups` is a real table (`customer_id`, `follow_up_date`, `note`, `is_done`) and is actively used — deleting a customer already cascades follow-up cleanup. Data model is fine as a "remind me to check in" note; no schema change needed to repurpose it.

**Code touch-points:**

- `src/routes/customers.tsx` — status filter tabs (line 412-428), status pill on each card (line 610-616), `cycleStatus` writer (line 80-89).
- `src/routes/customer.$customerId.tsx` — status pill in header (line 206-211), `cycleStatus` writer (line 122-130), Follow-up Reminder section (line 51-55, 142-164, and its JSX).
- Card tap → `/customer/$customerId` **is already a `<Link>`** (line 557-560); it opens the detail page in view mode. Item 1 of the request is already the current behavior. The "..." menu offers Edit/Delete on top of that. **No nav change needed** unless a specific broken path is identified — please confirm what you were seeing.
- `CUSTOMER_STATUS_*` are referenced by `CasesKanban`, `pipeline-overview`, `services-summary`, `renewal.$id` — all Education/Property surfaces, all hidden under `RETAIL_ONLY_MODE`. Safe to keep the types & imports intact; only the Retail-visible UI needs to lose the status.

**Follow-up Reminder direction:** `follow_ups` already stores `note`, `follow_up_date`, `is_done` — exactly the shape needed for "remind me to check in with this customer". No pipeline coupling in retail. Repurpose (relabel + reuse) rather than remove.

## Changes

**Retail-only (`bizType === 'retail'` / `RETAIL_ONLY_MODE`) — nothing else touched:**

1. **`customers.tsx` list**
   - Hide the status filter row (Enquiry / In Progress / Completed / Rejected + "All statuses"). Keep search, date filter, sort tabs untouched.
   - Remove the status pill button + `cycleStatus` handler from each card. Right column keeps `RM {total_spent}` and adds an auto-computed badge:
     - `total_orders >= 2` → **Repeat** (primary tint)
     - `total_orders === 1` → **New** (emerald tint)
     - `total_orders === 0` → no badge
     - If the customer is in the top 20% by `total_spent` among the current visible list AND `total_spent > 0` → **Top Spender** overrides Repeat/New (amber tint). Computed client-side from the already-loaded rows; no query.
   - Card body tap still opens `/customer/$customerId` (already works). Kebab menu keeps Edit / Delete / WhatsApp.

2. **`customer.$customerId.tsx` detail (retail path)**
   - Replace the manual status pill under the customer name with the same auto-computed badge (New / Repeat / Top Spender), using the customer's own `total_orders` and `total_spent`. For Top Spender at detail level, use `total_spent >= 500` as the retail threshold (no cohort available on a single-record view). Purely presentational.
   - Delete `cycleStatus` handler on this page.
   - Rename the "Follow-up Reminder" section to **"Check-in Reminder"** (EN) / **"Peringatan Semak"** (BM) / **"跟进提醒"** (ZH). Same UI, same `follow_ups` writes — only the label + helper copy change. Existing rows continue to render.
   - Remarks, Total Orders / Spent / Member since cards, Order History, WhatsApp / Edit / Delete: unchanged.

3. **Non-retail verticals**
   - `bizType !== 'retail'` (Education, Property, etc.) still shows the old status pill, filter tabs, and "Follow-up Reminder" wording. Reversible: flip `RETAIL_ONLY_MODE` off and everything comes back.

**No changes to:** `CustomerRow` type, `CustomerStatus` type, `follow_ups` schema, `CasesKanban`, `pipeline-overview`, `services-summary`, `renewal.$id`.

## SQL (provided separately — for you to run manually)

Two dead-column cleanups that are strictly optional. Recommended, since the client type still mentions them and someone editing later may re-add write calls. Skip if you'd rather leave the DB alone:

```sql
-- Only if you want to formalise that remarks and customer_status are gone.
-- Both are currently absent from public.customers; these are no-op-safe.
ALTER TABLE public.customers DROP COLUMN IF EXISTS customer_status;
ALTER TABLE public.customers DROP COLUMN IF EXISTS remarks;
```

**⚠ Remarks caveat:** The Remarks textarea on Customer Detail is in the "keep unchanged" list, but writes to `customers.remarks` have been silently failing (column missing). If you want Remarks to actually persist, we need this migration instead — please confirm which you want:

```sql
-- Adds a real remarks column so the existing UI works.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS remarks text;
```

If you approve adding `remarks`, I'll leave the Remarks UI as-is and it will start persisting. If not, I'll remove the Remarks section in the same patch so we're not shipping a broken input.

## Open confirmations before I code

1. **Nav item #1** — card tap already opens Customer Detail. Is there a specific place you saw it going to Edit first (e.g. via a specific button)? If yes, tell me where and I'll fix that path.
2. **Remarks** — add real `remarks` column (recommended, keeps your listed requirement), or drop the section entirely?
3. **Top Spender rule** — OK with "top 20% of currently visible list by spend, must have spent > 0" on the list, and `total_spent >= 500 RM` on the detail page? Or give me a different threshold.

I won't touch code until you answer these three.
