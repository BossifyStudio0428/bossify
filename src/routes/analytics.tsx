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
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/analytics")({ component: AnalyticsPage });

type Range = "today" | "week" | "month" | "all";

function AnalyticsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { type: bizType } = useBusinessType();
  const eff = bizType ?? "retail";
  if (eff === "property") {
    return <PropertyAnalytics />;
  }
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eduRows, setEduRows] = useState<Array<{ university_preference: string | null; course_interest: string | null; application_status: string | null }>>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user || eff !== "education") return;
    (async () => {
      const { data } = await supabase
        .from("client_education_details")
        .select("university_preference,course_interest,application_status")
        .eq("user_id", user.id);
      setEduRows((data ?? []) as any);
    })();
  }, [user?.id, eff]);

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

  // Top customers/clients by spending (sum across ALL paid orders, case-insensitive name match)
  const custMap = new Map<string, { display: string; spent: number; orders: number }>();
  paid.forEach((o) => {
    const raw = (o.customer_name ?? "").trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    const cur = custMap.get(key) ?? { display: raw, spent: 0, orders: 0 };
    cur.spent += Number(o.amount) || 0;
    cur.orders += 1;
    custMap.set(key, cur);
  });
  const topCustomers = [...custMap.values()]
    .map((v) => ({
      name: v.display.length > 14 ? v.display.slice(0, 14) + "…" : v.display,
      spent: v.spent,
      orders: v.orders,
    }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  // Best days of week
  const dowKeys = ["dow_sun","dow_mon","dow_tue","dow_wed","dow_thu","dow_fri","dow_sat"] as const;
  const dowCounts = dowKeys.map((k) => ({ day: t(k), orders: 0 }));
  filtered.forEach((o) => { dowCounts[new Date(o.created_at).getDay()].orders++; });
  const bestDayIdx = dowCounts.reduce((m, c, i) => c.orders > dowCounts[m].orders ? i : m, 0);

  // Status breakdown
  const statusData = [
    { name: t("paid"), value: filtered.filter((o)=>o.status==="Paid").length, color: "#10B981" },
    { name: t("unpaid"), value: filtered.filter((o)=>o.status==="Unpaid").length, color: "#EF4444" },
    { name: t("pending"), value: filtered.filter((o)=>o.status==="Pending").length, color: "#F59E0B" },
  ];

  // Education: top universities & courses (from client_education_details)
  const splitList = (s: string | null | undefined) =>
    (s ?? "").split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
  const tallyTop = (rows: typeof eduRows, field: "university_preference" | "course_interest") => {
    const m = new Map<string, number>();
    rows.forEach((r) => splitList(r[field]).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  };
  const topUnis = tallyTop(eduRows, "university_preference");
  const topCourses = tallyTop(eduRows, "course_interest");

  // Education: application status breakdown
  const appStatusColors: Record<string, string> = {
    not_applied: "#94A3B8", applied: "#3B82F6", interview: "#F59E0B",
    offer_received: "#A855F7", accepted: "#10B981", rejected: "#EF4444",
  };
  const appStatusCounts = new Map<string, number>();
  eduRows.forEach((r) => {
    const k = r.application_status ?? "not_applied";
    appStatusCounts.set(k, (appStatusCounts.get(k) ?? 0) + 1);
  });
  const appStatusData = [...appStatusCounts.entries()].map(([k, v]) => ({
    name: t((`edu_app_${k}`) as any) as string,
    value: v,
    color: appStatusColors[k] ?? "#7C3AED",
  })).filter((s) => s.value > 0);

  // Property: conversion rate + top areas (from product field used as area)
  const conversionRate = filtered.length > 0 ? (paid.length / filtered.length) * 100 : 0;
  const areaMap = new Map<string, number>();
  filtered.forEach((o) => { areaMap.set(o.product, (areaMap.get(o.product) ?? 0) + 1); });
  const topAreas = [...areaMap.entries()]
    .map(([name, count]) => ({ name: name.length > 14 ? name.slice(0,14)+"…" : name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

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

  const topItemsTitleKey =
    eff === "retail" || eff === "fnb" ? "top_products" : "an_top_services";
  const topPeopleTitleKey =
    eff === "retail" || eff === "fnb" ? "an_top_customers" : "an_top_clients";
  const dayTitleKey = eff === "beauty" ? "an_busiest_day" : "best_selling_days";
  const statusTitleKey =
    eff === "education" ? "an_application_status_breakdown"
    : eff === "property" ? "an_lead_status_breakdown"
    : eff === "freelance" ? "an_project_status_breakdown"
    : "status_breakdown";

  const showTopItems = eff !== "property";
  const showTopPeople = eff !== "property";
  const showDayOfWeek = eff === "retail" || eff === "fnb" || eff === "beauty";
  const showPeakHours = eff === "retail" || eff === "fnb";
  const showStatus = eff !== "retail" && eff !== "fnb" ? true : true; // keep for all

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

          {showTopItems && (
          <Card title={t(topItemsTitleKey)}>
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
          )}

          {showTopPeople && (
          <Card title={t(topPeopleTitleKey)}>
            {topCustomers.length === 0 ? <p className="text-xs text-muted-foreground">{t("no_data")}</p> : (
              <ResponsiveContainer width="100%" height={Math.max(120, topCustomers.length * 40)}>
                <BarChart data={topCustomers} layout="vertical">
                  <XAxis type="number" fontSize={10} tick={{ fill: "currentColor" }} />
                  <YAxis type="category" dataKey="name" fontSize={10} width={90} tick={{ fill: "currentColor" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v: number, _n, p: any) => [`RM ${Number(v).toFixed(2)} (${p?.payload?.orders ?? 0})`, ""]}
                  />
                  <Bar dataKey="spent" fill="#10B981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          )}

          {eff === "education" && (
            <>
              <Card title={t("an_most_requested_unis")}>
                {topUnis.length === 0 ? <p className="text-xs text-muted-foreground">{t("no_data")}</p> : (
                  <ul className="divide-y divide-border/60">
                    {topUnis.map((u) => (
                      <li key={u.name} className="flex justify-between py-2 text-sm">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-muted-foreground">{u.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title={t("an_most_popular_courses")}>
                {topCourses.length === 0 ? <p className="text-xs text-muted-foreground">{t("no_data")}</p> : (
                  <ul className="divide-y divide-border/60">
                    {topCourses.map((c) => (
                      <li key={c.name} className="flex justify-between py-2 text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {appStatusData.length > 0 && (
                <Card title={t("an_application_status_breakdown")}>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart margin={{ top: 20, right: 20, bottom: 10, left: 20 }}>
                      <Pie data={appStatusData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {appStatusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          )}

          {eff === "property" && (
            <>
              <Card title={t("an_conversion_rate")} subtitle={`${paid.length}/${filtered.length}`}>
                <p className="text-4xl font-bold text-primary">{conversionRate.toFixed(1)}%</p>
              </Card>
              <Card title={t("an_top_areas")}>
                {topAreas.length === 0 ? <p className="text-xs text-muted-foreground">{t("no_data")}</p> : (
                  <ul className="divide-y divide-border/60">
                    {topAreas.map((a) => (
                      <li key={a.name} className="flex justify-between py-2 text-sm">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-muted-foreground">{a.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}

          {showDayOfWeek && (
          <Card title={t(dayTitleKey)}>
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
          )}

          {showStatus && (
          <Card title={t(statusTitleKey)}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 20, right: 20, bottom: 10, left: 20 }}>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          )}

          {showPeakHours && (
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
          )}
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