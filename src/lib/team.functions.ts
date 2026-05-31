import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "@/integrations/supabase/external-auth-middleware";
import { externalSupabaseAdmin } from "@/integrations/supabase/external-admin.server";

/**
 * Look up an invitation by token without exposing service role.
 * Returns minimal info needed to render the join page.
 */
export const getInviteByToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: inv } = await externalSupabaseAdmin
      .from("team_invitations")
      .select("id, team_id, email, role, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { ok: false as const, reason: "not_found" };
    if (inv.status !== "pending") return { ok: false as const, reason: "used" };
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" };
    }
    const { data: team } = await externalSupabaseAdmin
      .from("teams")
      .select("id, name, plan, owner_id")
      .eq("id", inv.team_id)
      .maybeSingle();
    return { ok: true as const, invitation: inv, team };
  });

/**
 * Accept an invitation: marks invitation accepted and adds the
 * authenticated user as an active team member.
 */
export const acceptTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: inv } = await externalSupabaseAdmin
      .from("team_invitations")
      .select("id, team_id, email, role, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { ok: false as const, reason: "not_found" };
    if (inv.status !== "pending") return { ok: false as const, reason: "used" };
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" };
    }

    // Upsert team_members row for this user. The limit trigger may raise.
    const { error: mErr } = await externalSupabaseAdmin
      .from("team_members")
      .upsert(
        {
          team_id: inv.team_id,
          user_id: userId,
          role: inv.role,
          status: "active",
          invited_email: inv.email,
        } as any,
        { onConflict: "team_id,user_id" },
      );
    if (mErr) {
      if (mErr.message?.includes("team_member_limit_reached")) {
        return { ok: false as const, reason: "limit" };
      }
      return { ok: false as const, reason: "insert_failed" };
    }

    await externalSupabaseAdmin
      .from("team_invitations")
      .update({ status: "accepted" } as any)
      .eq("id", inv.id);

    // Sync member's profile plan to team's plan so quota/features align.
    const { data: team } = await externalSupabaseAdmin
      .from("teams")
      .select("plan")
      .eq("id", inv.team_id)
      .maybeSingle();
    if (team?.plan) {
      await externalSupabaseAdmin
        .from("subscriptions")
        .update({ plan: team.plan, status: "active" } as any)
        .eq("user_id", userId);
    }

    return { ok: true as const, teamId: inv.team_id };
  });

/**
 * List pending invitations addressed to the authenticated user's email.
 * Used to show an invite banner on Home after login.
 */
export const listMyPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email as string | undefined;
    if (!email) return { invites: [] as any[] };
    const { data: invs } = await externalSupabaseAdmin
      .from("team_invitations")
      .select("id, team_id, email, role, status, expires_at, token")
      .ilike("email", email)
      .eq("status", "pending");
    const fresh = (invs ?? []).filter(
      (i) => new Date(i.expires_at).getTime() >= Date.now(),
    );
    if (fresh.length === 0) return { invites: [] };
    const teamIds = Array.from(new Set(fresh.map((i) => i.team_id)));
    const { data: teams } = await externalSupabaseAdmin
      .from("teams")
      .select("id, name, owner_id, plan")
      .in("id", teamIds);
    const ownerIds = Array.from(
      new Set((teams ?? []).map((t) => t.owner_id).filter(Boolean)),
    );
    const { data: owners } =
      ownerIds.length > 0
        ? await externalSupabaseAdmin
            .from("profiles")
            .select("id, business_name")
            .in("id", ownerIds as string[])
        : { data: [] as any[] };
    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
    const ownerMap = new Map((owners ?? []).map((o: any) => [o.id, o]));
    return {
      invites: fresh.map((i) => {
        const team = teamMap.get(i.team_id) as any;
        const owner = team ? ownerMap.get(team.owner_id) : null;
        return {
          id: i.id,
          token: i.token,
          role: i.role,
          teamName: team?.name ?? "",
          businessName: (owner as any)?.business_name ?? team?.name ?? "",
          plan: team?.plan ?? null,
        };
      }),
    };
  });

export const declineTeamInvite = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    await externalSupabaseAdmin
      .from("team_invitations")
      .update({ status: "revoked" } as any)
      .eq("token", data.token)
      .eq("status", "pending");
    return { ok: true as const };
  });