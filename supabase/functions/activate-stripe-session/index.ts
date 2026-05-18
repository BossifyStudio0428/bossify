import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICE_TO_PLAN: Record<
  string,
  { plan: "starter" | "pro" | "lifetime"; cycle: "monthly" | "yearly" | "one" }
> = {
  price_1TYSTPHkpW03osRD2lLt5I94: { plan: "starter", cycle: "monthly" },
  price_1TYSTkHkpW03osRDr5iE5FPl: { plan: "starter", cycle: "yearly" },
  price_1TYSU2HkpW03osRDCr8VGM8f: { plan: "pro", cycle: "monthly" },
  price_1TYSUMHkpW03osRDk0i30nI3: { plan: "pro", cycle: "yearly" },
  price_1TYSUlHkpW03osRD7jXc7ZAj: { plan: "lifetime", cycle: "one" },
};

const APP_SUPABASE_URL =
  Deno.env.get("APP_SUPABASE_URL") ?? "https://knouahqwazerjiyiqgmh.supabase.co";
const APP_SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
    const authHeader = req.headers.get("authorization") ?? "";

    const userClient = createClient(APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId = session.client_reference_id || session.metadata?.userId;
    if (sessionUserId !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ activated: false, status: session.payment_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let priceId: string | undefined;
    let currentPeriodEnd: string | null = null;
    let subscriptionId: string | null = null;
    if (session.mode === "subscription" && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      priceId = subscription.items.data[0]?.price.id;
      currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      subscriptionId = subscription.id;
    } else {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
      priceId = lineItems.data[0]?.price?.id;
    }

    const planInfo = priceId ? PRICE_TO_PLAN[priceId] : null;
    if (!planInfo) {
      return new Response(JSON.stringify({ error: "Unknown Stripe price" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row: Record<string, unknown> = {
      user_id: userData.user.id,
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

    const { error } = await userClient.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (error) throw error;

    return new Response(JSON.stringify({ activated: true, plan: planInfo.plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("activate-stripe-session error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
