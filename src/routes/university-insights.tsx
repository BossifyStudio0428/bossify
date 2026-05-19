import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { statusLabelKey, type EducationDetails } from "@/components/EducationDetailsForm";

export const Route = createFileRoute("/university-insights")({ component: InsightsPage });

function countMap(values: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function splitTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[,;\n]/g).map((x) => x.trim()).filter(Boolean);
}

function InsightsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<EducationDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("client_education_details").select("*");
      setRows((data ?? []) as EducationDetails[]);
      setLoading(false);
    })();
  }, []);

  const universities = useMemo(
    () => countMap(rows.flatMap((r) => splitTokens(r.university_preference))),
    [rows],
  );
  const courses = useMemo(
    () => countMap(rows.flatMap((r) => splitTokens(r.course_interest))),
    [rows],
  );
  const statuses = useMemo(
    () => countMap(rows.map((r) => r.application_status ?? "not_applied")),
    [rows],
  );
  const scholarship = useMemo(
    () => rows.filter((r) => r.scholarship_interest).length,
    [rows],
  );

  const total = rows.length;
  const maxU = Math.max(1, ...universities.map((x) => x.count));
  const maxC = Math.max(1, ...courses.map((x) => x.count));
  const statusTotal = Math.max(1, statuses.reduce((s, x) => s + x.count, 0));

  const STATUS_COLORS: Record<string, string> = {
    not_applied: "#94a3b8", applied: "#3b82f6", interview: "#f59e0b",
    offer_received: "#10b981", accepted: "#059669", rejected: "#ef4444",
  };

  // Build SVG pie
  let acc = 0;
  const slices = statuses.map((s) => {
    const start = acc / statusTotal;
    acc += s.count;
    const end = acc / statusTotal;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const r = 50, cx = 60, cy = 60;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const d = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    return { ...s, d, color: STATUS_COLORS[s.key] ?? "#94a3b8" };
  });

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">🎓 {t("edu_insights")}</h1>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">{t("loading")}</p>}

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("edu_top_universities")}
        </p>
        {universities.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        {universities.slice(0, 6).map((u) => (
          <div key={u.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-foreground">{u.key}</span>
              <span className="text-muted-foreground">{u.count}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${(u.count / maxU) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("edu_top_courses")}
        </p>
        {courses.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        {courses.slice(0, 6).map((c) => (
          <div key={c.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-foreground">{c.key}</span>
              <span className="text-muted-foreground">{c.count}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(c.count / maxC) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("edu_status_breakdown")}
        </p>
        {statuses.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0">
              {slices.map((s) => (
                <path key={s.key} d={s.d} fill={s.color} />
              ))}
            </svg>
            <div className="flex-1 space-y-1.5">
              {statuses.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 rounded-sm" style={{ background: STATUS_COLORS[s.key] }} />
                  <span className="flex-1 text-foreground">{t(statusLabelKey(s.key) as TKey)}</span>
                  <span className="font-semibold text-muted-foreground">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          🏆 {t("edu_scholarship_seekers")}
        </p>
        <p className="mt-2 text-2xl font-bold text-foreground">
          {scholarship} <span className="text-sm text-muted-foreground font-medium">/ {total}</span>
        </p>
      </section>
    </div>
  );
}