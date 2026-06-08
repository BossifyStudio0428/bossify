## Goal

Make push notifications (the bell/system pop-ups) also follow the merchant's **business type** and **app language** — not always English "New order received! 🛍️".

## Current state

- `src/lib/notifMessages.ts` (used by **in-app** toasts and the bell list): already biz-aware + localised for all kinds.
- `supabase/functions/send-push` (the **actual push** sent to phones/web): biz+lang-aware for `morning_summary`, `closing_report`. Generic-only for `unpaid_reminder`, `follow_up_reminder`, `low_stock`, `milestone`. Has **no** computed wording for `new_order`.
- DB trigger `notify_new_order_push` (fires on every new order INSERT): hardcodes English `title = 'New order received! 🛍️'` and a body string, then calls send-push with those as overrides — so the edge function's biz/lang logic is bypassed and every merchant gets English regardless of language or biz type.

## Changes

### 1. DB trigger `notify_new_order_push`
Rewrite so it does NOT send `title`/`body`. Send only:
```json
{ "kind": "new_order", "targetUserId": ..., "link": "/orders",
  "vars": { "customer": "...", "amount": "12.50" } }
```
The edge function will compute biz+lang title/body.

### 2. `supabase/functions/send-push/index.ts`
- Add a `T_NEW_ORDER` biz pack mirroring the `NEW_ORDER` table in `src/lib/notifMessages.ts` (retail/fnb = "New order", education = "New case", beauty = "New appointment", property = "New customer", freelance = "New project", in en/ms/zh).
- Add a `T_UNPAID` biz pack mirroring the `UNPAID` table in `notifMessages.ts` (per-biz wording). Keep `T_UNPAID_GENERIC` only as the fallback when no `customer`/`amount` is supplied (the cron path).
- Add a localised `T_LOW_STOCK`, `T_MILESTONE`, `T_FOLLOWUP` body that uses the user's `language` (already partly there — verify low_stock and milestone are localised since they're sent from `src/lib/notifications.ts` or other call sites).
- Read `parsed.vars` (optional `{customer, amount, product, quantity, milestone, note}`) and use it to fill bodies. When the trigger passes vars, render a per-customer message; when the cron broadcast has no vars, fall back to the count-based generic.
- In `resolveContent`, add a `kind === "new_order"` branch that picks the biz template and fills `{customer}`+`{amount}` from `parsed.vars`. Only fall back to override.title/body when caller explicitly passes them (no in-tree caller does for `new_order` after step 1).

### 3. Find all other call sites that pass hardcoded English overrides
Search for `send-push` callers (`sendPush.ts`, `notify.ts`, `notifications.ts`, any DB function) and switch them to pass `kind` + `vars` instead of pre-composed `title`/`body`, so the edge function's biz+lang logic always wins. Leave one escape hatch (`override.title && override.body`) for one-off custom notifications.

### Out of scope
- In-app bell list / toast wording — already biz+lang aware via `notifMessages.ts`.
- Emoji handling — push notifications render emoji fine on the OS notification tray; we only strip them from WhatsApp URLs.

## Files touched
- New migration: replace `notify_new_order_push` function.
- `supabase/functions/send-push/index.ts`
- `src/lib/sendPush.ts` / `src/lib/notify.ts` / `src/lib/notifications.ts` (only if any of them pass pre-composed English titles).
