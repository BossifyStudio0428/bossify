import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stripe Price IDs (provided by project owner).
const PRICE_IDS: Record<string, string> = {
  "starter:monthly": "price_1TYSTPHkpW03osRD2lLt5I94",
  "starter:yearly":  "price_1TYSTkHkpW03osRDr5iE5FPl",
  "pro:monthly":     "price_1TYSU2HkpW03osRDCr8VGM8f",
  "pro:yearly":      "price_1TYSUMHkpW03osRDk0i30nI3",
  "lifetime:one":    "price_1TYSUlHkpW03osRD7jXc7ZAj",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { priceId: clientPriceId, userId, planType, billingCycle } = await req.json();
    if (!userId || !planType) {
      return new Response(JSON.stringify({ error: "Missing userId or planType" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cycle = planType === "lifetime" ? "one" : (billingCycle === "annual" || billingCycle === "yearly" ? "yearly" : "monthly");
    const priceId = clientPriceId || PRICE_IDS[`${planType}:${cycle}`];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `Unknown plan ${planType}:${cycle}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = new Stripe(secret, { apiVersion: "2024-11-20.acacia" });

    const origin = req.headers.get("origin") || "https://bossify-malaysia.lovable.app";
    const session = await stripe.checkout.sessions.create({
      mode: planType === "lifetime" ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans`,
      client_reference_id: userId,
      metadata: { userId, planType, billingCycle: cycle },
      ...(planType !== "lifetime" && {
        subscription_data: { metadata: { userId, planType, billingCycle: cycle } },
      }),
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-stripe-checkout error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});