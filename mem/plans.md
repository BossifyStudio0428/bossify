---
name: Plans & Google Play SKUs
description: Bossify plan tiers, Google Play product IDs, and the hasFullAccess gating rule
type: feature
---
## Plan tiers (Subscription type `Plan = "free" | "pro" | "lifetime"`)

| Plan | Price | Google Play SKU | Type |
|---|---|---|---|
| Free | RM 0 | — | — |
| Starter Monthly | RM 19 / month | `bossify_starter_monthly` | Subscription (separate SKU) |
| Starter Annual | RM 159 / year | `bossify_starter_yearly`  | Subscription (separate SKU) |
| Pro Monthly | RM 49 / month | `bossify_pro` (base plan `monthly`) | Subscription |
| Pro Annual | RM 399 / year | `bossify_pro` (base plan `annual`) | Subscription |
| Lifetime | RM 1,499 one-time | `bossify_lifetime` | Non-consumable IAP |

## Gating rule
- `isPro` = subscription only.
- `isStarter` = starter subscription only.
- `isLifetime` = lifetime only.
- `hasFullAccess = isPro || isLifetime` — full-feature gates only. Starter does NOT get full access; instead it gets larger numeric caps.
- Numeric caps: read `ordersLimit` / `productsLimit` from `useSubscription` (plan-aware). Do NOT hardcode `FREE_LIMITS`.
- Sync precedence: Lifetime > Pro > Starter > Free.
- Lifetime is the strongest entitlement: `syncFromStore()` never downgrades a lifetime row to pro/free.
- Lifetime has no expiry — skip period-end checks when `plan === "lifetime"`.
- Starter expires (current_period_end) — auto-downgraded to free on `refresh()` when past due.

## DB
`public.subscriptions` carries: `plan` (CHECK in free/pro/lifetime), provider_* fields, `lifetime_purchase_date`, `lifetime_google_token`.
