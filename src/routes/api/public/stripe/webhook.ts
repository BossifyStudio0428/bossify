import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { getStripe, priceToPlan } from "@/lib/stripe.server";
import { externalSupabaseAdmin } from "@/integrations/supabase/external-admin.server";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const body = await request.text();
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) return new Response("Webhook secret not configured", { status: 500 });
        if (!signature) return new Response("Missing stripe-signature", { status: 400 });

        const stripe = getStripe();
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
        } catch (e) {
          return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId = session.client_reference_id || session.metadata?.userId;
              if (!userId) break;

              let planInfo: ReturnType<typeof priceToPlan> = null;
              let currentPeriodEnd: string | null = null;
              let subscriptionId: string | null = null;

              if (session.mode === "subscription" && session.subscription) {
                const sub = (await stripe.subscriptions.retrieve(
                  session.subscription as string,
                )) as any;
                planInfo = priceToPlan(sub.items.data[0]?.price.id);
                currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
                subscriptionId = sub.id;
              } else {
                const line = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
                planInfo = priceToPlan(line.data[0]?.price?.id);
              }
              if (!planInfo) break;

              const row: Record<string, unknown> = {
                user_id: userId,
                plan: planInfo.plan,
                status: "active",
                provider: "stripe",
                provider_product_id: `${planInfo.plan}:${planInfo.cycle}`,
                provider_transaction_id: session.id,
                provider_purchase_token: subscriptionId,
                current_period_end: currentPeriodEnd,
              };
              if (planInfo.plan === "lifetime") {
                row.lifetime_purchase_date = new Date().toISOString();
                row.lifetime_google_token = null;
                row.current_period_end = null;
              }
              const { error } = await externalSupabaseAdmin
                .from("subscriptions")
                .upsert(row as any, { onConflict: "user_id" });
              if (error) console.error("[stripe webhook] upsert", error);
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.userId;
              if (!userId) break;
              await externalSupabaseAdmin
                .from("subscriptions")
                .update({
                  plan: "free",
                  status: "active",
                  provider_product_id: null,
                  current_period_end: null,
                } as any)
                .eq("user_id", userId);
              break;
            }
            case "invoice.payment_failed": {
              const invoice = event.data.object as any;
              const userId = invoice.subscription_details?.metadata?.userId;
              if (userId) {
                await externalSupabaseAdmin
                  .from("subscriptions")
                  .update({ status: "past_due" } as any)
                  .eq("user_id", userId);
              }
              break;
            }
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("[stripe webhook] handler", e);
          return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});