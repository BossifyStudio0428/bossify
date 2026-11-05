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
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { orderCost, orderGrossProfit, orderProfitMargin } from "@/lib/orderMath";
import { fetchPeriodAdjustments, type PeriodAdjustments } from "@/lib/refundAdjustments";

export const Route = createFileRoute("/reports/sales")({ component: ReportsPage });

type Range = "today" | "week" | "month" | "custom";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_at_sale: number;
};

/** Strips the trailing " (SKU)" suffix tiktok-products-sync.server.ts
 *  appends to variant rows, so "Top Products" ranks the parent product
 *  (e.g. "T恤") instead of splitting it into weaker "T恤 (S)" / "T恤 (M)"
 *  entries that individually never make the top of the list. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

function ReportsPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const { type: bizType } = useBusinessType();
  const eff = (bizType ?? "retail") as
    | "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";
  const showCostProfit = eff === "retail" || eff === "fnb";
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [commissions, setCommissions] = useState<Array<{ commission_amount: number; status: string; transaction_date: string }>>([]);
  const [adjustments, setAdjustments] = useState<PeriodAdjustments>({ revenueReversed: 0, cogsReversed: 0, count: 0 });
  const [orderCategories, setOrderCategories] = useState<Record<string, Set<string>>>({});
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("__all");
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [tiktokIdByProduct, setTiktokIdByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,code,customer_name,product,quantity,amount,cost,gross_profit,status,created_at,financial_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);

      const orderIds = ((data ?? []) as any[]).map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items" as any)
          .select("order_id,product_id,product_name,quantity,unit_price_at_sale")
          .in("order_id", orderIds);
        if (!cancelled) setOrderItems(((items ?? []) as any) as OrderItemRow[]);
        const productIds = Array.from(new Set(((items ?? []) as any[]).map((i) => i.product_id).filter(Boolean)));
        const catByProduct: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: invRows } = await supabase.from("inventory").select("id,category,tiktok_product_id").in("id", productIds);
          const tidByProduct: Record<string, string> = {};
          for (const r of ((invRows ?? []) as any[])) {
            catByProduct[r.id] = r.category || "";
            if (r.tiktok_product_id) tidByProduct[r.id] = r.tiktok_product_id;
          }
          if (!cancelled) setTiktokIdByProduct(tidByProduct);
        }
        const map: Record<string, Set<string>> = {};
        for (const it of ((items ?? []) as any[])) {
          const c = it.product_id ? catByProduct[it.product_id] : "";
          if (!c) continue;
          (map[it.order_id] ??= new Set()).add(c);
        }
        if (!cancelled) setOrderCategories(map);
      }
    };
    setLoading(true);
    load();
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const ch = supabase
      .channel("reports-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || eff !== "property") return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("commissions")
        .select("commission_amount,status,transaction_date")
        .eq("user_id", user.id);
      if (!cancelled) setCommissions((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [user?.id, eff]);

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

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchPeriodAdjustments(user.id, fromDate.toISOString(), toDate.toISOString()).then((adj) => {
      if (!cancelled) setAdjustments(adj);
    });
    return () => { cancelled = true; };
  }, [user?.id, fromDate, toDate]);

  // TikTok placeholder orders (financial_status = "pending") have no real
  // amount/cost yet — never count them in any report figure.
  const inRange = orders.filter((o) => {
    const d = new Date(o.created_at);
    const inWindow = d >= fromDate && d <= toDate && (o as any).financial_status !== "pending";
    if (!inWindow) return false;
    if (activeCategoryFilter === "__all") return true;
    return orderCategories[o.id]?.has(activeCategoryFilter) ?? false;
  });

  const totalRevenue = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.amount), 0) - adjustments.revenueReversed;
  const totalCost = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + orderCost(o), 0) - adjustments.cogsReversed;
  const totalGrossProfit = inRange.filter((o) => o.status === "Paid").reduce((s, o) => s + orderGrossProfit(o), 0) - (adjustments.revenueReversed - adjustments.cogsReversed);
  const profitMargin = orderProfitMargin(totalRevenue, totalGrossProfit);
  const totalOrders = inRange.length;
  const paidOrders = inRange.filter((o) => o.status === "Paid").length;
  const unpaidAmount = inRange.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);
  const pendingCount = inRange.filter((o) => o.status === "Pending").length;
  const unpaidCount = inRange.filter((o) => o.status === "Unpaid").length;

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

  // Top products — aggregated from order LINE ITEMS, not the order-level
  // "product" text field (which is every item in that order joined with
  // commas, e.g. "T恤 (S) × 2, 裤子 × 1" — treating that whole string as
  // one "product" silently broke ranking for any multi-item order).
  // Same-product TikTok variants (S/M/L etc., sharing tiktok_product_id)
  // are merged into one ranking entry so a genuinely popular product
  // isn't split into several weak entries that never reach the top 5.
  const topProducts = useMemo(() => {
    const inRangeIds = new Set(inRange.map((o) => o.id));
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const variantMap = new Map<string, { name: string; qty: number; revenue: number; productId: string | null }>();
    orderItems.forEach((it) => {
      if (!inRangeIds.has(it.order_id)) return;
      const o = orderById.get(it.order_id);
      const key = it.product_name || "—";
      const cur = variantMap.get(key) ?? { name: key, qty: 0, revenue: 0, productId: it.product_id ?? null };
      cur.qty += Number(it.quantity ?? 0);
      if (o?.status === "Paid") cur.revenue += Number(it.unit_price_at_sale ?? 0) * Number(it.quantity ?? 0);
      if (!cur.productId && it.product_id) cur.productId = it.product_id;
      variantMap.set(key, cur);
    });

    const byTiktokId = new Map<string, Array<{ name: string; qty: number; revenue: number; productId: string | null }>>();
    for (const v of variantMap.values()) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      if (!tid) continue;
      if (!byTiktokId.has(tid)) byTiktokId.set(tid, []);
      byTiktokId.get(tid)!.push(v);
    }
    const groupedIds = new Set<string>();
    for (const [tid, arr] of byTiktokId) if (arr.length > 1) groupedIds.add(tid);

    const merged: { name: string; qty: number; revenue: number }[] = [];
    const seen = new Set<string>();
    for (const v of variantMap.values()) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      if (tid && groupedIds.has(tid)) {
        if (seen.has(tid)) continue;
        seen.add(tid);
        const vs = byTiktokId.get(tid)!;
        merged.push({
          name: stripVariantSuffix(vs[0].name),
          qty: vs.reduce((s, x) => s + x.qty, 0),
          revenue: vs.reduce((s, x) => s + x.revenue, 0),
        });
      } else {
        merged.push({ name: v.name, qty: v.qty, revenue: v.revenue });
      }
    }

    return merged.sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [inRange, orders, orderItems, tiktokIdByProduct]);
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
    if (!hasFullAccess) { showUpgrade(t("export_pdf")); return; }
    if (exporting) return;
    setExporting(true);
    // Yield so the button shows its loading state before heavy PDF work runs.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("business_name,avatar_url")
        .eq("id", user?.id ?? "")
        .maybeSingle();
      await exportSalesReportPDF({
        lang,
        bizType: eff,
        businessName: profile?.business_name ?? (user?.email?.split("@")[0] ?? "My Store"),
        logoDataUrl: profile?.avatar_url ?? null,
        rangeLabel: label,
        totalRevenue,
        totalCost, grossProfit: totalGrossProfit, profitMargin,
        totalOrders, paidOrders, unpaidAmount,
        pendingCount, unpaidCount,
        completedCount: paidOrders,
        topProducts,
        topCustomers: topCustomers.map((c) => ({ name: c.name, orders: c.orders, spent: c.spent })),
        rows: inRange.map((o) => ({
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

  const revenueCard = { label: t("total_revenue"), value: `RM ${totalRevenue.toFixed(0)}`, color: "text-emerald-600", bg: "bg-emerald-50" };
  const unpaidCard = { label: t("unpaid_amount"), value: `RM ${unpaidAmount.toFixed(0)}`, color: "text-red-500", bg: "bg-red-50" };

  const summaryCards = (() => {
    if (eff === "education") {
      return [
        revenueCard,
        { label: t("rep_total_cases"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
        { label: t("rep_paid_cases"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
        unpaidCard,
        { label: t("rep_completed_cases"), value: String(paidOrders), color: "text-primary", bg: "bg-primary/10" },
        { label: t("rep_in_progress"), value: String(pendingCount), color: "text-amber-600", bg: "bg-amber-50" },
      ];
    }
    if (eff === "beauty") {
      return [
        revenueCard,
        { label: t("rep_total_appointments"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
        { label: t("rep_paid_appointments"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
        unpaidCard,
      ];
    }
    if (eff === "property") {
      const commissionEarned = commissions.filter((c) => c.status === "received").reduce((s, c) => s + Number(c.commission_amount || 0), 0);
      const commissionPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.commission_amount || 0), 0);
      return [
        { label: t("rep_total_enquiries"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
        { label: t("rep_completed"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: t("rep_in_progress"), value: String(pendingCount), color: "text-amber-600", bg: "bg-amber-50" },
        { label: t("rep_rejected"), value: String(unpaidCount), color: "text-red-500", bg: "bg-red-50" },
        { label: t("an_total_commission"), value: `RM ${commissionEarned.toFixed(0)}`, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: t("an_pending_commission"), value: `RM ${commissionPending.toFixed(0)}`, color: "text-amber-600", bg: "bg-amber-50" },
      ];
    }
    if (eff === "freelance") {
      return [
        revenueCard,
        { label: t("rep_total_projects"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
        { label: t("rep_active_projects"), value: String(pendingCount), color: "text-amber-600", bg: "bg-amber-50" },
        { label: t("rep_completed_projects"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
        unpaidCard,
      ];
    }
    // retail / fnb
    return [
      revenueCard,
      { label: t("total_cost"), value: `RM ${totalCost.toFixed(0)}`, color: "text-amber-600", bg: "bg-amber-50" },
      { label: t("gross_profit"), value: `RM ${totalGrossProfit.toFixed(0)}`, color: "text-primary", bg: "bg-primary/10" },
      { label: t("profit_margin"), value: `${profitMargin.toFixed(1)}%`, color: "text-primary", bg: "bg-primary/10" },
      { label: t("total_orders"), value: String(totalOrders), color: "text-primary", bg: "bg-primary/10" },
      { label: t("paid_orders_label"), value: String(paidOrders), color: "text-emerald-600", bg: "bg-emerald-50" },
      unpaidCard,
    ];
  })();

  // Suppress unused-var warning for cost metrics when not shown
  void totalCost; void totalGrossProfit; void profitMargin; void showCostProfit;

  const titleKey =
    eff === "education" ? "rep_case_reports"
    : eff === "beauty"  ? "rep_appointment_reports"
    : eff === "property" ? "rep_lead_reports"
    : eff === "freelance" ? "rep_project_reports"
    : "sales_reports";

  const chartLabelKey =
    eff === "education" ? "rep_case_revenue"
    : eff === "beauty"  ? "rep_appointment_revenue"
    : eff === "property" ? "rep_lead_revenue"
    : eff === "freelance" ? "rep_project_revenue"
    : "rep_revenue";

  return (
    <div className="px-5 pt-10 pb-6 space-y-5 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      {!hasFullAccess && (
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
        <Link to="/reports" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold tracking-tight">{t(titleKey)}</h1>
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

      {(() => {
        const cats = Array.from(new Set(Object.values(orderCategories).flatMap((s) => Array.from(s))));
        if (cats.length === 0) return null;
        return (
          <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 w-max">
              <button
                onClick={() => setActiveCategoryFilter("__all")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${activeCategoryFilter === "__all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {lang === "zh" ? "全部分类" : lang === "ms" ? "Semua kategori" : "All categories"}
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategoryFilter(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${activeCategoryFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{t("from_date")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
          <label className="text-xs">{t("to_date")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
            <p className={`text-xl font-bold ${s.color}`}>{loading ? "…" : s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t(chartLabelKey)}</p>
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

      {eff === "property" && (
        <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("rep_commission_revenue")}</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(() => {
                const buckets = new Map<string, number>();
                const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
                const step = days <= 31 ? 1 : 7;
                for (let i = 0; i <= days; i += step) {
                  const d = new Date(fromDate); d.setDate(d.getDate() + i);
                  buckets.set(`${d.getMonth() + 1}/${d.getDate()}`, 0);
                }
                commissions
                  .filter((c) => {
                    if (c.status !== "received") return false;
                    const d = new Date(c.transaction_date);
                    return d >= fromDate && d <= toDate;
                  })
                  .forEach((c) => {
                    const d = new Date(c.transaction_date);
                    const key = `${d.getMonth() + 1}/${d.getDate()}`;
                    buckets.set(key, (buckets.get(key) ?? 0) + Number(c.commission_amount || 0));
                  });
                return [...buckets.entries()].map(([day, value]) => ({ day, value }));
              })()}>
                <XAxis dataKey="day" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
                <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

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