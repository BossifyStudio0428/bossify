# Bossify — Full Project Summary & Direction

*(Prepared as a handoff summary — covers product, architecture, decisions, and the latest bug-fix session. Secrets/API keys intentionally omitted.)*

## 1. What Bossify Is

Bossify is a business-management Android app for TikTok Shop sellers in Malaysia, built by John (Wong Zong Han) under his SSM-registered sole proprietorship, ZH Studio. Target users are small merchants with no accounting background. Tagline: "Manage your shop like a boss."

Core promise: **real net profit tracking** (not just gross sales), smart alerts (low stock / loss-making products), 7 exportable PDF reports (Sales, Profit, Stock, Financial P&L, Customer Statement, Supplier, Order Reconciliation), fast order entry with 1-tap WhatsApp order confirmation, and TikTok Shop order sync (now live, not "coming soon").

John is an Accounting diploma student at APU (Asia Pacific University, Malaysia) with no formal software engineering background — builds Bossify via AI-assisted ("vibe coding") development, primarily with Claude, cross-validating architectural decisions with ChatGPT.

## 2. Tech Stack & Infrastructure

- **Frontend/app**: TanStack Start + React + TypeScript, wrapped as a native Android app via Capacitor (AAB/APK), built through Android Studio.
- **Backend**: Cloudflare Workers (`tanstack-start-app`, subdomain `bossifystudio.workers.dev`). A backend-platform-consolidation decision was made (2026-10-06) to eventually move backend logic (AI chat, TikTok sync, Stripe) onto Supabase Edge Functions, keeping Cloudflare only for static hosting — **decided but not yet implemented**.
- **Database/Auth**: Supabase (external project).
- **Payments**: Stripe (Checkout + webhooks).
- **AI features**: Lovable AI Gateway + Gemini (no real-time web search — any "market trend" output is explicitly labeled as general knowledge, never real-time data).
- **Android signing**: keystore `bossify-upload-key-new.jks`, alias `bossify-upload`, Google Play App Signing enabled.
- **TikTok Partner Center**: 7 active API scopes; Go Live Review approved; real integration confirmed working end-to-end on real orders and real devices.
- **Origin**: originally built on Lovable, fully migrated to VS Code + native Android Studio development after a hackathon. Some "Lovable" branding/remnants still exist in the codebase (push notification origin, old domain references) — removal was requested by John but not yet scoped/executed.

John's deploy workflow is entirely manual copy-paste: Claude edits files in a sandbox clone, generates an HTML "paste page" with copy buttons, John pastes each changed file into his local VS Code project, then runs (PowerShell, not cmd — `&&` doesn't work there, one line at a time):
```
git pull
git add -A
git commit -m "..."
git push
npm run build
npx wrangler deploy
npx cap sync android
npx cap open android
```
Then in Android Studio: Build → Generate Signed Bundle/APK → Android App Bundle → select keystore → release → upload the resulting `.aab` to Google Play Console (Release → Production → Create new release).

## 3. Core Features Built (cumulative, across sessions)

### Financial Engine
Net Revenue → COGS (product + packaging) → Gross Profit → Platform/Selling Costs → Contribution Profit → Operating Expenses → Net Profit. Includes: refunds/returns with per-line-item scenarios (`order_adjustments` + `order_adjustment_items`, never rewrites original orders), weighted-average cost via a "Receive Stock" flow, supplier refunds, stock shrinkage booked as an expense on Stock Take completion, TikTok settlement estimate→real upgrade logic, Product Profit page, Cost Health page (data-completeness indicators), Cost Breakdown page (full P&L waterfall + charts), full inventory audit trail, AI purchase-order parsing feeding directly into Receive Stock (cost + stock both now update correctly).

### TikTok Shop Integration
Full order + product sync (one-way TikTok → Bossify), COD orders correctly held as unpaid until delivered, repeat-buyer identification via TikTok's stable `user_id` field (buyer name/phone/email are permanently masked by TikTok — no workaround exists, confirmed and deliberately not pursued further), "Log in with TikTok Shop" alternate auth flow confirmed working on real device.

### 11.11 Campaign Feature (`/campaign`)
Sales target tracking, promo-price manager, prep/restock suggestions scaled to campaign date range, post-campaign report vs. baseline period, home-page countdown banner + header bell icon, AI-generated suggestions (own-data-grounded + clearly-labeled general market reference, manually triggered to control AI cost).

### Global "Ask AI" Chat Widget
Floating button + bottom-sheet chat, persists history, answers grounded only in the seller's own live data (this month's revenue/profit, stock alerts) queried server-side — explicitly instructed to say "I don't have that data" rather than guess, and never to claim real-time market knowledge as fact.

