# Retail-Only Pivot — Plan (for approval before implementing)

## 1. The feature flag

Single source of truth in `src/lib/featureFlags.ts` (new file, frontend-only — no DB, no env var needed since it must apply to all existing users immediately on next app open):

```ts
export const RETAIL_ONLY_MODE = true;
export const ALLOWED_BIZ_TYPES = ["retail"] as const;
```

Flipping `RETAIL_ONLY_MODE = false` later fully restores the old multi-business behaviour. No data migration required to reverse — everything is hidden by conditional rendering, nothing is deleted.

## 2. What will be hidden globally (all users)

**Business types removed from selector** (`business-type.tsx`, onboarding):
- FnB, Property, Education, Beauty, Freelance
- Only "Retail" remains selectable

**Routes hidden from nav + guarded to redirect to `/` if visited directly** (files kept on disk, code kept intact):
- FnB: `/dine-in`, `/tables`, `/recipes`, `/ingredients`, `/dine/$tableId`
- Property: `/listings`, `/listing/$id`, `/commissions`, `/commission/$id`, `/viewings`, `/viewing/$id`, `/loan-calculator`, `/clients-compare`
- Education: `/pipeline-overview`, `/university-insights`, `/renewals`, `/renewal/$id`, `/requirements`, `/requirement/$id`, `/client-education-details`
- Beauty: `/bookings`, `/new-booking`, `/booking-settings`, `/book/$code`
- Cross-vertical extras only used by non-Retail: dine-in QR ordering, kitchen tickets, follow-up pipeline

**Bottom nav** (`AppShell.tsx` `BottomNav`): forced to the Retail/Inventory tab set for every user, regardless of stored `business_type`. Property-user branch never renders.

**Homepage / dashboard**: forced to the Retail dashboard variant; FnB dine-in widgets, Property commission widgets, Education pipeline widgets, Beauty booking widgets all conditionally hidden.

**Settings**: business-type row hidden (or shown read-only as "Retail"). Sub-type (FnB general/restaurant) selector hidden.

## 3. What existing non-Retail users see on next app open

They will NOT be auto-converted in the database. Instead, at the app-shell level:

- `useBusinessType()` continues to return their stored value from `profiles`, but a new wrapper `useEffectiveBusinessType()` returns `"retail"` whenever `RETAIL_ONLY_MODE` is on. All UI reads the effective value; only the settings screen can see the stored value (and it's hidden anyway).
- On first launch after the update, show a **one-time in-app notice** (dismiss-and-remember in localStorage, key `bossify_retail_pivot_notice_v1`, per-user) — 3 languages via existing i18n keys:

  > "Bossify is now focused on Retail / online sellers. Your previous [FnB/Property/…] data is safely stored and can be restored later. Contact support if you need help."

- Their existing rows in `listings`, `bookings`, `ingredients`, etc. remain untouched in the database. They just can't reach those screens through the UI.
- New orders / inventory they create go into the Retail flow (which they can already use — Retail is a superset of the base tables).

## 4. Onboarding for new users

- Skip the business-type selection screen entirely — auto-set `business_type = 'retail'` on profile creation, jump straight from language → business profile → payment setup.
- Skip the FnB sub-type screen.

## 5. Reversibility

To roll back at any future date:
1. Flip `RETAIL_ONLY_MODE = false` in `src/lib/featureFlags.ts`.
2. Ship.

That's it. Because:
- No DB rows are modified or deleted (existing `business_type` values stay as they are).
- No route files are removed (only conditionally hidden from nav + redirected if flag on).
- No i18n keys removed.
- The one-time notice localStorage key can be cleared separately if you want users to see a "we're back" notice.

## 6. Files that will change

- `src/lib/featureFlags.ts` — new (single flag)
- `src/lib/businessType.ts` — add `useEffectiveBusinessType()` helper + `isBizTypeAllowed()`
- `src/components/AppShell.tsx` — force Retail nav; add pivot-notice one-time toast; guard non-Retail routes in navigation effect
- `src/routes/business-type.tsx` — hide non-Retail options
- `src/routes/onboarding.tsx` — auto-set retail, skip type selector
- `src/routes/profile.tsx` (or settings) — hide business-type row
- `src/routes/index.tsx` — force Retail dashboard variant
- i18n additions in `src/contexts/I18nContext.tsx` for the pivot notice (EN/BM/ZH)
- Route-level guards (small `useEffect` redirect) in each archived route file — or a single wrapper — to bounce users who hit an archived URL directly

## 7. SQL

**None required.** No schema change, no data change. All hiding is done in frontend code. The `business_type` column, all vertical-specific tables (`listings`, `bookings`, `ingredients`, `recipes`, `commissions`, etc.), and all their RLS policies stay exactly as they are.

## 8. Not in scope (flagging for your decision)

- **Auto-migrating existing non-Retail users' `business_type` to `retail`** — I'd recommend NOT doing this so it's trivially reversible. Confirm you agree.
- **Removing archived routes from the router entirely** — I'd recommend NOT doing this, so files stay compilable and reversible. Confirm you agree.
- **Backend cleanup of orphaned edge functions (booking, dine-in, etc.)** — leave running, they cost nothing if unused. Confirm.

---

**Please confirm** (or tell me what to change) and I'll implement. In particular:
1. Do you want the one-time notice, or silent hide?
2. Keep stored `business_type` as-is (recommended), or force-update all rows to `'retail'`?
3. Any module you actually want to keep visible for Retail users (e.g. Suppliers, Purchase Orders, Documents — these are Retail-relevant so I'd keep them)?
