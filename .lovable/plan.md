## Goal
Introduce a third plan — **Lifetime Deal (RM 1,499, one-time, never expires)** — alongside existing Free and Pro Monthly/Annual plans. Use existing i18n + subscription infrastructure. Product ID: `bossify_lifetime`.

## 1. Database (one migration)

The app already stores plan state in the `subscriptions` table (not `profiles`). Keep it there — single source of truth, matches existing code.

Migration:
- Add `lifetime_purchase_date timestamptz null` to `public.subscriptions`
- Add `lifetime_google_token text null` to `public.subscriptions`
- Drop the existing CHECK constraint on `plan` (if any) and re-add allowing values: `'free' | 'pro' | 'lifetime'`

No new RLS needed (existing policies cover all columns).

## 2. Billing layer (`src/lib/billing.ts`)

Add one-time IAP support next to the existing subscription logic:

- Export `LIFETIME_PRODUCT_ID = "bossify_lifetime"` and `LIFETIME_FALLBACK_PRICE = "RM 1,499"`.
- Register the lifetime product in `initBilling()` as `ProductType.NON_CONSUMABLE` on `Platform.GOOGLE_PLAY`.
- Extend `queryProductDetails()` to also return the lifetime localized price (new return type entry, plan key `"lifetime"`).
- New `purchaseLifetime(onSuccess, onError)` mirroring `purchasePlan` but ordering the lifetime offer and resolving with a `PurchaseReceipt` that carries `productId: "bossify_lifetime"`.
- Extend `verifyActiveSubscription()` (or add `verifyLifetimeOwnership()`) to also check ownership of the non-consumable.
- Extend `tryNativeRestore()` to also detect owned lifetime product.
- `transaction.finish?.()` is already called in the global `approved` handler — works for non-consumables.

## 3. Subscription state (`src/contexts/SubscriptionContext.tsx`)

- Change `Plan` type to `"free" | "pro" | "lifetime"`.
- Add `isLifetime: boolean` and `hasFullAccess: boolean` (`= isPro || isLifetime`) to the context value.
- In `refresh()`, skip the period-expiry check when `plan === "lifetime"` (lifetime never expires).
- In `syncFromStore()`:
  - Check lifetime ownership first → if owned, upsert `{ plan: "lifetime", lifetime_purchase_date, lifetime_google_token: purchaseToken, provider: "google_play", provider_product_id: "bossify_lifetime" }`.
  - Otherwise fall back to current subscription check.
  - Never downgrade `lifetime` → `free`/`pro`.
- Expose helper through `useSubscription()` so callers can switch from `isPro` to `hasFullAccess`.

## 4. Replace scattered plan checks

Replace `isPro` (or `plan === "pro"`) with `hasFullAccess` in feature gates across:
- `src/routes/reports.tsx`
- `src/routes/profile.tsx`
- `src/routes/inventory.tsx`
- `src/routes/index.tsx`
- `src/routes/orders.tsx`
- `src/routes/new-order.tsx`

Keep `isPro` only where it's a UI-cosmetic "is on Pro subscription" badge (the Plans page itself).

## 5. Plans screen (`src/routes/plans.tsx`)

Add a 3rd card after Pro:

- **Lifetime Deal** card with gold gradient border (`from-amber-400 via-amber-300 to-yellow-500`), "Best Value" badge.
- Shows store-localized price (fallback `RM 1,499`), label "One-time payment".
- Feature list = all Pro features + new translation "Never pay again".
- Button:
  - If `isLifetime` → disabled "Already Active ✓" (gold).
  - Otherwise → "Get Lifetime Access — RM 1,499", calls `purchaseLifetime()`.
- On success: upsert to Supabase with `plan: "lifetime"`, call `refresh()`, show success toast, fire `notifySituation` milestone (`Welcome to Lifetime ✦`), `dedupeKey: lifetime_<token>`.
- On cancel/error: same handling as existing Pro purchase (toast + reset, no DB write).
- Loading state guards double-tap via existing `submitting` flag (rename to `submittingPlan: "pro" | "lifetime" | null` so the two buttons don't both grey out simultaneously).
- Update Restore Purchases handler to detect lifetime receipts (productId === `bossify_lifetime`) and upsert plan `"lifetime"` accordingly.
- Current Plan banner: when `isLifetime`, show gold styling + "Lifetime ⚡" badge.

## 6. Home screen plan badge (`src/routes/index.tsx`)

If `isLifetime`, render the "Lifetime ⚡" badge using the new i18n key (`plan_badge_lifetime`).

## 7. i18n keys (`src/contexts/I18nContext.tsx`)

Add in all three language dicts (`en`, `ms`, `zh`):

| Key | EN | MS | 中文 |
|---|---|---|---|
| `lifetime_plan` | Lifetime Deal | Tawaran Seumur Hidup | 终身方案 |
| `one_time_payment` | One-time payment | Bayaran sekali sahaja | 一次性付款 |
| `best_value` | Best Value | Paling Berbaloi | 最超值 |
| `never_pay_again` | Never pay again | Tidak perlu bayar lagi selamanya | 永久无需再付费 |
| `get_lifetime_access` | Get Lifetime Access | Dapatkan Akses Seumur Hidup | 获取终身使用权 |
| `already_active` | Already Active | Sudah Aktif | 已激活 |
| `plan_badge_lifetime` | Lifetime ⚡ | Seumur Hidup ⚡ | 终身版 ⚡ |
| `welcome_to_lifetime` | Welcome to Lifetime ✦ | Selamat datang ke Seumur Hidup ✦ | 欢迎使用终身版 ✦ |
| `lifetime_restored` | Lifetime access restored | Akses Seumur Hidup dipulihkan | 终身使用权已恢复 |

## 8. Google Play Console (manual, outside code)

Tell user once code ships:
- Play Console → Monetize → In-app products → create **`bossify_lifetime`**, non-consumable managed product, price RM 1,499.
- Roll out to same testing track as existing subscriptions.

## Verification

After implementation:
1. Build passes typecheck (`Plan` union widened cleanly).
2. Plans page renders three cards on web preview using fallback prices.
3. `hasFullAccess` gates work for both `"pro"` and `"lifetime"` users (manually flip a row in `subscriptions` to test).
4. Re-open app with `plan: "lifetime"` → no expiry downgrade, badge shows Lifetime.

## Out of scope (not in this change)

- Server-side Google Play receipt verification (already absent for Pro; same trust model).
- RTDN webhook for lifetime refunds (Google rarely revokes non-consumables; can be added later).
- Pricing/discount A/B testing UI.
