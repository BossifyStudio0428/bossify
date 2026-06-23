import "@tanstack/react-start/server-only";
import { getPublicOrderClient } from "./public-order.server";

export type DeliveryZone = { max_km: number; fee: number };

export type DeliveryConfigResult =
  | {
      ok: true;
      userId: string;
      storeLat: number;
      storeLng: number;
      zones: DeliveryZone[];
    }
  | { ok: false; reason: "not_found" | "disabled" | "not_configured" };

export async function loadDeliveryConfig(code: string): Promise<DeliveryConfigResult> {
  const sb = getPublicOrderClient() as any;
  const { data: p, error } = await sb
    .from("profiles")
    .select("id, order_form_enabled, delivery_enabled, store_lat, store_lng, delivery_zones")
    .eq("order_form_code", code.toLowerCase())
    .maybeSingle();
  if (error || !p) return { ok: false, reason: "not_found" };
  if (p.order_form_enabled === false) return { ok: false, reason: "disabled" };
  if (p.delivery_enabled !== true) return { ok: false, reason: "not_configured" };
  const lat = Number(p.store_lat);
  const lng = Number(p.store_lng);
  if (!isFinite(lat) || !isFinite(lng)) return { ok: false, reason: "not_configured" };
  const rawZones = Array.isArray(p.delivery_zones) ? p.delivery_zones : [];
  const zones: DeliveryZone[] = rawZones
    .map((z: any) => ({ max_km: Number(z?.max_km), fee: Number(z?.fee) }))
    .filter((z: DeliveryZone) => isFinite(z.max_km) && z.max_km > 0 && isFinite(z.fee) && z.fee >= 0);
  if (zones.length === 0) return { ok: false, reason: "not_configured" };
  return { ok: true, userId: p.id, storeLat: lat, storeLng: lng, zones };
}

export async function computeDistanceKm(
  storeLat: number,
  storeLng: number,
  destLat: number,
  destLng: number,
): Promise<{ ok: true; km: number } | { ok: false; reason: "out_of_range" | "gateway_error"; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gatewayKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gatewayKey) {
    return { ok: false, reason: "gateway_error", error: "Maps not configured" };
  }
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: storeLat, longitude: storeLng } } } }],
    destinations: [{ waypoint: { location: { latLng: { latitude: destLat, longitude: destLng } } } }],
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
  };
  try {
    const resp = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gatewayKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,condition",
        },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: "gateway_error", error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const arr = (await resp.json()) as Array<{ distanceMeters?: number; condition?: string }>;
    const first = Array.isArray(arr) ? arr[0] : null;
    if (!first || first.condition === "ROUTE_NOT_FOUND" || typeof first.distanceMeters !== "number") {
      return { ok: false, reason: "out_of_range" };
    }
    return { ok: true, km: first.distanceMeters / 1000 };
  } catch (e: any) {
    return { ok: false, reason: "gateway_error", error: e?.message ?? String(e) };
  }
}

export function pickFee(km: number, zones: DeliveryZone[]): number | null {
  const sorted = [...zones].sort((a, b) => a.max_km - b.max_km);
  const match = sorted.find((t) => km <= t.max_km);
  return match ? Number(match.fee) : null;
}