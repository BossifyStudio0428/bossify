import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth as requireSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify admin access");
  if (!data?.is_admin) throw new Response("Forbidden", { status: 403 });
}

export const loadAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [{ data: users, error: usersError }, { data: orders, error: ordersError }] = await Promise.all([
      supabaseAdmin.from("admin_users_view" as any).select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    if (usersError || ordersError) throw new Error("Unable to load admin data");
    return { isAdmin: true, users: users ?? [], orders: orders ?? [] };
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
    await assertAdmin(context.userId);

    const expires = data.months === "lifetime"
      ? new Date(2099, 0, 1)
      : new Date(Date.now() + data.months * 30 * 24 * 60 * 60 * 1000);

    const plan = data.plan ?? "pro";

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan,
        status: "active",
        expires_at: expires.toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq("user_id", data.userId);

    if (error) throw new Error("Unable to update subscription");
    return { ok: true };
  });

export const revokeAdminSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ plan: "free", status: "active", expires_at: null })
      .eq("user_id", data.userId);

    if (error) throw new Error("Unable to update subscription");
    return { ok: true };
  });