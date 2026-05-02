export const BOSSIFY_SPLASH_MS = 3000;

// Module-level start timestamp — set the first time this module is evaluated
// (i.e. on a real cold start of the JS bundle). We intentionally do NOT use
// performance.timeOrigin because in a WebView it can reflect a much earlier
// time, which makes the remaining splash time collapse to 0 and the splash
// never shows.
let splashStartedAt: number | null = null;

export function markBossifySplashStart() {
  if (splashStartedAt === null) {
    splashStartedAt = Date.now();
  }
}

export function getBossifySplashRemainingMs() {
  if (typeof window === "undefined") return BOSSIFY_SPLASH_MS;
  if (splashStartedAt === null) splashStartedAt = Date.now();
  const elapsed = Date.now() - splashStartedAt;
  return Math.max(0, BOSSIFY_SPLASH_MS - elapsed);
}