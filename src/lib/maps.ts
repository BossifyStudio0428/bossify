let mapsPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if ((window as any).google?.maps?.places) return Promise.resolve((window as any).google);
  if (mapsPromise) return mapsPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined) ?? "";
  if (!key) return Promise.reject(new Error("Google Maps key not configured"));

  mapsPromise = new Promise((resolve, reject) => {
    (window as any).__bossifyInitMaps = () => resolve((window as any).google);
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key,
      libraries: "places",
      loading: "async",
      callback: "__bossifyInitMaps",
      v: "weekly",
    });
    if (channel) params.set("channel", channel);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => {
      mapsPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(s);
  });
  return mapsPromise;
}