import { createFileRoute } from "@tanstack/react-router";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { verifyTikTokWebhook, mapTikTokStatus } from "@/lib/platforms/tiktok.server";

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

        const shopId: string | undefined = payload.shop_id;
        const eventType: string = String(payload.type ?? "unknown");
        const orderId: string | undefined = payload?.data?.order_id;
        const status: string | undefined = payload?.data?.order_status;

        if (!shopId || !orderId) {
          return new Response("Missing shop_id or order_id", { status: 400 });
        }

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
          return new Response("ok", { status: 200 });
        }

        // First try: connection already has this shop_id recorded.
        let { data: conn } = await supabaseAdmin
          .from("platform_connections" as any)
          .select("user_id, platform_shop_id")
          .eq("platform", "tiktok")
          .eq("platform_shop_id", shopId)
          .maybeSingle();

        // Fallback: no connection matches this shop_id yet — this happens
        // right after OAuth, since we can't call Get Authorized Shops until
        // App Review is approved. Backfill the first active connection
        // that's still missing a shop_id.
        if (!conn) {
          const { data: pending } = await supabaseAdmin
            .from("platform_connections" as any)
            .select("user_id")
            .eq("platform", "tiktok")
            .is("platform_shop_id", null)
            .eq("status", "active")
            .order("connected_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pending) {
            const { data: updated, error: backfillErr } = await supabaseAdmin
              .from("platform_connections" as any)
              .update({ platform_shop_id: shopId })
              .eq("user_id", (pending as any).user_id)
              .eq("platform", "tiktok")
              .select("user_id")
              .maybeSingle();
            if (backfillErr) {
              console.error("[tiktok webhook] shop_id backfill error", backfillErr);
            } else {
              conn = updated as any;
            }
          }
        }

        if (!conn) {
          return new Response("ok (no connection)", { status: 200 });
        }

        const userId = (conn as any).user_id as string;
        const mappedStatus = status ? mapTikTokStatus(status) : "Pending";

        // Check whether we already have a row for this TikTok order. If we
        // do — and it's already been enriched with real financials by the
        // Order Detail sync (financial_status = "complete") — this webhook
        // must ONLY update the fulfillment status, never amount/cost/
        // financial_status. Otherwise a later status-change event (e.g.
        // "shipped") would silently overwrite real data back to a RM0
        // placeholder.
        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id, financial_status")
          .eq("user_id", userId)
          .eq("platform_order_id", orderId)
          .maybeSingle();

        if (existingOrder) {
          const { error: updateErr } = await supabaseAdmin
            .from("orders")
            .update({ status: mappedStatus, platform_metadata: payload } as any)
            .eq("id", (existingOrder as any).id);
          if (updateErr) {
            console.error("[tiktok webhook] order status update error", updateErr);
            return new Response("Order update failed", { status: 500 });
          }
        } else {
          const { error: insertErr } = await supabaseAdmin.from("orders").insert({
            user_id: userId,
            code: `TT-${orderId}`,
            customer_name: "TikTok customer",
            product: "Pending sync",
            product_summary: "Pending sync",
            quantity: 1,
            amount: 0,
            status: mappedStatus,
            order_source: "tiktok",
            platform_order_id: orderId,
            platform_metadata: payload,
            financial_status: "pending",
          } as any);
          if (insertErr) {
            console.error("[tiktok webhook] order insert error", insertErr);
            return new Response("Order write failed", { status: 500 });
          }
        }

        try {
          await supabaseAdmin.from("notifications" as any).insert({
            user_id: userId,
            type: "new_order_tiktok",
            title: "New TikTok Shop order",
            message: `Order ${orderId} — details syncing…`,
            link: "/orders",
          });
        } catch { /* best-effort */ }

        return new Response("ok", { status: 200 });
      },
    },
  },
});