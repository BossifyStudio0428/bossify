import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth as requireSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";

export const loadAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAdminOverviewForUser } = await import("@/lib/admin.server");
    return loadAdminOverviewForUser(context.userId);
  });

export const setAdminSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        months: z.union([z.number().int().min(1).max(120), z.literal("lifetime")]),
        plan: z.enum(["pro", "team_starter", "team_pro", "team_business"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { setAdminSubscriptionPlanForUser } = await import("@/lib/admin.server");
    return setAdminSubscriptionPlanForUser(
      context.userId,
      data.userId,
      data.months,
      data.plan ?? "pro",
    );
  });

export const revokeAdminSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { revokeAdminSubscriptionPlanForUser } = await import("@/lib/admin.server");
    return revokeAdminSubscriptionPlanForUser(context.userId, data.userId);
  });

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

export const getAiUsageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiUsageStats> => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const { externalSupabaseAdmin: db } = await import(
      "@/integrations/supabase/external-admin.server"
    );

    const { data, error } = await db
      .from("ai_usage_logs" as never)
      .select("id, created_at, feature, model, status, error_msg, input_tokens, output_tokens, est_cost_usd")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

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

    let todayCalls = 0, todayCost = 0;
    let monthCalls = 0, monthCost = 0;
    let totalCalls = 0, totalCost = 0;
    const featureMap = new Map<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>();

    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      const cost = Number(r.est_cost_usd ?? 0);
      totalCalls += 1;
      totalCost += cost;
      if (ts >= startOfMonth) { monthCalls += 1; monthCost += cost; }
      if (ts >= startOfToday) { todayCalls += 1; todayCost += cost; }
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
  });
