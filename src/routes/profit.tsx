import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { orderContributionProfit } from "@/lib/orderMath";
import { fetchPeriodAdjustments, type PeriodAdjustments } from "@/lib/refundAdjustments";

export const Route = createFileRoute("/profit")({ component: ProfitPage });

type Range = "month" | "7d" | "30d";

type OrderRow = {
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  status: string | null;
  created_at: string;
  platform_fee_amount: number | null;
  shipping_cost: number | null;
  affiliate_commission: number | null;
  financial_status: string | null;
};

function rangeStartISO(r: Range): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "month") {
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  const days = r === "7d" ? 7 : 30;
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function ProfitPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [adjustments, setAdjustments] = useState<PeriodAdjustments>({ revenueReversed: 0, cogsReversed: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const from = rangeStartISO(range);
      const to = new Date().toISOString();
      const [{ data, error }, adj] = await Promise.all([
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,status,created_at,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
          .eq("user_id", user.id)
          .eq("status", "Paid")
          .gte("created_at", from),
        fetchPeriodAdjustments(user.id, from, to),
      ]);
      if (cancelled) return;
      if (error) toast.error(error.message);
      // TikTok placeholder orders (financial_status = "pending") have no
      // real amount/cost yet — never count them.
      const complete = ((data ?? []) as OrderRow[]).filter((o) => o.financial_status !== "pending");
      setOrders(complete);
      setAdjustments(adj);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, range]);

  const stats = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    for (const o of orders) {
      revenue += Number(o.amount ?? 0);
      cost += Number(o.cost ?? 0);
      profit += orderContributionProfit(o);
    }
    // Refunds/returns are dated on when they happened, not silently
    // rewritten into the original order — so they net out here, in the
    // period the refund itself falls in.
    revenue -= adjustments.revenueReversed;
    cost -= adjustments.cogsReversed;
    profit -= adjustments.revenueReversed - adjustments.cogsReversed;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin, count: orders.length };
  }, [orders, adjustments]);

  const profitTrend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const o of orders) {
      const day = String(o.created_at ?? "").slice(0, 10);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + orderContributionProfit(o));
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, profit]) => ({
        day,
        label: new Date(day + "T00:00:00").toLocaleDateString(
          lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY",
          { day: "numeric", month: "short" },
        ),
        profit: Math.round(profit * 100) / 100,
      }));
  }, [orders, lang]);

  const costBreakdown = useMemo(() => {
    let productCost = 0;
    let platformFee = 0;
    let shipping = 0;
    let affiliate = 0;
    for (const o of orders) {
      productCost += Number(o.cost ?? 0);
      platformFee += Number(o.platform_fee_amount ?? 0);
      shipping += Number(o.shipping_cost ?? 0);
      affiliate += Number(o.affiliate_commission ?? 0);
    }
    return [
      { name: lang === "zh" ? "\u5546\u54c1\u6210\u672c" : lang === "ms" ? "Kos Produk" : "Product cost", value: Math.round(productCost * 100) / 100, color: "#F87171" },
      { name: lang === "zh" ? "\u5e73\u53f0\u8d39" : lang === "ms" ? "Yuran Platform" : "Platform fee", value: Math.round(platformFee * 100) / 100, color: "#8B5CF6" },
      { name: lang === "zh" ? "\u8fd0\u8d39" : lang === "ms" ? "Penghantaran" : "Shipping", value: Math.round(shipping * 100) / 100, color: "#60A5FA" },
      { name: lang === "zh" ? "\u8054\u76df\u4f63\u91d1" : lang === "ms" ? "Komisen Afiliasi" : "Affiliate commission", value: Math.round(affiliate * 100) / 100, color: "#FBBF24" },
    ].filter((d) => d.value > 0);
  }, [orders, lang]);

  const ranges: { k: Range; label: string }[] = [
    { k: "month", label: t("profit_range_month") },
    { k: "7d", label: t("profit_range_7d") },
    { k: "30d", label: t("profit_range_30d") },
  ];

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/more" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("profit_title")}</h1>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 ml-11">{t("profit_subtitle")}</p>

      <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {ranges.map((r) => (
          <button
            key={r.k}
            onClick={() => setRange(r.k)}
            className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition ${
              range === r.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("profit_net")}</p>
            <p className={`text-2xl font-bold ${stats.profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {loading ? "…" : money(stats.profit)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-muted-foreground">{t("profit_margin")}</p>
            <p className={`text-lg font-bold ${stats.margin < 0 ? "text-red-600" : "text-foreground"}`}>
              {loading || stats.revenue === 0 ? "—" : `${stats.margin.toFixed(1)}%`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("profit_revenue")}</p>
            <p className="text-sm font-bold text-foreground">{loading ? "…" : money(stats.revenue)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("profit_cost")}</p>
            <p className="text-sm font-bold text-foreground">{loading ? "…" : money(stats.cost)}</p>
          </div>
        </div>

        {!loading && stats.count === 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("profit_empty")}</p>
        )}

        <p className="mt-4 text-[10px] text-muted-foreground leading-relaxed">{t("profit_note")}</p>
      </div>

      {profitTrend.length > 1 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
            {lang === "zh" ? "\u5229\u6da6\u8d8b\u52bf" : lang === "ms" ? "Trend Untung" : "Profit trend"}
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={profitTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={44} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Line type="monotone" dataKey="profit" stroke="#8B5CF6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && stats.count > 0 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
            {lang === "zh" ? "\u6536\u5165\u4e0e\u6210\u672c" : lang === "ms" ? "Hasil vs Kos" : "Revenue vs cost"}
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={[
                { name: lang === "zh" ? "\u6536\u5165" : lang === "ms" ? "Hasil" : "Revenue", value: Math.round(stats.revenue * 100) / 100 },
                { name: lang === "zh" ? "\u6210\u672c" : lang === "ms" ? "Kos" : "Cost", value: Math.round(stats.cost * 100) / 100 },
              ]}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={56} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                <Cell fill="#8B5CF6" />
                <Cell fill="#F87171" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && stats.revenue > 0 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{t("profit_margin")}</p>
            <p className={`text-sm font-bold ${stats.margin < 0 ? "text-red-600" : "text-foreground"}`}>
              {stats.margin.toFixed(1)}%
            </p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
            <div
              className={`h-full rounded-full ${stats.margin < 0 ? "bg-red-600" : "bg-primary"}`}
              style={{ width: `${Math.max(0, Math.min(100, Math.abs(stats.margin)))}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{t("profit_margin_hint")}</p>
        </div>
      )}

      {costBreakdown.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
            {lang === "zh" ? "\u94b1\u82b1\u5728\u54ea\u91cc" : lang === "ms" ? "Ke Mana Wang Pergi" : "Where your money goes"}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(120, costBreakdown.length * 36)}>
            <BarChart data={costBreakdown} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={92} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {costBreakdown.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}