import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, UserPlus, Trash2, Copy, ArrowLeft, LogOut, Crown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getPublicOrigin } from "@/lib/publicUrl";

export const Route = createFileRoute("/team")({ component: TeamPage });

type TeamRow = { id: string; name: string; plan: string; owner_id: string; current_period_end: string | null };
type MemberRow = {
  id: string; team_id: string; user_id: string | null; invited_email: string | null;
  role: "owner" | "admin" | "staff"; status: "active" | "pending" | "removed";
  updated_at: string; joined_at: string | null; invited_by: string | null;
};
type InviteRow = {
  id: string; email: string; role: string; status: string;
  token: string; expires_at: string; created_at: string;
};
type ActivityRow = {
  id: string; action: string; target_email: string | null;
  actor_id: string | null; created_at: string;
};

function planLimit(plan: string) {
  if (plan === "team_starter") return 3;
  if (plan === "team_pro") return 10;
  if (plan === "team_business") return Infinity;
  return 1;
}

function TeamPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { plan, teamTier, isTeam } = useSubscription();
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [tab, setTab] = useState<"members" | "activity">("members");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    // Find a team where current user is owner or active member
    const { data: ownedTeam, error: ownedErr } = await supabase
      .from("teams")
      .select("id, name, plan, owner_id, current_period_end")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (ownedErr) console.error("team load (owned) failed", ownedErr);
    let t: TeamRow | null = (ownedTeam as any) ?? null;
    console.log("[team] user.id=", user.id, "ownedTeam=", ownedTeam);
    if (!t) {
      const { data: myMembership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (myMembership?.team_id) {
        const { data: tt } = await supabase
          .from("teams")
          .select("id, name, plan, owner_id, current_period_end")
          .eq("id", myMembership.team_id)
          .maybeSingle();
        t = (tt as any) ?? null;
      }
    }
    // Final fallback: SECURITY DEFINER RPC that bypasses any RLS edge cases.
    if (!t) {
      const { data: rpcTeam, error: rpcErr } = await supabase.rpc("get_my_team" as any);
      if (rpcErr) console.error("get_my_team failed", rpcErr);
      const row = Array.isArray(rpcTeam) ? rpcTeam[0] : rpcTeam;
      if (row) t = row as any;
    }
    // Auto-provision: user has a Team subscription but no team row yet.
    if (!t && isTeam && teamTier) {
      const defaultName =
        (user.user_metadata as any)?.business_name ||
        user.email?.split("@")[0] ||
        "My Team";
      const { data: created, error: createErr } = await supabase
        .from("teams")
        .insert({ name: `${defaultName}'s Team`, owner_id: user.id, plan: teamTier } as any)
        .select("id, name, plan, owner_id, current_period_end")
        .single();
      if (createErr) {
        console.error("auto-create team failed", createErr);
      } else if (created) {
        t = created as any;
        const { error: memberErr } = await supabase
          .from("team_members")
          .insert({
            team_id: created.id,
            user_id: user.id,
            role: "owner",
            status: "active",
            invited_by: user.id,
          } as any);
        if (memberErr) console.error("auto-create owner member failed", memberErr);
      }
    }
    setTeam(t);
    if (t) {
      const { data: m } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", t.id)
        .neq("status", "removed")
        .order("created_at", { ascending: true });
      setMembers((m as any[]) ?? []);
      const { data: inv } = await supabase
        .from("team_invitations")
        .select("*")
        .eq("team_id", t.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setInvites((inv as any[]) ?? []);
      if (t.plan === "team_pro" || t.plan === "team_business") {
        const { data: log } = await supabase
          .from("team_activity_log")
          .select("id, action, target_email, actor_id, created_at")
          .eq("team_id", t.id)
          .order("created_at", { ascending: false })
          .limit(50);
        setActivity((log as any[]) ?? []);
      } else {
        setActivity([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id, isTeam, teamTier]);

  const me = members.find((m) => m.user_id === user?.id);
  const myRole = team?.owner_id === user?.id ? "owner" : me?.role ?? "staff";
  const canInvite = myRole === "owner" || myRole === "admin";
  const seatsUsed = members.filter((m) => m.status === "active" || m.status === "pending").length;
  const seatsTotal = team ? planLimit(team.plan) : 0;

  const remove = async (m: MemberRow) => {
    if (m.role === "owner") { toast.error(t("team_err_owner_remove")); return; }
    if (!confirm(t("team_remove_confirm"))) return;
    const { error } = await supabase.from("team_members").update({ status: "removed" }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    if (team && (team.plan === "team_pro" || team.plan === "team_business")) {
      await supabase.rpc("log_team_activity" as any, {
        _team_id: team.id, _action: "member_removed",
        _target_user_id: m.user_id, _target_email: m.invited_email, _metadata: null,
      });
    }
    toast.success("Removed");
    load();
  };

  const leave = async () => {
    if (!team) return;
    if (!confirm(t("team_leave_confirm"))) return;
    const { error } = await supabase.rpc("leave_team" as any, { _team_id: team.id });
    if (error) { toast.error(error.message); return; }
    toast.success(t("team_left"));
    setTeam(null);
    setMembers([]);
  };

  const resend = async (inv: InviteRow) => {
    const { data, error } = await supabase.rpc("resend_team_invitation" as any, { _invitation_id: inv.id });
    if (error) { toast.error(error.message); return; }
    toast.success(t("team_resent"));
    if (data && typeof data === "string") {
      const link = `${getPublicOrigin()}/team/join/${data}`;
      try { await navigator.clipboard.writeText(link); } catch {}
    }
    load();
  };

  if (loading) return <div className="p-6">{t("loading")}</div>;

  if (!team) {
    return (
      <div className="min-h-screen p-6 bg-background">
        <div className="max-w-md mx-auto bg-card rounded-2xl p-6 text-center space-y-4">
          <Users className="w-12 h-12 mx-auto text-muted-foreground" />
          <p>{t("team_no_team")}</p>
          <Button asChild><Link to="/plans">{t("team_upgrade")}</Link></Button>
        </div>
      </div>
    );
  }

  const planLabel = team.plan === "team_starter" ? "Team Starter" : team.plan === "team_pro" ? "Team Pro" : "Team Business";
  const showActivity = team.plan === "team_pro" || team.plan === "team_business";
  const admins = members.filter((m) => m.role === "admin" && m.status === "active");

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Link to="/profile"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-lg font-semibold">{t("team_my_team")}</h1>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl p-4 space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("team_plan")}</span><span className="font-semibold">{planLabel}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("team_seats")}</span>
            <span className="font-semibold">{seatsUsed} / {seatsTotal === Infinity ? "∞" : seatsTotal}</span>
          </div>
          {team.current_period_end && (
            <div className="flex justify-between"><span className="text-muted-foreground">{t("team_renewal")}</span>
              <span className="font-semibold">{new Date(team.current_period_end).toLocaleDateString()}</span></div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("team_members")} ({members.length})</h2>
          {canInvite && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" />{t("team_invite")}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            className={`flex-1 py-1.5 rounded-md text-sm font-medium ${tab === "members" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setTab("members")}
          >{t("team_tab_members")}</button>
          <button
            className={`flex-1 py-1.5 rounded-md text-sm font-medium ${tab === "activity" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setTab("activity")}
          >{t("team_tab_activity")}</button>
        </div>

        {tab === "members" && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="bg-card rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {(m.invited_email || m.user_id || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{m.invited_email || m.user_id?.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground flex gap-2">
                  <span className="capitalize">{t(`team_role_${m.role}` as any)}</span>
                  <span>·</span>
                  <span>{t(`team_status_${m.status}` as any)}</span>
                  {m.joined_at && <><span>·</span><span>{t("team_last_active")}: {new Date(m.updated_at).toLocaleDateString()}</span></>}
                </div>
              </div>
              {canInvite && m.role !== "owner" && m.user_id !== user?.id && (
                <Button size="icon" variant="ghost" onClick={() => remove(m)}><Trash2 className="w-4 h-4" /></Button>
              )}
            </div>
          ))}

          {/* Pending invites with expiry / resend */}
          {invites.length > 0 && canInvite && (
            <div className="pt-2 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Pending Invites</h3>
              {invites.map((inv) => {
                const expired = new Date(inv.expires_at).getTime() < Date.now();
                return (
                  <div key={inv.id} className="bg-card rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{inv.email}</div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                        <span>{t(`team_role_${inv.role}` as any)}</span>
                        <span>·</span>
                        {expired ? (
                          <span className="text-destructive font-medium">{t("team_invite_expired_badge")}</span>
                        ) : (
                          <span>{t("team_invite_expires")}: {new Date(inv.expires_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => resend(inv)}>
                      <RefreshCw className="w-3 h-3 mr-1" />{t("team_resend")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {tab === "activity" && (
          <div className="space-y-2">
            {!showActivity ? (
              <div className="bg-muted/40 rounded-xl p-6 text-center text-sm text-muted-foreground">
                {t("team_activity_locked")}
              </div>
            ) : activity.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-6">{t("team_activity_empty")}</div>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="bg-card rounded-xl p-3 text-sm">
                  <div className="font-medium">
                    {t(`team_act_${a.action}` as any) || a.action}
                    {a.target_email ? ` · ${a.target_email}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Owner actions */}
        {myRole === "owner" && admins.length > 0 && (
          <Button variant="outline" className="w-full" onClick={() => setTransferOpen(true)}>
            <Crown className="w-4 h-4 mr-2" />{t("team_transfer")}
          </Button>
        )}

        {/* Leave team (non-owner) */}
        {myRole !== "owner" && me && (
          <Button variant="outline" className="w-full text-destructive" onClick={leave}>
            <LogOut className="w-4 h-4 mr-2" />{t("team_leave")}
          </Button>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); load(); }}
        teamId={team.id}
        myRole={myRole}
        teamPlan={team.plan}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => { setTransferOpen(false); load(); }}
        teamId={team.id}
        admins={admins}
      />
    </div>
  );
}

function InviteModal({ open, onClose, teamId, myRole, teamPlan }: {
  open: boolean; onClose: () => void; teamId: string; myRole: string; teamPlan: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [sending, setSending] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const submit = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error(t("team_err_invalid_email")); return; }
    if (role === "admin" && myRole !== "owner") { toast.error(t("team_err_perm")); return; }
    setSending(true);
    try {
      // Create invitation token row
      const { data: inv, error: iErr } = await supabase
        .from("team_invitations")
        .insert({ team_id: teamId, email, role, invited_by: user!.id } as any)
        .select("token")
        .single();
      if (iErr) throw iErr;
      // Create pending team_member row (so seat is counted)
      const { error: mErr } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, invited_email: email, role, status: "pending", invited_by: user!.id } as any);
      if (mErr && !mErr.message?.includes("duplicate")) {
        if (mErr.message?.includes("team_member_limit_reached")) {
          toast.error(t("team_err_limit"));
        } else {
          toast.error(mErr.message);
        }
      }
      const link = `${getPublicOrigin()}/team/join/${inv.token}`;
      setInviteLink(link);
      if (teamPlan === "team_pro" || teamPlan === "team_business") {
        await supabase.rpc("log_team_activity" as any, {
          _team_id: teamId, _action: "invite_sent",
          _target_user_id: null, _target_email: email, _metadata: null,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setSending(false); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    toast.success(t("team_invite_copied"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEmail(""); setInviteLink(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("team_invite_title")}</DialogTitle></DialogHeader>
        {!inviteLink ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">{t("team_invite_email")}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">{t("team_invite_role")}</label>
              <select className="w-full border rounded-md p-2 bg-background" value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="staff">{t("team_role_staff")}</option>
                {myRole === "owner" && <option value="admin">{t("team_role_admin")}</option>}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">{t("team_invite_link")}</p>
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} />
              <Button size="icon" onClick={copy}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {!inviteLink ? (
            <Button onClick={submit} disabled={sending}>{t("team_send_invite")}</Button>
          ) : (
            <Button onClick={() => { setEmail(""); setInviteLink(""); onClose(); }}>{t("save")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferModal({ open, onClose, teamId, admins }: {
  open: boolean; onClose: () => void; teamId: string; admins: MemberRow[];
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!picked) return;
    if (!confirm(t("team_transfer_confirm"))) return;
    setBusy(true);
    const { error } = await supabase.rpc("transfer_team_ownership" as any, {
      _team_id: teamId, _new_owner_id: picked,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await supabase.rpc("log_team_activity" as any, {
      _team_id: teamId, _action: "ownership_transferred",
      _target_user_id: picked, _target_email: null, _metadata: null,
    });
    toast.success(t("team_transfer_success"));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("team_transfer")}</DialogTitle></DialogHeader>
        {admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("team_no_admins")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("team_transfer_pick")}</p>
            <select
              className="w-full border rounded-md p-2 bg-background"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">—</option>
              {admins.map((a) => (
                <option key={a.id} value={a.user_id ?? ""}>
                  {a.invited_email || a.user_id?.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={!picked || busy}>{t("team_transfer")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}