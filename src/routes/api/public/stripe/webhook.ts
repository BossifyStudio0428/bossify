import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { getStripe, priceToPlan } from "@/lib/stripe.server";
import { externalSupabaseAdmin } from "@/integrations/supabase/external-admin.server";

// ------------------------------------------------------------
// Team-plan lifecycle. Ported from the legacy Supabase Edge Function
// (supabase/functions/stripe-webhook), which used to be the only place
// this lived — so this route can be the single Stripe webhook.
// When the team OWNER's plan ends, members are suspended and moved to
// free; when the owner (re)subscribes to a team plan, they come back.
// ------------------------------------------------------------
const TEAM_PLANS = new Set(["team_starter", "team_pro", "team_business"]);

// Same push function the app itself calls (see src/lib/sendPush.ts).
const PUSH_ENDPOINT = "https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push";

type PushText = Record<string, { title: string; body: string }>;
const SUSPEND_MSG: PushText = {
  en: { title: "Team plan expired", body: "Team plan has expired. You have been moved back to the free plan." },
  ms: { title: "Pelan pasukan tamat", body: "Pelan pasukan telah tamat, anda telah dipindahkan ke pelan percuma" },
  zh: { title: "团队计划已到期", body: "团队计划已到期，你已被移回免费版" },
};
const RENEW_MSG: PushText = {
  en: { title: "Team plan renewed", body: "Team plan renewed. Welcome back!" },
  ms: { title: "Pelan pasukan diperbaharui", body: "Pelan pasukan telah diperbaharui, selamat kembali!" },
  zh: { title: "团队计划已续订", body: "团队计划已续订，欢迎回来！" },
};

/** Best-effort push to one team member. Skipped silently when the
 * PUSH_WEBHOOK_SECRET isn't configured; never blocks the plan change. */
async function pushToMember(userId: string, msgMap: PushText) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) return;
  try {
    const { data: prof } = await externalSupabaseAdmin
      .from("profiles")
      .select("language")
      .eq("id", userId)
      .maybeSingle();
    const profLang = (prof as any)?.language;
    const lang = ["en", "ms", "zh"].includes(profLang) ? (profLang as string) : "en";
    const m = msgMap[lang] ?? msgMap.en;
    await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ kind: "team_status", targetUserId: userId, title: m.title, body: m.body, link: "/team" }),
    });
  } catch (e) {
    console.error("[stripe webhook] team push failed", e);
  }
}

/** Member user ids (excluding the owner) for each team this user owns. */
async function teamMemberIdsByTeam(ownerUserId: string): Promise<Array<{ teamId: string; userIds: string[] }>> {
  const { data: teams } = await externalSupabaseAdmin.from("teams" as any).select("id").eq("owner_id", ownerUserId);
  const out: Array<{ teamId: string; userIds: string[] }> = [];
  for (const t of ((teams ?? []) as any[])) {
    const { data: members } = await externalSupabaseAdmin
      .from("team_members" as any)
      .select("user_id")
      .eq("team_id", t.id)
      .neq("user_id", ownerUserId);
    const userIds = ((members ?? []) as any[]).map((m) => m.user_id).filter((u): u is string => !!u);
    out.push({ teamId: t.id as string, userIds });
  }
  return out;
}

async function suspendTeamMembers(ownerUserId: string) {
  for (const { teamId, userIds } of await teamMemberIdsByTeam(ownerUserId)) {
    if (userIds.length === 0) continue;
    await externalSupabaseAdmin
      .from("team_members" as any)
      .update({ status: "suspended" } as any)
      .eq("team_id", teamId)
      .in("user_id", userIds);
    await externalSupabaseAdmin
      .from("subscriptions")
      .update({ plan: "free", status: "active", current_period_end: null } as any)
      .in("user_id", userIds);
    for (const uid of userIds) await pushToMember(uid, SUSPEND_MSG);
  }
}

async function reactivateTeamMembers(ownerUserId: string, newPlan: string) {
  for (const { teamId, userIds } of await teamMemberIdsByTeam(ownerUserId)) {
    await externalSupabaseAdmin.from("teams" as any).update({ plan: newPlan } as any).eq("id", teamId);
    if (userIds.length === 0) continue;
    await externalSupabaseAdmin
      .from("team_members" as any)
      .update({ status: "active" } as any)
      .eq("team_id", teamId)
      .in("user_id", userIds);
    await externalSupabaseAdmin
      .from("subscriptions")
      .update({ plan: newPlan, status: "active" } as any)
      .in("user_id", userIds);
    for (const uid of userIds) await pushToMember(uid, RENEW_MSG);
  }
}

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
          // Worker runtime has no Node `crypto`; use the Web Crypto provider
          // so signature verification works.
          event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            webhookSecret,
            undefined,
            Stripe.createSubtleCryptoProvider(),
          );
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

              // Team plan: bring the owner's team members back with it.
              if (TEAM_PLANS.has(planInfo.plan)) {
                await reactivateTeamMembers(userId, planInfo.plan).catch((e) =>
                  console.error("[stripe webhook] reactivate failed", e),
                );
              }
              break;
            }
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const userId = sub.metadata?.userId;
              if (!userId) break;
              // If this user owned a team plan, suspend their members first.
              const { data: existing } = await externalSupabaseAdmin
                .from("subscriptions")
                .select("plan")
                .eq("user_id", userId)
                .maybeSingle();
              const prevPlan = (existing as any)?.plan as string | undefined;
              if (prevPlan && TEAM_PLANS.has(prevPlan)) {
                await suspendTeamMembers(userId).catch((e) =>
                  console.error("[stripe webhook] suspend failed", e),
                );
              }
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