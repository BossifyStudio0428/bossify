const PRODUCTION_ORIGIN = "https://bossify-malaysia.lovable.app";

export function isNativeWebView(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  const { protocol, hostname } = window.location;
  return (
    protocol === "capacitor:" ||
    protocol === "ionic:" ||
    protocol === "file:" ||
    (cap?.getPlatform?.() === "android" &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")))
  );
}

/**
 * Returns the public-facing origin for share links.
 * Capacitor apps run on localhost/capacitor:// internally, and preview/lovable
 * subdomains aren't shareable, so we always use the production origin except
 * when running on the actual production or a custom domain in a real browser.
 */
export function getPublicOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;
  const { protocol, hostname, origin } = window.location;
  // Capacitor / native app
  if (isNativeWebView()) return PRODUCTION_ORIGIN;
  // Localhost (Capacitor Android serves over http://localhost)
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    return PRODUCTION_ORIGIN;
  }
  // Lovable preview/sandbox URLs aren't meant for end-customer sharing
  if (hostname.includes("lovable.dev") || hostname.includes("lovableproject.com")) {
    return PRODUCTION_ORIGIN;
  }
  return origin;
}
