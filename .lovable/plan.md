# Multi-Platform Order Sync — Preparation Checklist

This is a pre-build checklist. No code yet. Goal: when a seller connects a platform account, new orders flow into Bossify automatically and trigger a push notification.

---

## 1. Architecture overview

```text
Platform (TikTok/Shopee/Lazada/Meta)
        │  ① OAuth connect (seller authorizes Bossify)
        ▼
   Bossify server route  ──►  store encrypted tokens in DB
        │
        │  ② Platform sends webhook on new order
        ▼
   /api/public/webhooks/{platform}
        │  verify signature → normalize payload → insert into `orders`
        ▼
   Postgres `orders` table  ──►  trigger push notification to seller
        │
        ▼
   Bossify Orders page (already exists)
```

Two parallel concerns per platform:
- **Auth flow**: OAuth connect/disconnect, token refresh.
- **Order ingestion**: webhook receiver + periodic backfill poller (for platforms whose webhooks are unreliable or require initial sync).

---

## 2. Files to create or modify

### New — server (TanStack server routes, under `src/routes/api/public/`)
- `src/routes/api/public/oauth/tiktok/callback.ts` — OAuth callback, exchange code → tokens.
- `src/routes/api/public/oauth/shopee/callback.ts`
- `src/routes/api/public/oauth/lazada/callback.ts`
- `src/routes/api/public/oauth/meta/callback.ts` — shared FB + IG (Meta Graph API).
- `src/routes/api/public/webhooks/tiktok.ts` — receives order events, verifies signature.
- `src/routes/api/public/webhooks/shopee.ts`
- `src/routes/api/public/webhooks/lazada.ts`
- `src/routes/api/public/webhooks/meta.ts`
- `src/routes/api/public/cron/sync-orders.ts` — backfill poller, called by pg_cron every 5–15 min.

### New — server functions (`src/lib/`)
- `src/lib/platformConnect.functions.ts` — start OAuth (generate state, return auth URL), disconnect.
- `src/lib/platformOrders.functions.ts` — list synced orders, retry sync, manual refresh.
- `src/lib/platforms/tiktok.server.ts` — TikTok API client + order normalizer.
- `src/lib/platforms/shopee.server.ts`
- `src/lib/platforms/lazada.server.ts`
- `src/lib/platforms/meta.server.ts`
- `src/lib/platforms/normalize.ts` — shared `PlatformOrder → orders` row mapper.
- `src/lib/platforms/crypto.server.ts` — encrypt/decrypt OAuth tokens at rest.

### Modify — existing
- `src/routes/connected-platforms.$platform.tsx` — replace "Coming Soon" sheet with real OAuth "Connect" button + connected state UI (disconnect, last sync time, sync now).
- `src/routes/profile.tsx` (or wherever platforms list is rendered) — show real connection status from `platform_connections`, not just `profiles.connected_platforms` boolean.
- `src/lib/platforms.ts` — add `oauthUrlBuilder`, `scopes`, `webhookPath` per platform.
- `src/routes/orders.tsx` / `src/routes/orders.$orderId.tsx` — show `order_source` badge (TikTok / Shopee / etc.) and platform-native order ID.
- `src/lib/autoNotify.ts` — already exists; reuse for new-order push. May add a new `PushKind` value `platform_order`.

### Modify — config
- `supabase/manual-migrations/order-form.sql` — extend `orders.order_source` CHECK constraint to allow new values: `'tiktok' | 'shopee' | 'lazada' | 'facebook' | 'instagram'`.

---

## 3. Database changes (Supabase)

### New table: `platform_connections`
Stores one row per (seller, platform) connection.
- `user_id` (FK profiles.id)
- `platform` (`tiktok` | `shopee` | `lazada` | `facebook` | `instagram`)
- `platform_shop_id` — seller's external shop/account ID
- `platform_shop_name`
- `access_token_encrypted`
- `refresh_token_encrypted`
- `token_expires_at`
- `scopes` (text[])
- `status` (`active` | `expired` | `revoked` | `error`)
- `last_synced_at`
- `last_error`
- `connected_at`, `updated_at`
- Unique: `(user_id, platform)`
- RLS: seller can SELECT/DELETE own rows; only server (service role) can INSERT/UPDATE tokens.

