import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Shown on Home for users who are an active member of someone else's team
 * (i.e. not the owner). Indicates whose data they're working in.
 */
export function TeamBanner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [ownerName, setOwnerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      const { data: mem } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (cancelled || !mem || mem.role === "owner") return;
      const { data: team } = await supabase
        .from("teams")
        .select("owner_id, name")
        .eq("id", mem.team_id)
        .maybeSingle();
      if (!team) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("business_name")
        .eq("id", team.owner_id)
        .maybeSingle();
      if (cancelled) return;
      setOwnerName(prof?.business_name || team.name || "Owner");
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!ownerName) return null;

  return (
    <Link
      to="/team"
      className="block rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 p-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
    >
      <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Users className="h-5 w-5" />
      </div>
      <p className="text-[12px] font-semibold text-foreground leading-snug flex-1">
        {t("team_banner_using").replace("{owner}", ownerName)}
      </p>
    </Link>
  );
}