import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { BarChart3, ChevronDown } from "lucide-react";
import { useViewMode } from "@/components/ViewSwitch";

/** Shared chart palette (brand purple first). */
export const CHART_COLORS = {
  purple: "#6C4AB6",
  emerald: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  sky: "#3B82F6",
  pink: "#EC4899",
  slate: "#94A3B8",
  orange: "#F97316",
};

/** Charts open/closed per page, remembered on this device (closed by default). */
export function useChartsOpen(page: string) {
  const [v, set] = useViewMode(`charts_${page}`, ["closed", "open"] as const, "closed");
  return [v === "open", (open: boolean) => set(open ? "open" : "closed")] as const;
}

/** Small "Charts" button meant to sit inside a row that already exists
 *  (next to search / date / range buttons) instead of taking its own row. */
export function ChartsToggle({ open, onToggle, lang }: { open: boolean; onToggle: () => void; lang: string }) {
  const label = lang === "zh" ? "图表" : lang === "ms" ? "Carta" : "Charts";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className={`h-10 shrink-0 px-3 rounded-2xl text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
        open ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
      }`}
    >
      <BarChart3 className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/** The drop-down area the charts live in. */
export function ChartsPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {children}
    </div>
  );
}

function Card({ title, right, children, wide }: { title: string; right?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A few headline numbers side by side. */
export function StatsCard({ title, stats }: { title: string; stats: Array<{ label: string; value: string; tone?: "warn" | "good" }> }) {
  return (
    <Card title={title}>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/40 px-2.5 py-2">
            <p className={`text-lg font-bold leading-tight truncate ${s.tone === "warn" ? "text-amber-600" : s.tone === "good" ? "text-emerald-600" : "text-foreground"}`}>
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{s.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Donut with the total in the middle and a legend with share bars. */
export function DonutCard({
  title,
  data,
  centerLabel,
  format = (n) => String(n),
}: {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel: string;
  format?: (n: number) => string;
}) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (rows.length === 0) return null;
  return (
    <Card title={title}>
      <div className="flex items-center gap-4">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
                {rows.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [format(v), n]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-muted-foreground leading-none">{centerLabel}</span>
            <span className="text-sm font-bold text-foreground mt-0.5 leading-tight">{format(total)}</span>
          </div>
        </div>
        <ul className="flex-1 min-w-0 space-y-2">
          {rows.map((d) => {
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <li key={d.name}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0 text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-foreground">{format(d.value)} <span className="font-normal text-muted-foreground">· {pct}%</span></span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/** Smooth area chart for one or more series over time. */
export function TrendCard({
  title,
  data,
  xKey,
  series,
  right,
  format = (n) => String(n),
}: {
  title: string;
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: Array<{ key: string; name: string; color: string }>;
  right?: React.ReactNode;
  format?: (n: number) => string;
}) {
  return (
    <Card title={title} right={right} wide>
      <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v: number, n: string) => [format(v), n]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.25} fill={`url(#grad-${s.key})`} dot={false} activeDot={{ r: 3.5 }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
