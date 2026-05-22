# Fix public order form link

## Problem found

The live customer link `/order/5d67fa98` exists in the backend currently used by the app's profile page, but the public order form server function is reading from a different backend connection. That is why the page keeps showing `Order form not found` even though the link is valid.

There is also a second issue: the live profile row does not have the `language` column in the backend that contains `5d67fa98`, so the current query can fail if it asks for that column directly.

## Fix plan

1. Update the public order form server function so it reads the public form data from the same backend/project that generated the seller's link.
2. Make the form lookup tolerant of older schema differences:
   - fetch the required profile fields first
   - fetch optional fields like language only when available
   - default language to English if the seller language field is missing
3. Keep `/order/{code}` fully public and standalone:
   - no login redirect
   - no Bossify app navigation
   - no splash/language gate
4. Verify `/order/5d67fa98` loads the business form instead of the not-found screen.

## Files to change

- `src/lib/public-order.functions.ts`
- Possibly `src/routes/order.$code.tsx` only if the page needs a small defensive adjustment after the backend fix.

## What I will not change

- I will not change the design or add new features.
- I will not touch the generated Lovable Cloud client files.
- I will not require customers to log in.
