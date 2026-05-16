---
name: Billing provider
description: Bossify uses Google Play Billing (in-app purchases / subscriptions), NOT Stripe / Paddle / Billplz / FPX
type: constraint
---
Payment / subscription is handled via **Google Play Billing** (Android in-app purchase).

**How to apply:**
- All new paid features (new plan tier, add-on, lifetime deal) must be created as Google Play **In-app Product** or **Subscription** SKU.
- Do NOT suggest Stripe, Paddle, Billplz, FPX, DuitNow, manual bank transfer as payment methods.
- Do NOT suggest taking a % cut on user transactions (would require own payment processor).
- Pricing tiers must follow Google Play's allowed price points for MYR.
- Google takes 15% (first $1M/year) → 30% commission — factor this into pricing.
- Server-side verification of purchases done via Google Play Developer API + RTDN (Real-time Developer Notifications) webhook to our backend.

**Why:** User confirmed on 2026-05-16 — already shipping RM49 / RM399 plans through Google Play Billing.