import "@tanstack/react-start/server-only";

import { z } from "zod";
import { getPublicOrderClient } from "./public-order.server";

const REF_RE = /^[A-Za-z0-9_-]{4,40}$/;

export type TrackingResult =
  | {
      ok: true;
      order: {
        code: string;
        customer_name: string;
        product: string;
        quantity: number;
        amount: number;
        status: string;
        delivery_address: string | null;
        delivery_status: string;
        estimated_arrival: string | null;
        notes: string | null;
        created_at: string;
        delivery_method: string | null;
      };
      business: {
        name: string;
        whatsapp_number: string | null;
        store_address: string | null;
      };
    }
  | { ok: false; reason: "not_found" };

export async function loadTrackingInfo(rawRef: string): Promise<TrackingResult> {
  const parsed = z.object({ ref: z.string().regex(REF_RE) }).safeParse({ ref: rawRef });
  if (!parsed.success) return { ok: false, reason: "not_found" };
  const ref = parsed.data.ref;
  try {
    const sb = getPublicOrderClient() as any;
    const { data: order, error } = await sb
      .from("orders")
      .select(
        "code, customer_name, product, quantity, amount, status, delivery_address, delivery_status, estimated_arrival, notes, created_at, user_id, delivery_method, store_address_snapshot",
      )
      .eq("code", ref)
      .maybeSingle();
    if (error || !order) return { ok: false, reason: "not_found" };

    const { data: profile } = await sb
      .from("profiles")
      .select("business_name, whatsapp_number, store_address")
      .eq("id", order.user_id)
      .maybeSingle();

    return {
      ok: true,
      order: {
        code: order.code,
        customer_name: order.customer_name,
        product: order.product,
        quantity: Number(order.quantity ?? 1),
        amount: Number(order.amount ?? 0),
        status: order.status,
        delivery_address: order.delivery_address ?? null,
        delivery_status: order.delivery_status ?? "confirmed",
        estimated_arrival: order.estimated_arrival ?? null,
        notes: order.notes ?? null,
        created_at: order.created_at,
        delivery_method:
          (order.delivery_method as string | null) ??
          (order.delivery_address ? "delivery" : null),
      },
      business: {
        name: profile?.business_name ?? "",
        whatsapp_number: profile?.whatsapp_number ?? null,
        store_address:
          (order.store_address_snapshot as string | null) ??
          profile?.store_address ??
          null,
      },
    };
  } catch (e) {
    console.error("[loadTrackingInfo] threw", e);
    return { ok: false, reason: "not_found" };
  }
}