import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth as requireSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";
import {
  loadAdminOverviewForUser,
  revokeAdminSubscriptionPlanForUser,
  setAdminSubscriptionPlanForUser,
} from "@/lib/admin.server";

export const loadAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    return revokeAdminSubscriptionPlanForUser(context.userId, data.userId);
  });
