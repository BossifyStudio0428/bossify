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
