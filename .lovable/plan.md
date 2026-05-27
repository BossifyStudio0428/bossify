## Why notifications are broken

I checked the external Supabase `device_tokens` table — it is **completely empty (0 rows)** for every user. With no tokens registered, every push from `send-push` returns `sent: 0`, which is exactly what the edge function logs show.

Three independent root causes:

### 1. Web never registers an FCM web push token
On the Notification Settings page, the "Allow notifications" / "Open system settings" button calls `openAppNotificationSettings()`. On web, that only calls `Notification.requestPermission()` — it **never calls `registerWebPush(user.id)`**, so no FCM web token is created and nothing lands in `device_tokens`. Result: web users can never receive pushes, even after granting permission.

### 2. Android tokens were previously written to the wrong project
Earlier the edge function wrote `device_tokens` into the Lovable Cloud project (`utqlrdbhvnugqvemjegi`). The last fix routed it to the external Bossify project (`knouahqwazerjiyiqgmh`), but no Android device has re-opened the app since, so the table is still empty. We need to make registration retry automatically on app open and also on every visit to Notification Settings.

### 3. No scheduled job is calling follow-up / daily reminders
The DB function `public.send_followup_reminders()` exists, but **no `pg_cron` job is scheduled** to run it. Same for the morning / evening summaries (`trigger_push_kind('morning_summary')` etc.). So those notifications can never fire by themselves.

New-order push (when a customer submits the public form) already works correctly via `createPublicOrder` → `send-push` → `appAdmin` — but only after at least one device token exists for the seller.

---

## Plan

### A. Fix web push registration (`src/routes/notification-settings.tsx`)
- When the user clicks "Allow notifications" on web, call `registerWebPush(user.id)` directly (not just `Notification.requestPermission`). On native, keep the current `openAppNotificationSettings()` behavior.
- On page mount, in addition to `registerPushForUser` (native), also call `registerWebPush(user.id)` when running in a browser and permission is already granted, so existing web users auto-register their token.
- Surface a toast when registration fails so we stop silently no-op'ing.

### B. Make the "Send test push" reliable
- After a successful test response with `sent: 0`, automatically attempt to register the current device (web or native) and re-send once, so the user doesn't have to dig through settings to bootstrap their first token.

### C. Schedule daily reminders via `pg_cron` (new migration)
Add a migration on the external Bossify Supabase project (`knouahqwazerjiyiqgmh`) that:
1. `CREATE EXTENSION IF NOT EXISTS pg_cron;` and `pg_net;`
2. Schedules:
   - `send-followups-daily` — 09:00 MYT (01:00 UTC) → `SELECT public.send_followup_reminders();`
   - `morning-summary-daily` — 09:00 MYT → `SELECT public.trigger_push_kind('morning_summary');`
   - `closing-report-daily` — 21:00 MYT (13:00 UTC) → `SELECT public.trigger_push_kind('closing_report');`
   - `unpaid-reminder-daily` — 10:00 MYT (02:00 UTC) → `SELECT public.trigger_push_kind('unpaid_reminder');`

These DB functions already exist; they call the `send-push` edge function with the `PUSH_WEBHOOK_SECRET` (which is configured). The `send-push` function then resolves content per user (respecting their notification preferences) and dispatches.

### D. Verify after deploy
1. Re-open Notification Settings on web → expect a `device_tokens` row with `platform='web'`.
2. Re-open the Android app → expect a `device_tokens` row with `platform='android'`.
3. Press "Send test push" → expect `sent ≥ 1`.
4. Manually run `SELECT public.send_followup_reminders();` in SQL → expect notifications to fire for any user with a due follow-up.

### Files
- `src/routes/notification-settings.tsx` — wire `registerWebPush` into the Allow button + auto re-register on test-send fail.
- New migration `supabase/migrations/<ts>_schedule_push_jobs.sql` — pg_cron schedules (targets external Bossify project; will need to be run against `knouahqwazerjiyiqgmh` because `cron`/`net` live there).

### Note on the cron migration
Lovable Cloud migrations run on the Lovable project DB (`utqlrdbhvnugqvemjegi`), **not** on the external Bossify DB. So step C cannot be applied with the migration tool — I'll provide the SQL for you to run once in the external project's SQL editor (similar to how we handled the `delivery_address` column). Want me to proceed with A + B in code and give you the cron SQL to paste?
