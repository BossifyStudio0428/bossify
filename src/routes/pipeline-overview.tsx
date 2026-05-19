import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { STAGE_DEFS } from "@/components/FollowupPipeline";

export const Route = createFileRoute("/pipeline-overview")({ component: PipelineOverview });

function PipelineOverview() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, { completed: number; current: number }>>({});
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: cs }, { data: st }, { data: fu }] = await Promise.all([
        supabase.from("customers").select("*").eq("user_id", user.id),
        (supabase as any).from("education_followup_stages").select("client_id,stage_number,is_completed").eq("user_id", user.id),
        supabase.from("follow_ups").select("customer_id,follow_up_date,is_done").eq("user_id", user.id).eq("is_done", false),
      ]);
      if (cancelled) return;
      const m: Record<string, { completed: number; current: number }> = {};
      for (const r of ((st ?? []) as { client_id: string; stage_number: number; is_completed: boolean }[])) {
        const c = m[r.client_id] ?? { completed: 0, current: 1 };
        if (r.is_completed) c.completed += 1;
        m[r.client_id] = c;
      }
      for (const id of Object.keys(m)) m[id].current = Math.min(10, m[id].completed + 1);
      const today = new Date().toISOString().slice(0, 10);
      const od = new Set<string>();
      for (const f of ((fu ?? []) as { customer_id: string; follow_up_date: string }[])) {
        if (f.follow_up_date <= today) od.add(f.customer_id);
      }
      setCustomers((cs ?? []) as CustomerRow[]);
      setStageMap(m);
      setOverdueIds(od);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const needsFollowup = customers.filter((c) => overdueIds.has(c.id));
  const maxCount = Math.max(1, ...STAGE_DEFS.map((s) => customers.filter((c) => (stageMap[c.id]?.current ?? 1) === s.num).length));

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/customers" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("pipeline_overview")}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : (
        <>
          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-2 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("stage_distribution")}</p>
            {STAGE_DEFS.map((s) => {
              const n = customers.filter((c) => (stageMap[c.id]?.current ?? 1) === s.num).length;
              return (
                <div key={s.num} className="flex items-center gap-2">
                  <span className="text-[11px] w-32 truncate">{s.emoji} {s.num}. {t(s.key)}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(n / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold w-6 text-right">{n}</span>
                </div>
              );
            })}
          </section>

          {needsFollowup.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">⚠️ {t("weekly_followup")} ({needsFollowup.length})</p>
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60 shadow-[var(--shadow-card)]">
                {needsFollowup.map((c) => (
                  <Link key={c.id} to="/customer/$customerId" params={{ customerId: c.id }} hash="pipeline" className="flex items-center gap-3 p-3 active:bg-muted/40">
                    <div className="h-9 w-9 rounded-full bg-red-500/15 text-red-600 flex items-center justify-center font-semibold">{c.name.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">Stage {stageMap[c.id]?.current ?? 1}/10</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {STAGE_DEFS.map((s) => {
            const items = customers.filter((c) => (stageMap[c.id]?.current ?? 1) === s.num);
            if (items.length === 0) return null;
            return (
              <section key={s.num} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">{s.emoji} {s.num}. {t(s.key)} ({items.length})</p>
                <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60 shadow-[var(--shadow-card)]">
                  {items.map((c) => (
                    <Link key={c.id} to="/customer/$customerId" params={{ customerId: c.id }} hash="pipeline" className="flex items-center gap-3 p-3 active:bg-muted/40">
                      <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">{c.name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{stageMap[c.id]?.completed ?? 0}/10 {t("edu_completed_word")}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}