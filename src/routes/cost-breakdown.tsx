import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

type Range = "week" | "month" | "all";

export const Route = createFileRoute("/cost-breakdown")({ component: CostBreakdownPage });

function Row({ label, value, bold, tint }: { label: string; value: number; bold?: boolean; tint?: "neg" | "pos" }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={`text-sm ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold" : ""} ${tint === "neg" ? "text-red-600" : tint === "pos" ? "text-emerald-600" : ""}`}>
        {value < 0 ? "−" : ""}RM {Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function CostBreakdownPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [range, setRange] = useState<Range>("month");
  const [loading, setLoading] = useState(true);

  const [revenue, setRevenue] = useState(0);
  const [productCost, setProductCost] = useState(0);
  const [packagingCost, setPackagingCost] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [refundRevenue, setRefundRevenue] = useState(0);
  const [refundCost, setRefundCost] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<Record<string, number>>({});
  const [estimateCount, setEstimateCount] = useState(0);
  const [trend, setTrend] = useState<Array<{ day: string; profit: number }>>([]);
  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateOpen, setDateOpen] = useState(false);
  const dateFilterActive = !!(dateFrom || dateTo);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const now = new Date();
      let from = new Date(0);
      let to: Date | null = null;
      if (dateFilterActive) {
        // Custom date range picker takes priority over the week/month/all
        // quick presets — an empty side stays open-ended (e.g. only "to" set
        // means "everything up to that date").
        from = dateFrom ? new Date(dateFrom + "T00:00:00") : new Date(0);
        to = dateTo ? new Date(dateTo + "T23:59:59") : null;
      } else {
        if (range === "week") { from = new Date(now); from.setDate(from.getDate() - 7); }
        if (range === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); }
      }
      const fromISO = from.toISOString();
      const toISO = to ? to.toISOString() : null;

      let ordersQuery = supabase
        .from("orders" as any)
        .select("id,amount,platform_fee_amount,shipping_cost,platform_metadata")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .neq("financial_status", "pending")
        .gte("created_at", fromISO);
      if (toISO) ordersQuery = ordersQuery.lte("created_at", toISO);
      const { data: orders, error: ordErr } = await ordersQuery;
      if (ordErr) toast.error(ordErr.message);
      let orderRows = (orders ?? []) as any[];
      let orderIds = orderRows.map((o) => o.id);

      // Category filter: an order "belongs to" a category if any of its
      // line items are in it. Product/packaging cost only counts the
      // matching line items, not the whole order's items.
      let allowedOrderIds: Set<string> | null = null;
      let categoryProductIds: Set<string> | null = null;
      if (orderIds.length > 0) {
        const { data: allItems } = await supabase
          .from("order_items" as any)
          .select("order_id,product_id,unit_cost_at_sale,packaging_cost_at_sale,quantity")
          .in("order_id", orderIds);
        const itemRows = (allItems ?? []) as any[];
        const productIds = Array.from(new Set(itemRows.map((i) => i.product_id).filter(Boolean)));
        const catByProduct: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: invRows } = await supabase.from("inventory").select("id,category").in("id", productIds);
          for (const r of ((invRows ?? []) as any[])) catByProduct[r.id] = r.category || "";
        }
        setAvailableCategories(Array.from(new Set(Object.values(catByProduct))).filter(Boolean));

        if (activeCategory !== "__all") {
          allowedOrderIds = new Set(itemRows.filter((i) => i.product_id && catByProduct[i.product_id] === activeCategory).map((i) => i.order_id));
          categoryProductIds = new Set(itemRows.filter((i) => i.product_id && catByProduct[i.product_id] === activeCategory).map((i) => i.product_id));
          orderRows = orderRows.filter((o) => allowedOrderIds!.has(o.id));
          orderIds = orderRows.map((o) => o.id);
        }

        const relevantItems = activeCategory === "__all" ? itemRows : itemRows.filter((i) => categoryProductIds!.has(i.product_id));
        setProductCost(relevantItems.reduce((s, r) => s + Number(r.unit_cost_at_sale ?? 0) * Number(r.quantity ?? 0), 0));
        setPackagingCost(relevantItems.reduce((s, r) => s + Number(r.packaging_cost_at_sale ?? 0) * Number(r.quantity ?? 0), 0));
      } else {
        setProductCost(0);
        setPackagingCost(0);
      }

      setRevenue(orderRows.reduce((s, o) => s + Number(o.amount ?? 0), 0));
      setPlatformFee(orderRows.reduce((s, o) => s + Number(o.platform_fee_amount ?? 0), 0));
      setShippingCost(orderRows.reduce((s, o) => s + Number(o.shipping_cost ?? 0), 0));
      setEstimateCount(orderRows.filter((o) => o.platform_metadata?.platform_fee_source === "estimate").length);

      let adjQuery = supabase
        .from("order_adjustments" as any)
        .select("revenue_reversed,cogs_reversed")
        .eq("user_id", user.id)
        .gte("created_at", fromISO);
      if (toISO) adjQuery = adjQuery.lte("created_at", toISO);
      const { data: adjRows } = await adjQuery;
      const adj = (adjRows ?? []) as any[];
      setRefundRevenue(adj.reduce((s, a) => s + Number(a.revenue_reversed ?? 0), 0));
      setRefundCost(adj.reduce((s, a) => s + Number(a.cogs_reversed ?? 0), 0));

      let expQuery = supabase
        .from("operating_expenses" as any)
        .select("category,amount")
        .eq("user_id", user.id)
        .gte("incurred_at", fromISO.slice(0, 10));
      if (toISO) expQuery = expQuery.lte("incurred_at", toISO.slice(0, 10));
      const { data: expRows } = await expQuery;
      const byCategory: Record<string, number> = {};
      for (const e of (expRows ?? []) as any[]) {
        const cat = e.category ?? "other";
        byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.amount ?? 0);
      }
      setExpensesByCategory(byCategory);

      // 14-day trend — a fixed trailing window, separate from the
      // week/month/all selector above, purely for the line chart.
      const trendFrom = new Date(now);
      trendFrom.setDate(trendFrom.getDate() - 13);
      trendFrom.setHours(0, 0, 0, 0);
      const { data: trendOrders } = await supabase
        .from("orders" as any)
        .select("amount,cost,created_at")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .neq("financial_status", "pending")
        .gte("created_at", trendFrom.toISOString());
      const byDay: Record<string, number> = {};
      for (let i = 0; i < 14; i++) {
        const d = new Date(trendFrom);
        d.setDate(d.getDate() + i);
        byDay[d.toISOString().slice(0, 10)] = 0;
      }
      for (const o of ((trendOrders ?? []) as any[])) {
        const key = new Date(o.created_at).toISOString().slice(0, 10);
        if (key in byDay) byDay[key] += Number(o.amount ?? 0) - Number(o.cost ?? 0);
      }
      setTrend(Object.entries(byDay).map(([day, profit]) => ({ day: day.slice(5), profit: Math.round(profit * 100) / 100 })));

      setLoading(false);
    })();
  }, [user?.id, range, activeCategory, dateFrom, dateTo]);

  const netRevenue = revenue - refundRevenue;
  const netProductCost = productCost - refundCost;
  const grossProfit = netRevenue - netProductCost - packagingCost;
  const contributionProfit = grossProfit - platformFee - shippingCost;
  const totalOperatingExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);
  const netProfit = contributionProfit - totalOperatingExpenses;

  const categoryLabel = (cat: string) => {
    const map: Record<string, Record<string, string>> = {
      advertising: { zh: "广告费", ms: "Pengiklanan", en: "Advertising" },
      affiliate_influencer: { zh: "网红/推广费", ms: "Influencer", en: "Affiliate/Influencer" },
      subscriptions: { zh: "订阅费", ms: "Langganan", en: "Subscriptions" },
      other: { zh: "其他（含损耗/供应商退款）", ms: "Lain-lain", en: "Other (incl. shrinkage/supplier refunds)" },
    };
    return map[cat]?.[lang] ?? map[cat]?.en ?? cat;
  };

  const title = lang === "zh" ? "成本总览" : lang === "ms" ? "Gambaran Kos" : "Cost Breakdown";

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 lg:max-w-4xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>

      <div className="flex gap-2">
        {(["week", "month", "all"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => { setRange(r); setDateFrom(""); setDateTo(""); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${!dateFilterActive && range === r ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
          >
            {r === "week" ? (lang === "zh" ? "本周" : lang === "ms" ? "Minggu ini" : "This week") : r === "month" ? (lang === "zh" ? "本月" : lang === "ms" ? "Bulan ini" : "This month") : (lang === "zh" ? "全部" : lang === "ms" ? "Semua" : "All time")}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDateOpen((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              dateFilterActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            <Calendar className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{lang === "zh" ? "自选时间" : lang === "ms" ? "Tarikh tersuai" : "Custom range"}
            {dateFilterActive && <span className="text-[10px] opacity-80">●</span>}
          </button>
          {dateFilterActive && (
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-[11px] text-muted-foreground underline"
            >
              {lang === "zh" ? "清除" : lang === "ms" ? "Buang" : "Clear"}
            </button>
          )}
        </div>
        {dateOpen && (
          <div className="rounded-2xl bg-card border border-border/60 p-3 space-y-2 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground">
                {lang === "zh" ? "从" : lang === "ms" ? "Dari" : "From"}
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full text-sm rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                />
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">
                {lang === "zh" ? "至" : lang === "ms" ? "Hingga" : "To"}
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full text-sm rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { k: "today", n: 0 },
                { k: "7d", n: 7 },
                { k: "30d", n: 30 },
              ].map((p) => (
                <button
                  key={p.k}
                  type="button"
                  onClick={() => {
                    const n = new Date();
                    const toStr = n.toISOString().slice(0, 10);
                    const fromD = new Date(n);
                    fromD.setDate(fromD.getDate() - p.n);
                    setDateFrom(fromD.toISOString().slice(0, 10));
                    setDateTo(toStr);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground active:scale-95"
                >
                  {p.k === "today"
                    ? (lang === "zh" ? "今天" : lang === "ms" ? "Hari ini" : "Today")
                    : p.k === "7d"
                      ? (lang === "zh" ? "近7天" : lang === "ms" ? "7 hari" : "Last 7 days")
                      : (lang === "zh" ? "近30天" : lang === "ms" ? "30 hari" : "Last 30 days")}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {availableCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory("__all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === "__all" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
          >
            {lang === "zh" ? "全部分类" : lang === "ms" ? "Semua kategori" : "All categories"}
          </button>
          {availableCategories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === c ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {activeCategory !== "__all" && (
        <p className="text-[10px] text-muted-foreground flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          {lang === "zh" ? "退款/营业费用/走势图暂不分类,仍显示全店数据" : lang === "ms" ? "Bayaran balik/perbelanjaan/trend masih data keseluruhan" : "Refunds/expenses/trend still show store-wide data, not category-filtered"}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : (
        <>
          {estimateCount > 0 && (
            <p className="text-[11px] text-muted-foreground rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
              {lang === "zh"
                ? `${estimateCount} 笔订单的平台抽成还是估算值，TikTok 结算后会自动更新`
                : lang === "ms"
                  ? `${estimateCount} pesanan masih anggaran yuran, akan dikemaskini bila TikTok selesai`
                  : `${estimateCount} order(s) still using an estimated platform fee — updates automatically once TikTok settles`}
            </p>
          )}

          {(() => {
            const chartData = [
              { name: lang === "zh" ? "商品成本" : lang === "ms" ? "Produk" : "Product", value: productCost, color: "#F87171" },
              { name: lang === "zh" ? "包装" : lang === "ms" ? "Bungkus" : "Packaging", value: packagingCost, color: "#FBBF24" },
              { name: lang === "zh" ? "平台费" : lang === "ms" ? "Yuran" : "Platform Fee", value: platformFee, color: "#8B5CF6" },
              { name: lang === "zh" ? "运费" : lang === "ms" ? "Hantar" : "Shipping", value: shippingCost, color: "#60A5FA" },
              { name: lang === "zh" ? "营业费用" : lang === "ms" ? "Operasi" : "Opex", value: totalOperatingExpenses, color: "#EC4899" },
            ].filter((d) => d.value > 0);
            return (
              <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 space-y-4">
                {chartData.length > 0 && (
                  <div className="rounded-2xl bg-card border border-border/60 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      {lang === "zh" ? "各项成本比较" : lang === "ms" ? "Perbandingan Kos" : "Cost Comparison"}
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {chartData.length > 0 && (
                  <div className="rounded-2xl bg-card border border-border/60 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                      {lang === "zh" ? "成本占比" : lang === "ms" ? "Peratusan Kos" : "Cost Share"}
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.name}`}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="rounded-2xl bg-card border border-border/60 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {lang === "zh" ? "净利润走势（近14天）" : lang === "ms" ? "Trend Untung (14 hari)" : "Net Profit Trend (14 days)"}
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
                <Line type="monotone" dataKey="profit" stroke="#8B5CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl bg-card border border-border/60 p-4 divide-y divide-border/40">
            <Row label={lang === "zh" ? "销售总额" : lang === "ms" ? "Jumlah Jualan" : "Gross Sales"} value={revenue} />
            {refundRevenue > 0 && <Row label={lang === "zh" ? "退款（收入）" : lang === "ms" ? "Bayaran balik" : "Refunds (revenue)"} value={-refundRevenue} tint="neg" />}
            <Row label={lang === "zh" ? "净收入" : lang === "ms" ? "Hasil Bersih" : "Net Revenue"} value={netRevenue} bold />

            <div className="pt-2" />
            <Row label={lang === "zh" ? "商品成本" : lang === "ms" ? "Kos Produk" : "Product Cost"} value={-productCost} tint="neg" />
            {refundCost > 0 && <Row label={lang === "zh" ? "退款（成本冲回）" : lang === "ms" ? "Kos dipulangkan" : "Refunds (cost reversed)"} value={refundCost} tint="pos" />}
            <Row label={lang === "zh" ? "包装成本" : lang === "ms" ? "Kos Pembungkusan" : "Packaging Cost"} value={-packagingCost} tint="neg" />
            <Row label={lang === "zh" ? "毛利" : lang === "ms" ? "Untung Kasar" : "Gross Profit"} value={grossProfit} bold />

            <div className="pt-2" />
            <Row label={lang === "zh" ? "平台抽成" : lang === "ms" ? "Yuran Platform" : "Platform Fee"} value={-platformFee} tint="neg" />
            <Row label={lang === "zh" ? "运费" : lang === "ms" ? "Kos Penghantaran" : "Shipping Cost"} value={-shippingCost} tint="neg" />
            <Row label={lang === "zh" ? "贡献利润" : lang === "ms" ? "Untung Sumbangan" : "Contribution Profit"} value={contributionProfit} bold />
          </div>

          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
              {lang === "zh" ? "营业费用" : lang === "ms" ? "Perbelanjaan Operasi" : "Operating Expenses"}
            </p>
            {Object.keys(expensesByCategory).length === 0 ? (
              <p className="text-xs text-muted-foreground">{lang === "zh" ? "这段期间没有记录" : "None this period"}</p>
            ) : (
              Object.entries(expensesByCategory).map(([cat, amt]) => (
                <Row key={cat} label={categoryLabel(cat)} value={-amt} tint={amt >= 0 ? "neg" : "pos"} />
              ))
            )}
          </div>

          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
            <Row
              label={lang === "zh" ? "净利润" : lang === "ms" ? "Untung Bersih" : "Net Profit"}
              value={netProfit}
              bold
              tint={netProfit >= 0 ? "pos" : "neg"}
            />
          </div>
        </>
      )}
    </div>
  );
}