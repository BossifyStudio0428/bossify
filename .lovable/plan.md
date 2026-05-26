## Problem

Every request to `/api/public/order-form?code=...` returns **500 HTTPError** in production (`bossify-malaysia.lovable.app`). The "Order form not found" page is the frontend's fallback when the fetch fails.

Confirmed:
- The code `5d67fa98` **does exist** in the external Supabase `profiles` table with `order_form_enabled = true`.
- `APP_SUPABASE_SERVICE_ROLE_KEY` is set in Lovable secrets.
- Worker logs show only `Masked SSR error: HTTPError` — the throw happens *before* the handler's internal try/catch can return a JSON `not_found`, meaning the failure is at the RPC boundary, not in the DB query.

## Root cause

`src/routes/api/public/order-form.ts` (a TSS server route) calls `getPublicOrderForm({ data: ... })` and `submitPublicOrder({ data: ... })`, which are **`createServerFn` wrappers** from `src/lib/public-order.functions.ts`. Invoking a `createServerFn` from inside another server route handler goes through TanStack's RPC fetch layer and fails in the Worker runtime — hence the `HTTPError`.

The pattern should be: server route handler → call a plain server-only helper directly. `createServerFn` wrappers are for client-to-server calls only.

## Fix

1. **Extract the implementation** from `src/lib/public-order.functions.ts` into plain async functions in `src/lib/public-order.server.ts`:
   - `loadPublicOrderForm(code: string)` — same body as the current `.handler` of `getPublicOrderForm`.
   - `createPublicOrder(payload: unknown)` — same body as `submitPublicOrder`'s handler, plus the Zod validation that currently runs in `inputValidator`.
   - Keep `getPublicOrderClient()` as-is.

2. **Update the server route** `src/routes/api/public/order-form.ts` to call these helpers directly (no `createServerFn` involved):
   ```ts
   const result = await loadPublicOrderForm(parsed.data);
   const result = await createPublicOrder(body);
   ```

3. **Slim down `public-order.functions.ts`** so the `createServerFn` wrappers just delegate to the new helpers — preserves any other callers and keeps types stable.

4. **No DB / schema / secret changes** needed.

## Verification

After the change, hit `/api/public/order-form?code=5d67fa98` via the server-function-logs tool — expect HTTP 200 with `{ ok: true, profile: {...}, products: [...] }`. Then reload the public order form URL on mobile — the catalog should render instead of the "Order form not found" page.