import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stripe Price IDs (provided by project owner).
const PRICE_IDS: Record<string, string> = {
  "starter:monthly": "price_1TYQzgHkpW03osRD7GNJFs4D",
  "starter:yearly":  "price_1TYR0LHkpW03osRDPHKAU9BF",
  "pro:monthly":     "price_1TYR0xHkpW03osRD8sRq0tO2",
  "pro:yearly":      "price_1TYR1LHkpW03osRDJrShdU7c",
  "lifetime:one":    "price_1TYR1lHkpW03osRD3sRkqZcL",
  "team_starter:monthly":  "price_1TamtmHkpW03osRDhcMkc9bH",
  "team_starter:yearly":   "price_1TamuIHkpW03osRDENjsHuL0",
  "team_pro:monthly":      "price_1TamucHkpW03osRDVEwu8wmD",
  "team_pro:yearly":       "price_1Tamv6HkpW03osRDzhg1ksUP",
  "team_business:monthly": "price_1TamveHkpW03osRDx8m6JVZj",
  "team_business:yearly":  "price_1TamvwHkpW03osRDjjB4ILBg",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Require a valid bearer token. We derive userId from the verified JWT —
    // we do NOT trust any userId or priceId supplied by the client.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { planType, billingCycle } = await req.json();
    if (!planType) {
      return new Response(JSON.stringify({ error: "Missing planType" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cycle = planType === "lifetime" ? "one" : (billingCycle === "annual" || billingCycle === "yearly" ? "yearly" : "monthly");
    // Resolve price ID exclusively from the server-side mapping. Never trust
    // a client-supplied priceId — that would allow plan/price spoofing.
    const priceId = PRICE_IDS[`${planType}:${cycle}`];
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

    const ALLOWED_ORIGINS = new Set([
      "https://bossify-malaysia.lovable.app",
      "https://id-preview--db91ee30-ba9c-4741-9a03-2d8ed9ec2d81.lovable.app",
    ]);
    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ALLOWED_ORIGINS.has(reqOrigin)
      ? reqOrigin
      : "https://bossify-malaysia.lovable.app";
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
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});