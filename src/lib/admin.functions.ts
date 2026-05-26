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
      .upsert({
        user_id: data.userId,
        plan,
        status: "active",
        expires_at: expires.toISOString(),
        current_period_end: data.months === "lifetime" ? null : expires.toISOString(),
        started_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      console.error("setAdminSubscriptionPlan failed", error);
      throw new Error(`Unable to update subscription: ${error.message}`);
    }

    // Auto-create team + owner membership for team plans so the user
    // immediately sees the team management page.
    if (plan === "team_starter" || plan === "team_pro" || plan === "team_business") {
      const { data: existingTeam } = await supabaseAdmin
        .from("teams")
        .select("id, plan")
        .eq("owner_id", data.userId)
        .maybeSingle();

      const periodEnd = data.months === "lifetime" ? null : expires.toISOString();

      if (!existingTeam) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("business_name")
          .eq("id", data.userId)
          .maybeSingle();
        const name = (profile?.business_name as string | null)?.trim() || "My Team";

        const { data: newTeam, error: teamErr } = await supabaseAdmin
          .from("teams" as any)
          .insert({ name, owner_id: data.userId, plan, current_period_end: periodEnd } as any)
          .select("id")
          .single();
        if (teamErr) {
          console.error("auto-create team failed", teamErr);
        } else if (newTeam) {
          const { error: memErr } = await supabaseAdmin
            .from("team_members" as any)
            .insert({
              team_id: (newTeam as any).id,
              user_id: data.userId,
              role: "owner",
              status: "active",
              joined_at: new Date().toISOString(),
            } as any);
          if (memErr) console.error("auto-create owner membership failed", memErr);
        }
      } else {
        // Keep plan + renewal in sync
        await supabaseAdmin
          .from("teams" as any)
          .update({ plan, current_period_end: periodEnd } as any)
          .eq("id", existingTeam.id);
      }
    }

    return { ok: true };
  });

export const revokeAdminSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ plan: "free", status: "active", expires_at: null, current_period_end: null })
      .eq("user_id", data.userId);

    if (error) {
      console.error("revokeAdminSubscriptionPlan failed", error);
      throw new Error(`Unable to update subscription: ${error.message}`);
    }
    return { ok: true };
  });