### New table: `platform_order_events`
Idempotency + audit log so a re-delivered webhook does not create duplicate orders.
- `platform`, `platform_order_id`, `event_type`, `received_at`, `processed`, `order_id` (FK orders.id), `raw_payload` (jsonb)
- Unique: `(platform, platform_order_id, event_type)`
- RLS: server-only.

### Modify `orders`
- Add `platform_order_id text` — external ID from the platform.
- Add `platform_metadata jsonb` — shipping, SKU map, raw line items.
- Update CHECK constraint on `order_source` to include the 5 new values.
- Add index on `(user_id, platform_order_id)` for dedupe lookups.

### Modify `profiles.connected_platforms`
Already exists as jsonb. Decision: **keep as a cached read-model** (fast UI booleans), but make `platform_connections` the source of truth. Add a trigger on `platform_connections` to sync the boolean into `profiles.connected_platforms`.

### pg_cron job
- `sync_platform_orders` — every 10 min, calls `https://project--{id}.lovable.app/api/public/cron/sync-orders` to backfill / catch missed webhooks.

---

## 4. Edge Functions

**None.** This stack is TanStack Start — server routes under `src/routes/api/public/*` handle webhooks, and `createServerFn` handles internal logic. The existing Stripe/push edge functions are legacy and we will not add to them.

---

## 5. Secrets / environment variables

Each platform requires registering Bossify as a developer app, then storing:

| Platform | Required secrets |
|---|---|
| TikTok Shop | `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET` |
| Shopee | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` |
| Lazada | `LAZADA_APP_KEY`, `LAZADA_APP_SECRET` |
| Meta (FB + IG) | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| Shared | `PLATFORM_TOKEN_ENCRYPTION_KEY` (32-byte base64, for encrypting OAuth tokens at rest) |
| Shared | `OAUTH_STATE_SECRET` (HMAC key for CSRF-safe OAuth `state` param) |

All stored as runtime secrets (Lovable Cloud secrets), read via `process.env.*` inside server routes/functions.

---

## 6. External preparation (you do this outside Lovable)

This is the slow part — do it in parallel with development.

1. **TikTok Shop Partner account** — apply at partner.tiktokshop.com. Approval can take days/weeks. Register OAuth redirect URL: `https://bossify-malaysia.lovable.app/api/public/oauth/tiktok/callback`. Subscribe to `order_status_change` webhook.
2. **Shopee Open Platform** — register at open.shopee.com, get Partner ID + Key, set redirect URL, subscribe to order push notifications.
3. **Lazada Open Platform** — register at open.lazada.com, get App Key + Secret, redirect URL.
4. **Meta for Developers** — create app at developers.facebook.com, request `commerce_account_read_orders` + `instagram_shopping_tag_products` permissions (requires App Review with screencast demo). Configure webhook with verify token.
5. **Decide custom domain or stick with `bossify-malaysia.lovable.app`** for webhook URLs — webhook URLs are hard to change once registered with each platform.

---

## 7. Build order recommendation

Once approvals start coming in, build in this order to derisk:

1. DB migration (`platform_connections`, `platform_order_events`, `orders` columns).
2. Token encryption helper + OAuth state HMAC.
3. **One platform end-to-end first** — recommend **Shopee** (cleanest docs, no app review wall like Meta). Connect → webhook → order appears → push fires.
4. Extract shared abstractions into `src/lib/platforms/*` once #3 works.
5. Add Lazada, then TikTok, then Meta (FB + IG share the same code path).
6. pg_cron backfill poller last, as a safety net.

---

## 8. Open questions for you

Answer these before we start coding:

1. **Region**: Malaysia only, or also Singapore/Indonesia/Thailand? Affects Shopee/Lazada endpoint hosts and Meta business verification.
2. **Order statuses**: Bossify currently has `Unpaid | Paid | Pending`. Platforms have richer states (`ready_to_ship`, `shipped`, `delivered`, `cancelled`, `refunded`). Do we (a) map everything down to the 3 existing values, or (b) extend the enum? Affects how much of `orders.tsx` needs updating.
3. **Stock sync direction**: orders-in only, or also push Bossify inventory updates back to the platform? (Second direction is ~3× more work.)
4. **Which platform first?** I recommend Shopee. Confirm or pick.
5. **Webhook URL stability** — OK to use `https://bossify-malaysia.lovable.app/api/public/webhooks/*` as the permanent URLs registered with each platform?

Reply with answers to 1–5 and I'll write the implementation plan for phase 1 (DB + Shopee end-to-end).
