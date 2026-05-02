export const BOSSIFY_SPLASH_MS = 3000;

export function getBossifySplashRemainingMs() {
  if (typeof window === "undefined") return BOSSIFY_SPLASH_MS;

  const startedAt = window.performance?.timeOrigin ?? Date.now();
  const elapsed = Date.now() - startedAt;

  return Math.max(0, BOSSIFY_SPLASH_MS - elapsed);
}