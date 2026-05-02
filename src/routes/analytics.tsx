import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase, type OrderRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

type Range = "today" | "week" | "month" | "all";

function AnalyticsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const now = new Date();
  const cutoff = (() => {
    const d = new Date(now);
    if (range === "today") { d.setHours(0,0,0,0); return d; }
    if (range === "week") { d.setDate(d.getDate() - 7); return d; }
    if (range === "month") { d.setMonth(d.getMonth() - 1); return d; }
    return new Date(0);
  })();

  const filtered = orders.filter((o) => new Date(o.created_at) >= cutoff);
  const paid = filtered.filter((o) => o.status === "Paid");
  const totalRev = paid.reduce((s, o) => s + Number(o.amount), 0);

  // Daily trend
  const days = Math.max(1, Math.ceil((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24)));
  const trend: { date: string; revenue: number }[] = [];
  const trendDays = Math.min(days, 30);
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const rev = paid.filter((o) => new Date(o.created_at).toDateString() === d.toDateString())
      .reduce((s, o) => s + Number(o.amount), 0);
    trend.push({ date: `${d.getDate()}/${d.getMonth()+1}`, revenue: rev });
  }

  // Top products
  const prodMap = new Map<string, { qty: number; rev: number }>();
  filtered.forEach((o) => {
    const cur = prodMap.get(o.product) ?? { qty: 0, rev: 0 };
    cur.qty += o.quantity;
    if (o.status === "Paid") cur.rev += Number(o.amount);
    prodMap.set(o.product, cur);
  });
  const topProducts = [...prodMap.entries()]
    .map(([name, v]) => ({ name: name.length > 12 ? name.slice(0,12)+"…" : name, qty: v.qty, rev: v.rev }))
    .sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Best days of week
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dowCounts = dayNames.map((d) => ({ day: d, orders: 0 }));
  filtered.forEach((o) => { dowCounts[new Date(o.created_at).getDay()].orders++; });
  const bestDayIdx = dowCounts.reduce((m, c, i) => c.orders > dowCounts[m].orders ? i : m, 0);

  // Status breakdown
  const statusData = [
    { name: "Paid", value: filtered.filter((o)=>o.status==="Paid").length, color: "#10B981" },
    { name: "Unpaid", value: filtered.filter((o)=>o.status==="Unpaid").length, color: "#EF4444" },
    { name: "Pending", value: filtered.filter((o)=>o.status==="Pending").length, color: "#F59E0B" },
  ];

  // Peak hours
  const hourBuckets = [6, 9, 12, 15, 18, 21];
  const hourLabels = ["6am","9am","12pm","3pm","6pm","9pm"];
  const peak = hourLabels.map((label, i) => {
    const start = hourBuckets[i];
    const end = i < hourBuckets.length - 1 ? hourBuckets[i+1] : 24;
    const count = filtered.filter((o) => {
      const h = new Date(o.created_at).getHours();
      return h >= start && h < end;
    }).length;
    return { hour: label, orders: count };
  });

  const ranges: { key: Range; label: string }[] = [
    { key: "today", label: t("today_label") },
    { key: "week", label: t("this_week") },
    { key: "month", label: t("this_month") },
    { key: "all", label: t("all") },
  ];

  return (
    <div className="px-5 pt-10 pb-8 space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">📊 {t("analytics_label")}</h1>
      </header>

      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 scrollbar-none">
        {ranges.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${range === r.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {r.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : (
        <>
          <Card title={t("revenue_trend")} subtitle={`${t("total_label")}: RM ${totalRev.toFixed(2)}`}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" fontSize={10} tick={{ fill: "currentColor" }} />
                <YAxis fontSize={10} tick={{ fill: "currentColor" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="#7C3AED" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t("top_products")}>
            {topProducts.length === 0 ? <p className="text-xs text-muted-foreground">{t("no_data")}</p> : (
              <ResponsiveContainer width="100%" height={Math.max(120, topProducts.length * 40)}>
                <BarChart data={topProducts} layout="vertical">
                  <XAxis type="number" fontSize={10} tick={{ fill: "currentColor" }} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={80} tick={{ fill: "currentColor" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="qty" fill="#7C3AED" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title={t("best_selling_days")}>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={dowCounts}>
                <XAxis dataKey="day" fontSize={10} tick={{ fill: "currentColor" }} />
                <YAxis fontSize={10} tick={{ fill: "currentColor" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="orders" radius={[6, 6, 0, 0]}>
                  {dowCounts.map((_, i) => <Cell key={i} fill={i === bestDayIdx ? "#7C3AED" : "#C4B5FD"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t("status_breakdown")}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card title={t("peak_hours")}>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={peak}>
                <XAxis dataKey="hour" fontSize={10} tick={{ fill: "currentColor" }} />
                <YAxis fontSize={10} tick={{ fill: "currentColor" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="orders" fill="#7C3AED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}