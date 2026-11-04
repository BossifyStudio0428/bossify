import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { fetchCampaigns, fetchPeriodStats, dayStartISO, dayAfterISO, type Campaign, type PeriodStats } from "@/lib/campaignStats";

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

/**
 * Compact home-page teaser for /campaigns — picks the single most relevant
 * campaign to tease (the one currently live, or failing that the soonest
 * upcoming one) out of however many the seller has set up, and only
 * renders once there's a live or upcoming campaign to show. The full list
 * (and every past campaign's own results) lives on /campaigns itself, not
 * here. Deliberately its own small component with its own fetch, instead
 * of adding more state into the already-large RetailOverview, so it stays
 * a one-line import+render there.
 */
export function CampaignBanner() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<PeriodStats | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const list = await fetchCampaigns(user.id);
      if (cancelled) return;
      const now = new Date();
      const live = list.find((c) => c.start && c.end && new Date(`${c.start}T00:00:00`) <= now && new Date(`${c.end}T23:59:59`) >= now);
      const upcoming = list
        .filter((c) => c.start && new Date(`${c.start}T00:00:00`) > now)
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      const picked = live ?? upcoming ?? null;
      setCampaign(picked);
      if (picked && picked.targetRevenue) {
        const s = await fetchPeriodStats(user.id, dayStartISO(picked.start), dayAfterISO(picked.end));
        if (!cancelled) setStats(s);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!campaign) return null;
  const now = new Date();
  const started = new Date(`${campaign.start}T00:00:00`) <= now;

  const daysLeft = Math.ceil((new Date(`${campaign.end}T23:59:59`).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const daysToStart = Math.ceil((new Date(`${campaign.start}T00:00:00`).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const targetPct = campaign.targetRevenue && campaign.targetRevenue > 0 && stats
    ? Math.min(100, Math.round((stats.revenue / campaign.targetRevenue) * 100))
    : null;

  return (
    <Link
      to="/campaigns/$campaignId"
      params={{ campaignId: campaign.id }}
      className="mt-4 flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/20 p-3.5 active:scale-[0.98]"
    >
      <span className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Flame className="h-4.5 w-4.5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{campaign.name}</p>
        {started ? (
          targetPct != null ? (
            <div className="mt-1">
              <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${targetPct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {targetPct}% {lang === "zh" ? "达标" : lang === "ms" ? "sasaran" : "of target"}
                {" · "}
                {money(stats?.revenue ?? 0)}
                {" · "}
                {lang === "zh" ? `剩 ${Math.max(0, daysLeft)} 天` : lang === "ms" ? `${Math.max(0, daysLeft)} hari lagi` : `${Math.max(0, daysLeft)}d left`}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {lang === "zh" ? `活动进行中，剩 ${Math.max(0, daysLeft)} 天` : lang === "ms" ? `Kempen sedang berjalan, ${Math.max(0, daysLeft)} hari lagi` : `Live now — ${Math.max(0, daysLeft)}d left`}
            </p>
          )
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {lang === "zh" ? `还有 ${daysToStart} 天开始` : lang === "ms" ? `Bermula dalam ${daysToStart} hari` : `Starts in ${daysToStart}d`}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}