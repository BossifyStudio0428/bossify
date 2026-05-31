import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";
import {
  listMyPendingInvites,
  acceptTeamInvite,
  declineTeamInvite,
} from "@/lib/team.functions";

type Invite = {
  id: string;
  token: string;
  role: string;
  teamName: string;
  businessName: string;
  plan: string | null;
};

export function PendingInviteBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const r: any = await listMyPendingInvites();
      setInvites(r?.invites ?? []);
    } catch {
      setInvites([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (invites.length === 0) return null;
  const inv = invites[0];
  const roleKey =
    inv.role === "admin"
      ? "team_role_admin"
      : inv.role === "owner"
        ? "team_role_owner"
        : "team_role_staff";
  const roleLabel = t(roleKey as any);
  const message = t("team_invite_pending")
    .replace("{business}", inv.businessName || inv.teamName || "")
    .replace("{role}", roleLabel);

  const accept = async () => {
    setBusy(true);
    const r: any = await acceptTeamInvite({ data: { token: inv.token } });
    setBusy(false);
    if (r?.ok) {
      toast.success(t("team_joined"));
      setInvites((cur) => cur.filter((i) => i.id !== inv.id));
      // Reload to refresh subscription/plan context
      setTimeout(() => window.location.reload(), 300);
    } else if (r?.reason === "limit") {
      toast.error(t("team_err_limit"));
    } else {
      toast.error(t("team_invite_expired"));
    }
  };

  const decline = async () => {
    setBusy(true);
    await declineTeamInvite({ data: { token: inv.token } });
    setBusy(false);
    toast.success(t("team_declined"));
    setInvites((cur) => cur.filter((i) => i.id !== inv.id));
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5" />
        </div>
        <p className="text-[13px] font-medium text-foreground leading-snug flex-1">
          {message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={decline}
          disabled={busy}
        >
          {t("team_decline")}
        </Button>
        <Button className="flex-1" onClick={accept} disabled={busy}>
          {t("team_accept")}
        </Button>
      </div>
    </div>
  );
}