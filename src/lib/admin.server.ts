import { isPaidStatus } from "@/lib/orderMath";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";

export type AiUsageStats = {
  today: { calls: number; cost_usd: number };
  this_month: { calls: number; cost_usd: number };
  total: { calls: number; cost_usd: number };
  by_feature: Array<{
    feature: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
  recent_failures: Array<{
    id: string;
    created_at: string;
    feature: string;
    model: string;
    status: string;
    error_msg: string | null;
  }>;
};

const emptyAiUsageStats = (): AiUsageStats => ({
  today: { calls: 0, cost_usd: 0 },
  this_month: { calls: 0, cost_usd: 0 },
  total: { calls: 0, cost_usd: 0 },
  by_feature: [],
  recent_failures: [],
});

export async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error("Unable to verify admin access");
  if (!data?.is_admin) throw new Response("Forbidden", { status: 403 });
}

// ------------------------------------------------------------
// Admin overview
// ------------------------------------------------------------

/** Published list prices (RM). Used only to ESTIMATE Bossify's monthly
 *  subscription income on the admin page — not money actually received
 *  (no refunds, fees or Google's cut). Yearly plans count as price / 12. */
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  pro: { monthly: 19.9, yearly: 199 },
  business: { monthly: 49.9, yearly: 499 },
};

export type AdminSubscriptionKind = "paid" | "lifetime_paid" | "gifted" | "free";

