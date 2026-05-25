import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getStripe, priceToPlan } from "@/lib/stripe.server";
import { externalSupabaseAdmin } from "@/integrations/supabase/external-admin.server";

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/stripe/activate")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      POST: async ({ request }) => {
        try {
          const { sessionId } = (await request.json()) as { sessionId?: string };
          if (!sessionId || typeof sessionId !== "string") {
            return json(400, { error: "Missing sessionId" });
          }

          const authHeader = request.headers.get("authorization") ?? "";
          const userClient = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: userData, error: userErr } = await userClient.auth.getUser();
          if (userErr || !userData.user) return json(401, { error: "Not signed in" });

          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const sessionUserId = session.client_reference_id || session.metadata?.userId;
          if (sessionUserId !== userData.user.id) {
            return json(403, { error: "Session does not belong to this user" });
          }
          if (session.payment_status !== "paid") {
            return json(200, { activated: false, status: session.payment_status });
          }

          let priceId: string | undefined;
          let currentPeriodEnd: string | null = null;
          let subscriptionId: string | null = null;
          if (session.mode === "subscription" && session.subscription) {
            const sub = (await stripe.subscriptions.retrieve(
              session.subscription as string,
            )) as any;
            priceId = sub.items.data[0]?.price.id;
            currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
            subscriptionId = sub.id;
          } else {
            const line = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
            priceId = line.data[0]?.price?.id;
          }

          const planInfo = priceToPlan(priceId);
          if (!planInfo) return json(400, { error: "Unknown Stripe price" });

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

          const { error } = await externalSupabaseAdmin
            .from("subscriptions")
            .upsert(row as any, { onConflict: "user_id" });
          if (error) throw error;

          return json(200, { activated: true, plan: planInfo.plan });
        } catch (e) {
          console.error("[stripe/activate]", e);
          return json(500, { error: (e as Error).message });
        }
      },
    },
  },
});