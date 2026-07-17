/**
 * Bossify feature flags.
 *
 * RETAIL_ONLY_MODE — when true (default from Nov 2026 pivot), the app is
 * locked to the Retail business type for ALL users. Non-Retail business
 * types (FnB, Property, Education, Beauty, Freelance) and their
 * modules are hidden from the UI. Existing users keep their stored
 * `profiles.business_type` value in the database — nothing is deleted,
 * so this flag can be flipped back to `false` at any time to restore
 * the multi-business behaviour.
 */
export const RETAIL_ONLY_MODE = true;

/** Business type keys that remain visible while RETAIL_ONLY_MODE is on. */
export const ALLOWED_BIZ_TYPES = ["retail"] as const;

/**
 * Routes that belong to archived (non-Retail) verticals. When
 * RETAIL_ONLY_MODE is on, the app-shell guard redirects any navigation
 * to these paths back to `/`. Prefix match — `/listings` also covers
 * `/listings/123`.
 */
export const ARCHIVED_ROUTE_PREFIXES: readonly string[] = [
  // FnB
  "/dine-in",
  "/tables",
  "/recipes",
  "/ingredients",
  "/dine/",
  // Property
  "/listings",
  "/listing/",
  "/commissions",
  "/commission/",
  "/viewings",
  "/viewing/",
  "/loan-calculator",
  "/clients-compare",
  // Education
  "/pipeline-overview",
  "/university-insights",
  "/renewals",
  "/renewal/",
  "/requirements",
  "/requirement/",
  // Beauty
  "/bookings",
  "/new-booking",
  "/booking-settings",
  "/book/",
];

export function isArchivedRoute(pathname: string): boolean {
  if (!RETAIL_ONLY_MODE) return false;
  return ARCHIVED_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"),
  );
}

/**
 * Hide Shopee / Lazada / Instagram / Facebook from Settings → Integrations.
 * Only TikTok Shop remains visible while true. Flip to `false` to restore
 * the full platform list. Underlying `platform_connections` rows and the
 * `/connected-platforms/$platform` route are untouched.
 */
export const HIDE_NON_RETAIL_INTEGRATIONS = true;

/**
 * Hide the Bookings and Booking Settings menu entries (Beauty vertical).
 * The routes themselves stay registered; flip to `false` to restore.
 */
export const HIDE_BOOKING_MENU = true;

/**
 * Hide the Public Order Form feature surface:
 *  - Profile menu entry to `/order-form`
 *  - Compact Public Order Form section on `/orders`
 *  - "Show stock on order form" toggle on the Products page
 *  - "Saved — share order form link" toast after adding/editing a product
 *
 * Underlying data and routes stay intact:
 *  - `/order/$code` public page still resolves for existing shared links
 *  - `/order-form` settings route stays registered (just unlinked)
 *  - `profiles.order_form_*` columns are untouched
 *  - Past orders placed via the order form remain in `orders` and show up
 *    in Orders / Profit Summary as normal
 * Flip to `false` to restore.
 */
export const HIDE_ORDER_FORM = true;

/**
 * Hide the Team Plan surface:
 *  - Profile "Team" section + `/team` menu entry
 *  - Home page Team badge Link, TeamBanner, SuspendedTeamBanner,
 *    PendingInviteBanner
 *
 * Underlying data and routes stay intact:
 *  - `/team`, `/team/welcome`, `/team/join/$token` stay registered so
 *    existing invite links still work if someone opens one directly
 *  - `team_members` / invites data is untouched
 *  - Subscription `isTeam` / `teamTier` logic is untouched (falls back to
 *    the standard Pro/Lifetime badge on home)
 * Flip to `false` to restore.
 */
export const HIDE_TEAM_PLAN = true;

/**
 * Hide the Profit Summary tile on the More screen.
 * Reports (`/reports`) still shows the same revenue / cost / profit /
 * margin numbers with more range options + PDF export. The `/profit`
 * route stays registered; flip to `false` to restore.
 */
export const HIDE_PROFIT_SUMMARY = true;

/**
 * Hide the Analytics entry in Profile → Business section.
 * Reports (`/reports`) is the single reporting view (PDF export + custom
 * date range + business-type awareness). The `/analytics` route stays
 * registered; flip to `false` to restore.
 */
export const HIDE_ANALYTICS_MENU = true;

/**
 * Show the new Reports hub (3 cards: Sales / Profit / Stock) at `/reports`.
 * When true, `/reports` renders the hub and the old visual sales-report
 * screen moves to `/reports/sales`. Flip to `false` to skip the hub and
 * send `/reports` straight to `/reports/sales`. No data or routes are
 * removed either way.
 */
export const REPORTS_HUB_MODE = true;