export type AdminTikTokConnection = {
  status: string;
  shop_name: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type AdminUserRow = {
  id: string;
  business_name: string | null;
  is_admin: boolean | null;
  created_at: string;
  plan: string;
  status: string | null;
  expires_at: string | null;
  current_period_end: string | null;
  order_count: number;
  total_orders: number;
  /** The user's OWN shop sales (their customers' paid orders) — not Bossify income. */
  total_revenue: number;
  tiktok_orders: number;
  provider: string | null;
  billing_cycle: "monthly" | "yearly" | "one" | null;
  subscription_kind: AdminSubscriptionKind;
  /** Estimated monthly subscription value this user brings Bossify (RM). */
  monthly_value: number;
  tiktok: AdminTikTokConnection | null;
};

export type AdminSummary = {
  monthly_income: number;
  paying_users: number;
  gifted_users: number;
  lifetime_paid_users: number;
  plan_breakdown: Array<{ key: string; count: number; monthly: number }>;
  tiktok_connected: number;
  tiktok_errors: number;
  shop_sales_total: number;
  total_orders: number;
};

export type AdminRecentOrder = {
  id: string;
  code: string;
  user_id: string;
  customer_name: string;
  product: string;
  amount: number;
  status: string;
  order_source: string | null;
  created_at: string;
};

const PAGE = 1000;

/** Reads every order row (only the columns the totals need), page by page —
 *  a plain select stops at 1,000 rows and would undercount. */
async function fetchAllOrderTotalsRows() {
  const rows: Array<{ user_id: string; amount: number | null; status: string | null; financial_status: string | null; order_source: string | null }> = [];
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("user_id,amount,status,financial_status,order_source")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as any[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function cycleOf(productId: string | null | undefined, plan: string): "monthly" | "yearly" | "one" | null {
  if (plan === "lifetime") return "one";
  if (!productId) return null;
  return /:(yearly|annual)$/i.test(productId) ? "yearly" : "monthly";
}

export async function loadAdminOverviewForUser(userId: string) {
  await assertAdmin(userId);

  const [profilesResult, subscriptionsResult, recentOrdersResult, connectionsResult, orderRows] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,business_name,is_admin,created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("subscriptions")
      .select("user_id,plan,status,expires_at,current_period_end,order_count,provider,provider_product_id"),
    supabaseAdmin
      .from("orders")
      .select("id,code,user_id,customer_name,product,amount,status,order_source,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    // Never select the token columns — only what the admin page shows.
    supabaseAdmin
      .from("platform_connections" as any)
      .select("user_id,platform,status,platform_shop_name,connected_at,last_synced_at,last_error")
      .eq("platform", "tiktok"),
    fetchAllOrderTotalsRows(),
  ]);

  if (profilesResult.error || subscriptionsResult.error || recentOrdersResult.error) {
    console.error("loadAdminOverviewForUser failed", {
      profiles: profilesResult.error,
      subscriptions: subscriptionsResult.error,
      orders: recentOrdersResult.error,
    });
    throw new Error("Unable to load admin data");
  }
  if (connectionsResult.error) console.warn("[admin] platform_connections read failed", connectionsResult.error);

  const activeSub = (s: { plan?: string | null; status?: string | null; expires_at?: string | null; current_period_end?: string | null }) => {
    const plan = (s.plan ?? "free").toLowerCase();
    if (!plan || plan === "free") return false;
    if ((s.status ?? "active").toLowerCase() !== "active") return false;
    if (plan === "lifetime") return true;
    const periodEnd = s.current_period_end ?? s.expires_at;
    return !periodEnd || new Date(periodEnd).getTime() >= Date.now();
  };
  const subMap = new Map<string, any>();
  for (const sub of (subscriptionsResult.data ?? []) as any[]) {
    const current = subMap.get(sub.user_id);
    if (!current || (activeSub(sub) && !activeSub(current))) subMap.set(sub.user_id, sub);
  }

  const tiktokByUser = new Map<string, AdminTikTokConnection>();
  for (const c of ((connectionsResult.data ?? []) as any[])) {
    tiktokByUser.set(c.user_id, {
      status: c.status ?? "unknown",
      shop_name: c.platform_shop_name ?? null,
      connected_at: c.connected_at ?? null,
      last_synced_at: c.last_synced_at ?? null,
      last_error: c.last_error ?? null,
    });
  }

  const salesByUser = new Map<string, { orders: number; sales: number; tiktok: number }>();
  for (const o of orderRows) {
    const cur = salesByUser.get(o.user_id) ?? { orders: 0, sales: 0, tiktok: 0 };
    cur.orders += 1;
    if (o.order_source === "tiktok") cur.tiktok += 1;
    // Same rule as the rest of the app: paid / shipped / delivered, and not
    // a TikTok order still waiting for its real amount.
    if (isPaidStatus(o.status) && o.financial_status !== "pending") cur.sales += Number(o.amount ?? 0);
    salesByUser.set(o.user_id, cur);
  }

  const breakdown = new Map<string, { count: number; monthly: number }>();
  const users: AdminUserRow[] = (profilesResult.data ?? []).map((profile: any) => {
    const sub = subMap.get(profile.id);
    const plan = String(sub?.plan ?? "free").toLowerCase();
    const active = sub ? activeSub(sub) : false;
    const provider: string | null = sub?.provider ?? null;
    const paidProvider = provider === "stripe" || provider === "google_play";
    const cycle = active ? cycleOf(sub?.provider_product_id, plan) : null;

    let kind: AdminSubscriptionKind = "free";
    let monthly = 0;
    if (active) {
      if (!paidProvider) kind = "gifted";
      else if (plan === "lifetime") kind = "lifetime_paid";
      else {
        kind = "paid";
        const price = PLAN_PRICES[plan];
        if (price) monthly = cycle === "yearly" ? price.yearly / 12 : price.monthly;
      }
    }
    if (active && !profile.is_admin) {
      const key = kind === "gifted" ? "gifted" : kind === "lifetime_paid" ? "lifetime" : `${plan}:${cycle ?? "monthly"}`;
      const b = breakdown.get(key) ?? { count: 0, monthly: 0 };
      b.count += 1;
      b.monthly += monthly;
      breakdown.set(key, b);
    }

    const s = salesByUser.get(profile.id) ?? { orders: 0, sales: 0, tiktok: 0 };
    return {
      id: profile.id,
      business_name: profile.business_name ?? null,
      is_admin: profile.is_admin ?? null,
      created_at: profile.created_at,
      plan: sub?.plan ?? "free",
      status: sub?.status ?? null,
      expires_at: sub?.expires_at ?? null,
      current_period_end: sub?.current_period_end ?? null,
      order_count: Number(sub?.order_count ?? 0),
      total_orders: Math.max(s.orders, Number(sub?.order_count ?? 0)),
      total_revenue: Math.round(s.sales * 100) / 100,
      tiktok_orders: s.tiktok,
      provider,
      billing_cycle: cycle,
      subscription_kind: kind,
      monthly_value: Math.round(monthly * 100) / 100,
      tiktok: tiktokByUser.get(profile.id) ?? null,
    };
  });

  // Totals leave out admin accounts (the owner's own test data).
  const real = users.filter((u) => !u.is_admin);
  const summary: AdminSummary = {
    monthly_income: Math.round(real.reduce((s, u) => s + u.monthly_value, 0) * 100) / 100,
    paying_users: real.filter((u) => u.subscription_kind === "paid").length,
    gifted_users: real.filter((u) => u.subscription_kind === "gifted").length,
    lifetime_paid_users: real.filter((u) => u.subscription_kind === "lifetime_paid").length,
    plan_breakdown: Array.from(breakdown.entries())
      .map(([key, v]) => ({ key, count: v.count, monthly: Math.round(v.monthly * 100) / 100 }))
      .sort((a, b) => b.monthly - a.monthly || b.count - a.count),
    tiktok_connected: real.filter((u) => u.tiktok?.status === "active").length,
    tiktok_errors: real.filter((u) => u.tiktok && (u.tiktok.status !== "active" || !!u.tiktok.last_error)).length,
    shop_sales_total: Math.round(real.reduce((s, u) => s + u.total_revenue, 0) * 100) / 100,
    total_orders: real.reduce((s, u) => s + u.total_orders, 0),
  };

  const orders = ((recentOrdersResult.data ?? []) as any[]) as AdminRecentOrder[];
  return { isAdmin: true, users, orders, summary };
}

export async function getAiUsageStatsForAdmin(userId: string): Promise<AiUsageStats> {
  await assertAdmin(userId);

  const { data, error } = await supabaseAdmin
    .from("ai_usage_logs" as never)
    .select("id, created_at, feature, model, status, error_msg, input_tokens, output_tokens, est_cost_usd")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    const message = error.message ?? "";
    if (message.includes("ai_usage_logs") || message.includes("does not exist")) {
      console.warn("AI usage table is not available yet", error);
      return emptyAiUsageStats();
    }
    throw new Error(message || "Unable to load AI usage data");
  }

  type Row = {
    id: string;
    created_at: string;
    feature: string;
    model: string;
    status: string;
    error_msg: string | null;
    input_tokens: number;
    output_tokens: number;
    est_cost_usd: number;
  };
  const rows = (data ?? []) as unknown as Row[];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todayCalls = 0;
  let todayCost = 0;
  let monthCalls = 0;
  let monthCost = 0;
  let totalCalls = 0;
  let totalCost = 0;
  const featureMap = new Map<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>();

  for (const r of rows) {
    const ts = new Date(r.created_at).getTime();
    const cost = Number(r.est_cost_usd ?? 0);
    totalCalls += 1;
    totalCost += cost;
    if (ts >= startOfMonth) {
      monthCalls += 1;
      monthCost += cost;
    }
    if (ts >= startOfToday) {
      todayCalls += 1;
      todayCost += cost;
    }
    const fm = featureMap.get(r.feature) ?? { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    fm.calls += 1;
    fm.input_tokens += Number(r.input_tokens ?? 0);
    fm.output_tokens += Number(r.output_tokens ?? 0);
    fm.cost_usd += cost;
    featureMap.set(r.feature, fm);
  }

  return {
    today: { calls: todayCalls, cost_usd: todayCost },
    this_month: { calls: monthCalls, cost_usd: monthCost },
    total: { calls: totalCalls, cost_usd: totalCost },
    by_feature: Array.from(featureMap.entries())
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.cost_usd - a.cost_usd),
    recent_failures: rows
      .filter((r) => r.status !== "ok")
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        created_at: r.created_at,
        feature: r.feature,
        model: r.model,
        status: r.status,
        error_msg: r.error_msg,
      })),
  };
}

