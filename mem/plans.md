---
name: Plans & Google Play SKUs
description: Bossify plan tiers, Google Play product IDs, and the hasFullAccess gating rule
type: feature
---
## Plan tiers (Subscription type `Plan = "free" | "pro" | "lifetime"`)

| Plan | Price | Google Play SKU | Type |
|---|---|---|---|
| Free | RM 0 | — | — |
| Pro Monthly | RM 49 / month | `bossify_pro` (base plan `monthly`) | Subscription |
| Pro Annual | RM 399 / year | `bossify_pro` (base plan `annual`) | Subscription |
| Lifetime | RM 1,499 one-time | `bossify_lifetime` | Non-consumable IAP |

## Gating rule
- `isPro` = subscription only.
- `isLifetime` = lifetime only.
- `hasFullAccess = isPro || isLifetime` — **use this for feature gates**.
- Lifetime is the strongest entitlement: `syncFromStore()` never downgrades a lifetime row to pro/free.
- Lifetime has no expiry — skip period-end checks when `plan === "lifetime"`.

## DB
`public.subscriptions` carries: `plan` (CHECK in free/pro/lifetime), provider_* fields, `lifetime_purchase_date`, `lifetime_google_token`.
