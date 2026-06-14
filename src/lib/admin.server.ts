import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";

export async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error("Unable to verify admin access");
  if (!data?.is_admin) throw new Response("Forbidden", { status: 403 });
}

export async function loadAdminOverviewForUser(userId: string) {
  await assertAdmin(userId);

  const [profilesResult, subscriptionsResult, ordersResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,business_name,is_admin,created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("subscriptions").select("user_id,plan,status,expires_at,current_period_end,order_count"),
    supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }),
  ]);

  if (profilesResult.error || subscriptionsResult.error || ordersResult.error) {
    console.error("loadAdminOverviewForUser failed", {
      profiles: profilesResult.error,
      subscriptions: subscriptionsResult.error,
      orders: ordersResult.error,
    });
    throw new Error("Unable to load admin data");
  }

  const orders = ordersResult.data ?? [];
  const activeSub = (s: { plan?: string | null; status?: string | null; expires_at?: string | null; current_period_end?: string | null }) => {
    const plan = (s.plan ?? "free").toLowerCase();
    if (!plan || plan === "free") return false;
    if ((s.status ?? "active").toLowerCase() !== "active") return false;
    if (plan === "lifetime") return true;
    const periodEnd = s.current_period_end ?? s.expires_at;
    return !periodEnd || new Date(periodEnd).getTime() >= Date.now();
  };
  const subMap = new Map<string, NonNullable<typeof subscriptionsResult.data>[number]>();
  for (const sub of subscriptionsResult.data ?? []) {
    const current = subMap.get(sub.user_id);
    if (!current || (activeSub(sub) && !activeSub(current))) subMap.set(sub.user_id, sub);
  }
  const users = (profilesResult.data ?? []).map((profile) => {
    const sub = subMap.get(profile.id);
    const userOrders = orders.filter((order) => order.user_id === profile.id);
    return {
      ...profile,
      plan: sub?.plan ?? "free",
      status: sub?.status ?? null,
      expires_at: sub?.expires_at ?? null,
      current_period_end: sub?.current_period_end ?? null,
      order_count: sub?.order_count ?? 0,
      total_orders: Math.max(userOrders.length, Number(sub?.order_count ?? 0)),
      total_revenue: userOrders.reduce(
        (sum, order) => sum + (order.status === "Paid" ? Number(order.amount ?? 0) : 0),
        0,
      ),
    };
  });

  return { isAdmin: true, users, orders };
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
