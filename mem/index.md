# Project Memory

## Core
Billing = **Google Play Billing only**. Never suggest Stripe / Paddle / Billplz / FPX / DuitNow / bank transfer or transaction-fee models. New paid features must be Google Play in-app products or subscriptions.
Plan tiers: `free` / `starter` / `pro` / `lifetime`. Use `hasFullAccess` (`isPro || isLifetime`) for full-feature gates. For numeric caps (orders/products), use `ordersLimit` / `productsLimit` from `useSubscription` — they're plan-aware (free 20/10, starter 40/25, pro/lifetime ∞).

## Memories
- [Billing provider](mem://billing) — Google Play Billing constraint, 15-30% commission, RTDN webhook for server verification
- [Plans & SKUs](mem://plans) — Google Play product IDs: `bossify_pro`, `bossify_lifetime`, `bossify_starter_monthly` / `bossify_starter_yearly`