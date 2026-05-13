import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { supabase, type OrderRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { exportSalesReportPDF } from "@/lib/pdf";
import { useSubscription } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type Range = "today" | "week" | "month" | "custom";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function ReportsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { isPro, showUpgrade } = useSubscription();
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,code,customer_name,product,quantity,amount,cost,gross_profit,status,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    };
    setLoading(true);
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const ch = supabase
      .channel("reports-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const { fromDate, toDate, label } = useMemo(() => {
    const now = new Date();
    if (range === "today") return { fromDate: startOfDay(now), toDate: endOfDay(now), label: t("today_label") };
    if (range === "week") {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { fromDate: startOfDay(f), toDate: endOfDay(now), label: t("this_week") };
    }
    if (range === "month") {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromDate: f, toDate: endOfDay(now), label: t("this_month") };
    }
    return { fromDate: startOfDay(new Date(from)), toDate: endOfDay(new Date(to)), label: `${from} → ${to}` };
  }, [range, from, to, t]);

  const inRange = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= fromDate && d <= toDate;
  });

  const totalRevenue = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.amount), 0);
  const totalCost = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.cost ?? 0), 0);
  const totalGrossProfit = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.gross_profit ?? 0), 0);
  const profitMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
  const totalOrders = inRange.length;
  const paidOrders = inRange.filter((o) => o.status === "Paid").length;
  const unpaidAmount = inRange.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);

  // Revenue chart - by day
  const chartData = useMemo(() => {
    const buckets = new Map<string, number>();
    const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
    const step = days <= 31 ? 1 : 7;
    for (let i = 0; i <= days; i += step) {
      const d = new Date(fromDate); d.setDate(d.getDate() + i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      buckets.set(key, 0);
    }
    inRange.filter((o) => o.status === "Paid").forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(o.amount));
      else buckets.set(key, Number(o.amount));
    });
    return Array.from(buckets.entries()).map(([day, value]) => ({ day, value }));
  }, [inRange, fromDate, toDate]);

  // Top products
  const topProducts = useMemo(() => {
    const m = new Map<string, { qty: number; revenue: number }>();
    inRange.forEach((o) => {
      const cur = m.get(o.product) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(o.quantity);
      if (o.status === "Paid") cur.revenue += Number(o.amount);
      m.set(o.product, cur);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [inRange]);
  const maxQty = Math.max(1, ...topProducts.map((p) => p.qty));

  // Status breakdown
  const statusData = [
    { name: t("paid"), value: inRange.filter((o) => o.status === "Paid").length, color: "#10b981" },
    { name: t("unpaid"), value: inRange.filter((o) => o.status === "Unpaid").length, color: "#ef4444" },
    { name: t("pending"), value: inRange.filter((o) => o.status === "Pending").length, color: "#f59e0b" },
  ].filter((s) => s.value > 0);

  // Top customers
  const topCustomers = useMemo(() => {
    const m = new Map<string, { orders: number; spent: number }>();
    inRange.forEach((o) => {
      const cur = m.get(o.customer_name) ?? { orders: 0, spent: 0 };
      cur.orders += 1;
      if (o.status === "Paid") cur.spent += Number(o.amount);
      m.set(o.customer_name, cur);
    });
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);
  }, [inRange]);

  const handleExport = async () => {
    if (!isPro) { showUpgrade(t("export_pdf")); return; }
    if (exporting) return;
    setExporting(true);
    // Yield so the button shows its loading state before heavy PDF work runs.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await exportSalesReportPDF({
        businessName: user?.email?.split("@")[0] ?? "My Store",
        rangeLabel: label,
        totalRevenue, totalOrders, paidOrders, unpaidAmount,
        topProducts, topCustomers,
        orders: inRange.map((o) => ({
          date: new Date(o.created_at).toLocaleDateString("en-MY"),
          code: o.code, customer: o.customer_name, product: o.product,
          qty: Number(o.quantity), amount: Number(o.amount), status: o.status,
        })),
      });
    } catch (e) {
      console.error("[reports] export failed", e);
      toast.error(t("pdf_failed"));
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = [
    { label: t("total_revenue"), value: `RM ${totalRevenue.toFixed(0)}`, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("total_cost"), value: `RM ${totalCost.toFixed(0)}`, color: "text-amber-600", bg: "bg-amber-50" },
    { label: t("gross_profit"), value: `RM ${totalGrossProfit.toFixed(0)}`, color: "text-primary", bg: "bg-primary/10" },
    { label: t("profit_margin"), value: `${profitMargin.toFixed(1)}%`, color: "text-primary", bg: "bg-primary/10" },
    { label: t("total_orders"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
    { label: t("paid_orders_label"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("unpaid_amount"), value: `RM ${unpaidAmount.toFixed(0)}`, color: "text-red-500", bg: "bg-red-50" },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      {!isPro && (
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/40 p-4 flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">{t("upgrade_title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("upgrade_desc")}</p>
          </div>
          <Link to="/plans" className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground whitespace-nowrap">
            {t("upgrade_to_pro")}
          </Link>
        </div>
      )}
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("sales_reports")}</h1>
      </header>

      <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max">
          {(["today", "week", "month", "custom"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${range === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {r === "today" ? t("today_label") : r === "week" ? t("this_week") : r === "month" ? t("this_month") : t("custom")}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{t("from_date")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
          <label className="text-xs">{t("to_date")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3">
        {summaryCards.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
            <p className={`text-xl font-bold ${s.color}`}>{loading ? "…" : s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("revenue_chart")}</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="day" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
              <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {topProducts.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2 px-1">{t("top_products")}</p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {topProducts.map((p) => (
              <div key={p.name} className="p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="text-muted-foreground">{p.qty} · RM {p.revenue.toFixed(0)}</span>
                </div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {statusData.length > 0 && (
        <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("status_breakdown")}</p>
          <div className="h-48 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label={(d: any) => `${d.name} ${d.value}`}>
                  {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {topCustomers.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2 px-1">{t("best_customers")}</p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {topCustomers.map((c) => (
              <div key={c.name} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.orders} {t("orders_word")}</p>
                </div>
                <p className="text-sm font-bold text-primary">RM {c.spent.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <button onClick={handleExport} disabled={exporting}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.98] transition disabled:opacity-60">
        {exporting ? "…" : `📄 ${t("export_pdf")}`}
      </button>
    </div>
  );
}
