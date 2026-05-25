import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";
import { getInviteByToken, acceptTeamInvite, declineTeamInvite } from "@/lib/team.functions";

export const Route = createFileRoute("/team/join/$token")({ component: JoinPage });

function JoinPage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInviteByToken({ data: { token } }).then(setInfo).catch(() => setInfo({ ok: false }));
  }, [token]);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { redirect: `/team/join/${token}` } as any });
    }
  }, [loading, user, token, navigate]);

  if (!info) return <div className="p-6">{t("loading")}</div>;
  if (!info.ok) {
    return <div className="min-h-screen flex items-center justify-center p-6"><div className="text-center"><p>{t("team_invite_expired")}</p></div></div>;
  }

  const accept = async () => {
    setBusy(true);
    const r = await acceptTeamInvite({ data: { token } });
    setBusy(false);
    if (r.ok) { toast.success(t("team_joined")); navigate({ to: "/team" }); }
    else if (r.reason === "limit") toast.error(t("team_err_limit"));
    else toast.error(t("team_invite_expired"));
  };
  const decline = async () => {
    await declineTeamInvite({ data: { token } });
    toast.success(t("team_declined"));
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md bg-card rounded-2xl p-8 text-center space-y-4">
        <h1 className="text-xl font-bold">{t("team_join_title")}</h1>
        <p className="text-muted-foreground">{t("team_join_invited")} <strong>{info.team?.name}</strong></p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={decline} disabled={busy}>{t("team_decline")}</Button>
          <Button className="flex-1" onClick={accept} disabled={busy}>{t("team_accept")}</Button>
        </div>
      </div>
    </div>
  );
}