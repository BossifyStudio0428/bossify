# Overview Redesign Plan

Scope: `src/components/RetailOverview.tsx` only (mounted from `src/routes/index.tsx`). No schema changes — reuses existing `orders` and `inventory` tables via the current Supabase client. i18n keys added to all 3 locales (EN/BM/中文).

## What stays

- Page header ("Overview" + subtitle) — refactored to sit alongside the new range selector.
- `SetupChecklist` (first-run guidance) — unchanged, still directly under header.
- Bottom nav (rendered by `AppShell`) and the primary **New sale** CTA at the bottom — unchanged.
- Quick action tiles (Products / Stock / Alerts / More) — kept as-is between Recent Orders and the New sale CTA. They're navigation, not stats, so no duplication.

## What's new

### 1. Date range selector (top-right)
- Options: **This Week**, **This Month** (default), **Custom** (date-picker sheet, same UX as Reports).
- Pattern mirrors `reports.tsx` so it feels native. State stored locally (no URL sync needed for now; can promote to search params later if requested).

### 2. 2×2 stat grid with real trend %
Each tile = value + trend chip (▲/▼ n.n% vs previous equivalent period, colored green/red). If previous-period denominator is 0 or no data → render `—`, never a fabricated number.

| Tile | Current-period value | Previous period |
|---|---|---|
| Total Sales (GMV) | `SUM(orders.amount)` in range, all statuses except cancelled | Same window shifted back by range length |
| Total Profit | `SUM(orderGrossProfit(...))` in range (reuses existing helper) | Same |
| Orders | `COUNT(orders)` in range | Same |
| Low Stock Items | `COUNT(inventory WHERE stock <= LOW_STOCK_THRESHOLD)` — **no trend** (point-in-time, not a period metric) | n/a |

Trend formula: `((current - previous) / previous) * 100`, rounded 1 dp. Only shown when `previous > 0`. Fetched with 2 parallel Supabase queries per period (orders + inventory count).

Previous-period window:
- **This Week** → previous 7 days before the current week's start.
- **This Month** → previous calendar month.
- **Custom** → same length shifted back by that length.

### 3. Recent Orders card
- Query: `orders` where `user_id = me` order by `created_at desc limit 3`.
- Row: avatar initial • customer_name / order code • status pill (Paid/Unpaid/Pending — reuses existing badge colors from `orders.tsx`) • amount.
- Header link **View all** → `/orders`.
- Tap on a row → `/orders/$orderId` (already-existing route).
- Empty state: single-line "No orders yet" copy.

### 4. Reconciling old suggestion + small stat cards (the ask in #5)

Current layout has:
- Big 2×1 (Sales today, Profit today) — **replaced** by the new 2×2 range grid (which covers Sales + Profit at higher-value granularity).
- Small 3-up (About to run out, Out of stock, Losing money) — partial overlap with new "Low Stock Items" tile:
  - "About to run out" (stock 1–5) → fully covered by **Low Stock Items** in the new grid → **removed**.
  - "Out of stock" (stock = 0) → semantically distinct (can't sell vs will soon), but Alerts screen already surfaces it and Today's Focus already calls it out → **removed here** to avoid triple-surfacing.
  - "Losing money" (cost > price) → unique signal not shown anywhere else → **kept**, but promoted into the Today's Focus rotation only. If there's a losing SKU it takes priority in the suggestion line (already the case in current logic).
- **Today's Focus** suggestion — **kept**. Still the single actionable nudge, still rotates through losing/out/low/top-seller. It's the one line that turns numbers into an action, and the new grid doesn't duplicate it.

Result: no metric is shown twice. New grid = period KPIs; Today's Focus = the one thing to do; Recent Orders = who bought what; Quick actions = navigation.

### Final vertical order
1. Header ("Overview" + subtitle) + range selector (right)
2. `SetupChecklist` (auto-hides when done)
3. 2×2 stat grid (Sales / Profit / Orders / Low Stock)
4. Today's Focus (kept, single line)
5. Recent Orders (3 rows + View all)
6. Quick actions (Products / Stock / Alerts / More)
7. New sale CTA

## Technical notes

- Single `useEffect` keyed on `user.id + range` runs 3 parallel queries: current-period orders, previous-period orders, inventory snapshot. Range-length arithmetic lives in a `rangeWindows(range)` helper returning `{ curStart, curEnd, prevStart, prevEnd }`.
- Trend chip is a small local component (`<TrendPill delta={number | null} />`) — returns `null` when delta is null, so the tile just shows the value cleanly.
- Custom range sheet reuses the same date-picker component already used in `reports.tsx` (no new deps).
- i18n keys added: `ro_range_week`, `ro_range_month`, `ro_range_custom`, `ro_total_sales`, `ro_total_profit`, `ro_orders`, `ro_low_stock_items`, `ro_recent_orders`, `ro_view_all`, `ro_no_orders`, `ro_vs_prev` — in EN/BM/中文. Existing `ro_*` keys that back removed tiles stay in the dictionary (harmless) so any other reference doesn't break; we can prune later.

## Out of scope

- No changes to Reports, Orders list, Alerts, or the Supabase schema.
- No new tables, no RLS changes, no edge function edits.
- Trend calculation is client-side over already-fetched rows — no SQL views needed.

Confirm and I'll implement.
