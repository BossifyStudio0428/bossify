# Project Memory

## Core
Billing = **Google Play Billing only**. Never suggest Stripe / Paddle / Billplz / FPX / DuitNow / bank transfer or transaction-fee models. New paid features must be Google Play in-app products or subscriptions.
Plan tiers: `free` / `pro` / `lifetime`. Use `hasFullAccess` (from `useSubscription`) for feature gates, NOT `isPro` alone.

## Memories
- [Billing provider](mem://billing) — Google Play Billing constraint, 15-30% commission, RTDN webhook for server verification
- [Plans & SKUs](mem://plans) — Google Play product IDs: `bossify_pro` (monthly/annual base plans) + `bossify_lifetime` (non-consumable, RM 1,499)