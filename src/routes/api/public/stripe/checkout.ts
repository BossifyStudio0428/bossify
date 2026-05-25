import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getStripe, PRICE_IDS } from "@/lib/stripe.server";

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Schema = z.object({
  planType: z.enum([
    "starter",
    "pro",
    "lifetime",
    "team_starter",
    "team_pro",
    "team_business",
  ]),
  billingCycle: z.string().optional(),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/stripe/checkout")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return json(401, { error: "Unauthorized" });

        const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData?.user) return json(401, { error: "Unauthorized" });
        const userId = userData.user.id;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid request" });
        const { planType, billingCycle } = parsed.data;

        const cycle =
          planType === "lifetime"
            ? "one"
            : billingCycle === "annual" || billingCycle === "yearly"
              ? "yearly"
              : "monthly";
        const priceId = PRICE_IDS[`${planType}:${cycle}`];
        if (!priceId) return json(400, { error: `Unknown plan ${planType}:${cycle}` });

        try {
          const stripe = getStripe();
          const origin =
            request.headers.get("origin") || "https://bossify-malaysia.lovable.app";
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
          return json(200, { url: session.url, sessionId: session.id });
        } catch (e) {
          console.error("[stripe/checkout]", e);
          return json(500, { error: (e as Error).message });
        }
      },
    },
  },
});