### Navigation / UX reorganization
Bottom nav swapped 4th tab from Inventory-quick-adjust to Profit (`/cost-breakdown`) since profit visibility is the core promise. More page reorganized into 5 labeled sections. Removed duplicate "Top Buyers" / redundant Customers preview section. Several legacy routes kept registered but unlinked (not deleted) when demoted, matching an established "deprecate without delete" pattern.

## 4. Monetization / Pricing (current, final — confirmed 2026-11-10)

- **Free**: RM0 — TikTok sync still usable (capped: 20 orders/month, 10 products). Sync capability itself is never paywalled — it's Bossify's biggest differentiator vs. local competitors (Bukku, AutoCount, SQL Account), none of which have native TikTok Shop sync.
- **Pro**: RM19.90/month or RM199/year — detailed cost & profit tracking, advanced analytics, downloadable reports, 1 store. Capped to 3 of the 7 reports and ~3 months of history in some views (recently built).
- **Business**: RM49.90/month or RM499/year — all 7 reports, unlimited history. Multi-store/team management is explicitly a "Future Business Feature," not built. John is reconsidering whether Business's premium should instead come from real shared-data access for invited staff (investigated: the existing dormant Team feature only manages membership, none of the actual business data is scoped by `team_id` — real implementation would need RLS/query changes across most tables; this is a bigger lift than a quick differentiator, and John hadn't picked a direction as of the last note on this).
- Pricing benchmarked against Bukku (Free→RM35→RM65→RM95→RM135); kept deliberately lower since Bossify is still in its APU Pre-Seed "user testing" stage, not yet an official release.
- Stripe integration is live; Checkout was broken (500 error) and has now been fixed this session (see below).

## 5. This Session's Work (2026-11-10)

All of the following were diagnosed and fixed in this session:

1. **Stripe Checkout 500 error (critical, customer-facing) — FIXED & confirmed working.** Root cause: the `STRIPE_SECRET_KEY` environment variable in Cloudflare held a Stripe **Key ID** (reference string shown in the dashboard) instead of the actual secret value — an easy mistake since both look like opaque strings. Found by temporarily surfacing the real Stripe error message directly in the API's client-visible error response (bypassing incomplete Cloudflare/Stripe log visibility), then reverted back to a generic client-facing error message with full details still logged server-side only.
2. **Sales/Profit trend charts falsely showing "no order data"** when real orders existed — FIXED & confirmed. Root cause: the chart-visibility condition required more than 1 data point (`dailyChart.length > 1`) to avoid an empty Recharts line, which incorrectly treated "only 1 day of data" as "no data." Changed to `> 0` so a single day now renders as a lone point instead of a misleading empty state.
3. **Notification bell navigating to the Customers page instead of Notifications** — root cause found, fix delivered (confirmation pending). This was an extensive investigation: ruled out code bugs (AppShell/NotificationBellIcon/routeTree all correct in the canonical source), ruled out browser cache, ruled out a browser extension, ruled out a stale native APK (confirmed via testing on the live website directly), and initially suspected a stale Vite/`dist` build-cache artifact (a clean `rm -rf dist`, `rm -rf node_modules/.vite`, rebuild + redeploy was done but did **not** fix it). The real root cause: John's **local** `src/routes/notifications.tsx` file had been accidentally overwritten with the full Customers page's source code at some point during the long manual copy-paste workflow (two files are close together in the paste list) — confirmed directly by having him paste back the actual local file content, which showed `component: CustomersPage` registered under the `/notifications` route. The correct Notifications page source was given to him to paste back in full; he still needs to confirm this fixed it after rebuild/redeploy.
4. **Footer "Powered by ZH Studio" now includes the Bossify logo** (not just text) on every in-app page (`AppShell.tsx`) and the public landing page (`LandingPage.tsx`), alongside existing Contact/Privacy Policy/Terms links.
5. **Desktop Chrome "Sign In unresponsive" — diagnosed as NOT a Bossify bug.** My own hands-on testing of the live site in a clean environment showed zero errors. On John's end, only *some* of his Chrome accounts/profiles are affected — a `chrome-extension://` JS error appears in DevTools from a script that isn't in the visible extensions list, and `chrome://extensions` shows "Your browser is managed by your organization" — consistent with a school/org-pushed security/monitoring extension that auto-updates independently of Bossify and can break page-wide click handling on **any** site, not just Bossify. Confirmed account-specific (other accounts/profiles work fine). Resolution: use an unmanaged Chrome profile or a different browser (Edge) for that account; nothing to fix in the app.
6. **Android release notes drafted** (en-US) summarizing this batch of fixes for the Play Console "What's new" field.

