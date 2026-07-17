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