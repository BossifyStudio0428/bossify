import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  code: z.string().regex(/^[a-z0-9_-]{4,32}$/i),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
});

export type DeliveryQuote =
  | { ok: true; km: number; fee: number; available: boolean; reason?: "out_of_range" }
  | { ok: false; reason: "not_configured" | "disabled" | "not_found" | "gateway_error"; error?: string };

export const computeDeliveryFee = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<DeliveryQuote> => {
    const { loadDeliveryConfig, computeDistanceKm, pickFee } = await import("./delivery.server");
    const cfg = await loadDeliveryConfig(data.code);
    if (!cfg.ok) return cfg;
    const dist = await computeDistanceKm(cfg.storeLat, cfg.storeLng, data.destLat, data.destLng);
    if (!dist.ok) {
      if (dist.reason === "out_of_range") return { ok: true, km: 0, fee: 0, available: false, reason: "out_of_range" };
      return { ok: false, reason: "gateway_error", error: dist.error };
    }
    const fee = pickFee(dist.km, cfg.zones);
    if (fee === null) return { ok: true, km: dist.km, fee: 0, available: false, reason: "out_of_range" };
    return { ok: true, km: dist.km, fee, available: true };
  });