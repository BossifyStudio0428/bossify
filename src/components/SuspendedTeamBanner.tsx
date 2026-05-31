import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { syncTeamMemberStatus } from "@/lib/team.functions";

/**
 * Shown on Home when the signed-in user is a team member whose owner's
 * team plan has expired. Their team_members.status is 'suspended' and their
 * own subscription has been moved to 'free'.
 */
export function SuspendedTeamBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const sync = useServerFn(syncTeamMemberStatus);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    sync({})
      .then((r: any) => {
        if (!cancelled) setSuspended(!!r?.suspended);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, sync]);

  if (!suspended) return null;

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-[12px] font-semibold text-amber-900 leading-snug flex-1">
        {t("team_suspended_banner")}
      </p>
    </div>
  );
}