import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadDeliveryConfig, computeDistanceKm, pickFee } from "@/lib/delivery.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Schema = z.object({
  code: z.string().regex(/^[a-z0-9_-]{4,32}$/i),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/delivery-quote")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, reason: "not_configured" });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return json(400, { ok: false, reason: "not_configured" });

        const cfg = await loadDeliveryConfig(parsed.data.code);
        if (!cfg.ok) return json(200, cfg);
        const dist = await computeDistanceKm(cfg.storeLat, cfg.storeLng, parsed.data.destLat, parsed.data.destLng);
        if (!dist.ok) {
          if (dist.reason === "out_of_range") {
            return json(200, { ok: true, km: 0, fee: 0, available: false, reason: "out_of_range" });
          }
          return json(200, { ok: false, reason: "gateway_error", error: dist.error });
        }
        const fee = pickFee(dist.km, cfg.zones);
        if (fee === null) {
          return json(200, { ok: true, km: dist.km, fee: 0, available: false, reason: "out_of_range" });
        }
        return json(200, { ok: true, km: dist.km, fee, available: true });
      },
    },
  },
});