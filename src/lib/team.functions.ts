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

    return { ok: true as const, teamId: inv.team_id };
  });

export const declineTeamInvite = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    await externalSupabaseAdmin
      .from("team_invitations")
      .update({ status: "declined" } as any)
      .eq("token", data.token)
      .eq("status", "pending");
    return { ok: true as const };
  });