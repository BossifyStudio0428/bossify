import { createFileRoute } from "@tanstack/react-router";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { verifyTikTokWebhook, mapTikTokStatus } from "@/lib/platforms/tiktok.server";

/**
 * TikTok Shop order webhook receiver.
 * Docs: https://partner.tiktokshop.com/docv2/page/650a14868d0e3702c0727e6c
 *
 * Flow:
 *   1. Verify HMAC signature (rejects forged requests).
 *   2. Idempotency: insert into platform_order_events (unique constraint blocks duplicates).
 *   3. Look up which seller owns the shop_id and insert/update orders row.
 *
 * NOTE: this is the receive-and-record path. Order detail enrichment (line items,
 * customer name, amounts) is done by a separate fetch using the seller's stored
 * access token — kept out of the webhook to keep the response under TikTok's
 * 5-second timeout. That enrichment lives in the cron sync route.
 */
export const Route = createFileRoute("/api/public/webhooks/tiktok")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("authorization");

        if (!verifyTikTokWebhook(rawBody, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // TikTok payload shape: { type, shop_id, timestamp, data: { order_id, order_status, ... } }
        const shopId: string | undefined = payload.shop_id;
        const eventType: string = String(payload.type ?? "unknown");
        const orderId: string | undefined = payload?.data?.order_id;
        const status: string | undefined = payload?.data?.order_status;

        if (!shopId || !orderId) {
          return new Response("Missing shop_id or order_id", { status: 400 });
        }

        // Idempotency log — duplicate deliveries are silently swallowed.
        const { error: logErr } = await supabaseAdmin
          .from("platform_order_events" as any)
          .insert({
            platform: "tiktok",
            platform_order_id: orderId,
            event_type: eventType,
            raw_payload: payload,
          });
        if (logErr && !logErr.message.includes("duplicate")) {
          console.error("[tiktok webhook] event log error", logErr);
        } else if (logErr) {
          // duplicate — ack and exit
          return new Response("ok", { status: 200 });
        }

        // Find which Bossify user owns this shop.
        const { data: conn } = await supabaseAdmin
          .from("platform_connections" as any)
          .select("user_id")
          .eq("platform", "tiktok")
          .eq("platform_shop_id", shopId)
          .maybeSingle();

        if (!conn) {
          // No connection — accept the webhook (to avoid retries) but skip processing.
          return new Response("ok (no connection)", { status: 200 });
        }

        const userId = (conn as any).user_id as string;
        const mappedStatus = status ? mapTikTokStatus(status) : "Pending";

        // Upsert minimal order row. Detail enrichment happens in the cron sync.
        const { error: orderErr } = await supabaseAdmin.from("orders").upsert(
          {
            user_id: userId,
            code: `TT-${orderId}`,
            customer_name: "TikTok customer",
            product: "Pending sync",
            quantity: 1,
            amount: 0,
            status: mappedStatus,
            order_source: "tiktok",
            platform_order_id: orderId,
            platform_metadata: payload,
          },
          { onConflict: "user_id,platform_order_id" } as any
        );
        if (orderErr) {
          console.error("[tiktok webhook] order upsert error", orderErr);
          return new Response("Order write failed", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});