## 6. Critical Technical Gotchas (do not re-break these)

- **TanStack Router file-naming trap**: a route file named `foo.$bar.tsx` (dot notation) auto-nests as a child of `foo.tsx` if that file exists — and if `foo.tsx` has no `<Outlet/>`, navigating there silently does nothing (no error anywhere, not even in error boundaries). Fix is `foo_.$bar.tsx` (underscore de-nests it). This caused real, long-undiscovered bugs on order-detail and inventory-detail pages. Any new dynamic/detail route should either use this underscore convention or a flat/independent path.
- Prefer the route-bound `Route.useParams()` over the global `useParams({ from: "..." })` — the global form caused a production crash after a related route rename.
- Production builds hide real error messages/stacks behind `import.meta.env.DEV` specifically in **`router.tsx`** (not `__root.tsx` — there are two similar error-boundary-like files, easy to edit the wrong one).
- `createServerFn()` doesn't work on Capacitor native paths — native code must use fully-qualified `fetch()` with Bearer auth; the web path can stay as-is.
- Financial correctness depends on snapshotting cost/fee data at order-creation time, never recomputing retroactively from current prices.
- Before assuming any shared constant/bug is fully fixed, `grep -rn` the literal value across all of `src/` — duplicated hardcoded values across multiple files have caused repeat "fixed it" misses before (e.g. the low-stock threshold existed in 6 places).
- John runs parallel AI sessions on the same codebase sometimes — always diff against what he actually currently has (re-uploaded/pasted content) rather than assuming a prior session's version is still current.

## 7. Open / Pending Items

- **Confirm the notifications.tsx fix actually resolved the bell-navigation bug** after John pastes the corrected file and redeploys.
- **Stale Stripe webhook URL**: the "Bossify webhook" endpoint in Stripe Dashboard still points at an old Lovable domain (`https://bossify-malaysia.lovable.app/...`) instead of the current Cloudflare Workers URL — 100% delivery failure, separate from the (now-fixed) checkout 500 bug, still needs updating in the Stripe Dashboard.
- **Remove remaining Lovable-related branding/remnants** — John explicitly asked about this; scope was never finalized (push notification origin-binding to the old domain is expected browser behavior, not fixable in code, and was explained as such — but other remnants may still exist).
- **Rotate/confirm revocation of a Stripe restricted API key** that was pasted in full into chat in an earlier session — not yet confirmed done.
- **Stripe Price objects for Pro/Business** at the new RM19.90/RM49.90 (and annual RM199/RM499) amounts, and `PRICE_IDS` in `stripe.server.ts` — confirm these are fully wired (recent session work suggests yes, given checkout was tested working, but worth re-verifying price amounts match the final confirmed numbers).
- **Business tier team/seat-sharing decision** — not yet decided between (a) ship a smaller differentiator now and defer real shared-data access, or (b) build real `team_id`-scoped data access now (bigger RLS/query change across most tables).
- **Backend consolidation to Supabase Edge Functions** — decided in principle, not started; open questions include whether TikTok sync is cron-triggered on Cloudflare vs. event-driven via Supabase, and whether PDF reports are generated server-side or on-device.
- **Client meeting prep materials** — a prospective business client meeting was scheduled (around 11.11); prep work has been repeatedly deferred in favor of feature work and is still outstanding.
- **`Bossify_Introduction-2.docx` and the Google Play Store listing** still describe TikTok Shop sync as "coming soon" — outdated, since it's live and Go-Live-Review-approved.
- **Google Play release**: this session's fixes were packaged into a signed AAB via Android Studio; John needs to complete creating the new release in Play Console (steps given) and confirm successful rollout.
- Real-device testing still pending for: category filtering across all pages, the repeat-buyer feature (needs fresh TikTok orders to populate), the unified Add Cost page.

## 8. Roadmap (APU Pre-Seed, 6-month plan)

1. Bug fixes / UI / performance
2. TikTok sync + inventory improvements
3. User testing *(project is roughly entering this stage now)*
4. Expand reporting
5. Marketing
6. Official release

APU Innovate Pre-Seed Fund proposal was approved (RM 5,000). TikTok Shop Service Market Go Live Review is approved. Backend is live in production.

---
*ZH Studio also develops a second, unrelated app: ReLife (habit/self-discipline tracking) — not part of Bossify and not covered here.*