export async function setAdminSubscriptionPlanForUser(
  adminUserId: string,
  targetUserId: string,
  months: number | "lifetime",
  plan: "pro" | "team_starter" | "team_pro" | "team_business" = "pro",
) {
  await assertAdmin(adminUserId);

  const expires =
    months === "lifetime"
      ? new Date(2099, 0, 1)
      : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: targetUserId,
      plan,
      status: "active",
      expires_at: expires.toISOString(),
      current_period_end: months === "lifetime" ? null : expires.toISOString(),
      started_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("setAdminSubscriptionPlan failed", error);
    throw new Error(`Unable to update subscription: ${error.message}`);
  }

  if (plan === "team_starter" || plan === "team_pro" || plan === "team_business") {
    const { data: existingTeam } = await supabaseAdmin
      .from("teams")
      .select("id, plan")
      .eq("owner_id", targetUserId)
      .maybeSingle();

    const periodEnd = months === "lifetime" ? null : expires.toISOString();

    if (!existingTeam) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("business_name")
        .eq("id", targetUserId)
        .maybeSingle();
      const name = (profile?.business_name as string | null)?.trim() || "My Team";

      const { data: newTeam, error: teamErr } = await supabaseAdmin
        .from("teams" as never)
        .insert({ name, owner_id: targetUserId, plan, current_period_end: periodEnd } as never)
        .select("id")
        .single();
      if (teamErr) {
        console.error("auto-create team failed", teamErr);
      } else if (newTeam) {
        const { error: memErr } = await supabaseAdmin.from("team_members" as never).insert({
          team_id: (newTeam as { id: string }).id,
          user_id: targetUserId,
          role: "owner",
          status: "active",
          joined_at: new Date().toISOString(),
        } as never);
        if (memErr) console.error("auto-create owner membership failed", memErr);
      }
    } else {
      await supabaseAdmin
        .from("teams" as never)
        .update({ plan, current_period_end: periodEnd } as never)
        .eq("id", existingTeam.id);
    }
  }

  return { ok: true };
}

export async function revokeAdminSubscriptionPlanForUser(
  adminUserId: string,
  targetUserId: string,
) {
  await assertAdmin(adminUserId);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ plan: "free", status: "active", expires_at: null, current_period_end: null })
    .eq("user_id", targetUserId);

  if (error) {
    console.error("revokeAdminSubscriptionPlan failed", error);
    throw new Error(`Unable to update subscription: ${error.message}`);
  }
  return { ok: true };
}
