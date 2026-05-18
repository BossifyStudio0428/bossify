import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const APP_SUPABASE_URL =
  Deno.env.get("APP_SUPABASE_URL") ?? "https://knouahqwazerjiyiqgmh.supabase.co";
const APP_SERVICE_ROLE_KEY =
  Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEYS") ??
  Deno.env.get("Secret_Key") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY);
const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });

function priceToPlan(
  priceId: string | null | undefined,
): { plan: "starter" | "pro" | "lifetime"; cycle: "monthly" | "yearly" | "one" } | null {
  const map: Record<
    string,
    { plan: "starter" | "pro" | "lifetime"; cycle: "monthly" | "yearly" | "one" }
  > = {
    price_1TYSTPHkpW03osRD2lLt5I94: { plan: "starter", cycle: "monthly" },
    price_1TYSTkHkpW03osRDr5iE5FPl: { plan: "starter", cycle: "yearly" },
    price_1TYSU2HkpW03osRDCr8VGM8f: { plan: "pro", cycle: "monthly" },
    price_1TYSUMHkpW03osRDk0i30nI3: { plan: "pro", cycle: "yearly" },
    price_1TYSUlHkpW03osRD7jXc7ZAj: { plan: "lifetime", cycle: "one" },
  };
  return priceId ? (map[priceId] ?? null) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (!webhookSecret) {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed", e);
    return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        if (!userId) {
          console.warn("[stripe-webhook] no userId on session");
          break;
        }

        let planInfo: ReturnType<typeof priceToPlan> = null;
        let currentPeriodEnd: string | null = null;
        let subscriptionId: string | null = null;

        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id;
          planInfo = priceToPlan(priceId);
          currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
          subscriptionId = sub.id;
        } else {
          // One-time (lifetime)
          const line = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          planInfo = priceToPlan(line.data[0]?.price?.id);
        }

        if (!planInfo) {
          console.warn("[stripe-webhook] unknown price");
          break;
        }

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
        const { error } = await supabase
          .from("subscriptions")
          .upsert(row, { onConflict: "user_id" });
        if (error) console.error("[stripe-webhook] upsert failed", error);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) {
          console.warn("[stripe-webhook] no userId on subscription");
          break;
        }
        const { error } = await supabase
          .from("subscriptions")
          .update({
            plan: "free",
            status: "active",
            provider_product_id: null,
            current_period_end: null,
          })
          .eq("user_id", userId);
        if (error) console.error("[stripe-webhook] downgrade failed", error);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = (
          invoice.subscription_details?.metadata as Record<string, string> | undefined
        )?.userId;
        if (userId) {
          const { error } = await supabase
            .from("subscriptions")
            .update({
              status: "past_due",
            })
            .eq("user_id", userId);
          if (error) console.error("[stripe-webhook] mark past_due failed", error);
        }
        break;
      }

      default:
        // ignore other events
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e);
    return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
  }
});
