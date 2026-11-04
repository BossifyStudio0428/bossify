import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, ChevronDown, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { orderGrossProfit, orderContributionProfit } from "@/lib/orderMath";
import { SetupChecklist } from "@/components/SetupChecklist";
import { CampaignBanner } from "@/components/CampaignBanner";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { fetchPeriodAdjustments, type PeriodAdjustments } from "@/lib/refundAdjustments";
import {
  renderTemplate,
  getReminderTemplate,
  fetchWAProfile,
  stripEmoji,
  daysSince,
} from "@/lib/wa";

type InvRow = {
  id: string;
  name: string;
  price: number | null;
  cost_price: number | null;
  stock: number | null;
};

type WeekItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_at_sale: number;
};

/** Strips the trailing " (SKU)" suffix tiktok-products-sync.server.ts
 *  appends to variant rows, so the "best seller this week" hint names the
 *  parent product instead of a single weaker "T恤 (S)" variant. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

type OrderRow = {
  id?: string;
  code?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  quantity?: number | null;
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  product: string | null;
  status?: string | null;
  created_at: string;
  platform_fee_amount?: number | null;
  shipping_cost?: number | null;
  affiliate_commission?: number | null;
  financial_status?: string | null;
};

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

type Range = "week" | "month" | "custom";

function rangeWindows(range: Range, customFrom?: string, customTo?: string) {
  const now = new Date();
  const curEnd = new Date(now);
  let curStart: Date;
  if (range === "week") {
    curStart = new Date(now);
    curStart.setHours(0, 0, 0, 0);
    curStart.setDate(curStart.getDate() - 6);
  } else if (range === "month") {
    curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    curStart = customFrom ? new Date(customFrom + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
    if (customTo) {
      const end = new Date(customTo + "T23:59:59");
      return buildWithPrev(curStart, end);
    }
  }
  return buildWithPrev(curStart, curEnd);
}

function buildWithPrev(curStart: Date, curEnd: Date) {
  const lenMs = curEnd.getTime() - curStart.getTime();
  const prevEnd = new Date(curStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - lenMs);
  return { curStart, curEnd, prevStart, prevEnd };
}

function pctDelta(cur: number, prev: number): number | null {
  if (!isFinite(prev) || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function RetailOverview() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState<InvRow[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then((p) => setLowThreshold(p.low_stock_threshold)).catch(() => undefined);
  }, [user?.id]);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [curOrders, setCurOrders] = useState<OrderRow[]>([]);
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  const [weekItems, setWeekItems] = useState<WeekItemRow[]>([]);
  const [tiktokIdByProduct, setTiktokIdByProduct] = useState<Record<string, string>>({});
  const [operatingExpenses, setOperatingExpenses] = useState(0);
  const [curAdjustments, setCurAdjustments] = useState<PeriodAdjustments>({ revenueReversed: 0, cogsReversed: 0, count: 0 });
  const [prevAdjustments, setPrevAdjustments] = useState<PeriodAdjustments>({ revenueReversed: 0, cogsReversed: 0, count: 0 });
  const [waProfile, setWaProfile] = useState<{ paymentDetails: string; businessName: string }>({
    paymentDetails: "",
    businessName: "us",
  });
  const [customReminderTpl, setCustomReminderTpl] = useState<string | null>(null);
  // Rotate through equal-priority suggestions on each page load.
  const [tick] = useState(() => Math.floor(Math.random() * 1000));

  // Load WA profile + custom reminder template (same source as Orders screen).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchWAProfile(user.id, lang);
        if (!cancelled) setWaProfile(p);
      } catch {}
      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("wa_reminder_template")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && data?.wa_reminder_template) setCustomReminderTpl(data.wa_reminder_template);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, lang]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    const { curStart, curEnd, prevStart, prevEnd } = rangeWindows(range, customFrom, customTo);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 7);
    (async () => {
      const [invRes, curRes, prevRes, recentRes, weekRes, opexRes, curAdj, prevAdj] = await Promise.all([
        supabase
          .from("inventory")
          .select("id,name,price,cost_price,stock")
          .eq("user_id", user.id),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at,status,financial_status,platform_fee_amount,shipping_cost,affiliate_commission")
          .eq("user_id", user.id)
          .gte("created_at", curStart.toISOString())
          .lte("created_at", curEnd.toISOString()),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at,status,financial_status,platform_fee_amount,shipping_cost,affiliate_commission")
          .eq("user_id", user.id)
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
        supabase
          .from("orders")
          .select("id,code,customer_name,phone,quantity,amount,cost,gross_profit,product,created_at,status,financial_status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("orders")
          .select("id,amount,cost,gross_profit,product,created_at,financial_status")
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("operating_expenses" as any)
          .select("amount")
          .eq("user_id", user.id)
          .gte("incurred_at", curStart.toISOString().slice(0, 10))
          .lte("incurred_at", curEnd.toISOString().slice(0, 10)),
        fetchPeriodAdjustments(user.id, curStart.toISOString(), curEnd.toISOString()),
        fetchPeriodAdjustments(user.id, prevStart.toISOString(), prevEnd.toISOString()),
      ]);
      if (cancelled) return;
      setInv((invRes.data ?? []) as InvRow[]);
      setCurOrders((curRes.data ?? []) as OrderRow[]);
      setPrevOrders((prevRes.data ?? []) as OrderRow[]);
      setRecentOrders((recentRes.data ?? []) as OrderRow[]);
      setWeekOrders((weekRes.data ?? []) as OrderRow[]);
      setOperatingExpenses(((opexRes.data ?? []) as any[]).reduce((s, e) => s + Number(e.amount ?? 0), 0));
      setCurAdjustments(curAdj);
      setPrevAdjustments(prevAdj);
      setLoading(false);

      // Fetch this week's order line items separately (not the order-level
      // "product" text, which is every item in that order joined with
      // commas — useless for finding a single best-selling product), plus
      // each product's tiktok_product_id so same-product variants (S/M/L)
      // can be merged before picking a "best seller".
      const weekOrderIds = ((weekRes.data ?? []) as any[]).map((o) => o.id).filter(Boolean);
      if (weekOrderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items" as any)
          .select("order_id,product_id,product_name,quantity,unit_price_at_sale")
          .in("order_id", weekOrderIds);
        if (!cancelled) setWeekItems(((items ?? []) as any) as WeekItemRow[]);
        const productIds = Array.from(new Set(((items ?? []) as any[]).map((i) => i.product_id).filter(Boolean)));
        if (productIds.length > 0) {
          const { data: invTid } = await supabase.from("inventory").select("id,tiktok_product_id").in("id", productIds);
          const tidByProduct: Record<string, string> = {};
          for (const r of ((invTid ?? []) as any[])) if (r.tiktok_product_id) tidByProduct[r.id] = r.tiktok_product_id;
          if (!cancelled) setTiktokIdByProduct(tidByProduct);
        } else if (!cancelled) {
          setTiktokIdByProduct({});
        }
      } else if (!cancelled) {
        setWeekItems([]);
        setTiktokIdByProduct({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, range, customFrom, customTo]);

  const stats = useMemo(() => {
    const sum = (rows: OrderRow[]) => {
      let sales = 0;
      let profit = 0;
      let contribution = 0;
      // TikTok placeholder orders (financial_status = "pending") have no
      // real amount/cost yet — never count them.
      const complete = rows.filter((o: any) => o.financial_status !== "pending");
      for (const o of complete) {
        sales += Number(o.amount ?? 0);
        profit += orderGrossProfit({ amount: o.amount, cost: o.cost, gross_profit: o.gross_profit });
        contribution += orderContributionProfit({
          amount: o.amount,
          cost: o.cost,
          gross_profit: o.gross_profit,
          platform_fee_amount: o.platform_fee_amount,
          shipping_cost: o.shipping_cost,
          affiliate_commission: o.affiliate_commission,
        });
      }
      return { sales, profit, contribution, count: complete.length };
    };
    const applyAdjustments = (s: { sales: number; profit: number; contribution: number; count: number }, adj: PeriodAdjustments) => ({
      ...s,
      sales: s.sales - adj.revenueReversed,
      profit: s.profit - (adj.revenueReversed - adj.cogsReversed),
      contribution: s.contribution - (adj.revenueReversed - adj.cogsReversed),
    });
    const cur = applyAdjustments(sum(curOrders), curAdjustments);
    const prev = applyAdjustments(sum(prevOrders), prevAdjustments);
    const netProfit = cur.contribution - operatingExpenses;
    let lowStockItems = 0;
    let losing = 0;
    for (const it of inv) {
      const stock = Number(it.stock ?? 0);
      const price = Number(it.price ?? 0);
      const cost = Number(it.cost_price ?? 0);
      if (stock <= lowThreshold) lowStockItems++;
      if (price > 0 && cost > price) losing++;
    }
    return {
      sales: cur.sales,
      profit: cur.profit,
      contribution: cur.contribution,
      netProfit,
      operatingExpenses,
      count: cur.count,
      salesDelta: pctDelta(cur.sales, prev.sales),
      profitDelta: pctDelta(cur.contribution, prev.contribution),
      countDelta: pctDelta(cur.count, prev.count),
      lowStockItems,
      losing,
    };
  }, [inv, curOrders, prevOrders, operatingExpenses, lowThreshold, curAdjustments, prevAdjustments]);

  const suggestion = useMemo(() => {
    if (loading) return null;

    // Priority 1: loss-making SKUs (money leaking every sale)
    const losing = inv.filter(
      (i) => Number(i.price ?? 0) > 0 && Number(i.cost_price ?? 0) > Number(i.price ?? 0),
    );
    // Priority 2: out of stock (can't sell)
    const out = inv.filter((i) => Number(i.stock ?? 0) <= 0);
    // Priority 3: low stock
    const low = inv.filter((i) => {
      const s = Number(i.stock ?? 0);
      return s > 0 && s <= lowThreshold;
    });

    // Best seller (last 7 days) by revenue — from order LINE ITEMS, not the
    // order-level "product" text (every item in that order joined with
    // commas, which never matches a real product name). Same-product
    // TikTok variants (S/M/L etc.) are merged so the parent product wins
    // instead of splitting its revenue across several weaker entries.
    const invByName = new Map<string, InvRow>();
    for (const it of inv) if (it.name) invByName.set(it.name.trim().toLowerCase(), it);
    const revByKey = new Map<string, { name: string; rev: number; productId: string | null }>();
    for (const it of weekItems) {
      const name = (it.product_name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = revByKey.get(key) ?? { name, rev: 0, productId: it.product_id ?? null };
      cur.rev += Number(it.unit_price_at_sale ?? 0) * Number(it.quantity ?? 0);
      if (!cur.productId && it.product_id) cur.productId = it.product_id;
      revByKey.set(key, cur);
    }
    const revByTiktokId = new Map<string, Array<{ name: string; rev: number }>>();
    for (const v of revByKey.values()) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      if (!tid) continue;
      if (!revByTiktokId.has(tid)) revByTiktokId.set(tid, []);
      revByTiktokId.get(tid)!.push(v);
    }
    const revGroupedIds = new Set<string>();
    for (const [tid, arr] of revByTiktokId) if (arr.length > 1) revGroupedIds.add(tid);
    let topName: string | null = null;
    let topRev = 0;
    const revSeen = new Set<string>();
    for (const v of revByKey.values()) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      let name = v.name;
      let rev = v.rev;
      if (tid && revGroupedIds.has(tid)) {
        if (revSeen.has(tid)) continue;
        revSeen.add(tid);
        const vs = revByTiktokId.get(tid)!;
        name = stripVariantSuffix(vs[0].name);
        rev = vs.reduce((s, x) => s + x.rev, 0);
      }
      if (rev > topRev) {
        topRev = rev;
        topName = invByName.get(name.toLowerCase())?.name ?? name;
      }
    }

    type Msg = { key: string; text: string };
    const pool: Msg[] = [];
    for (const i of losing) pool.push({ key: `losing:${i.id}`, text: t("ro_sug_losing").replace("{name}", i.name) });
    for (const i of out) pool.push({ key: `out:${i.id}`, text: t("ro_sug_out").replace("{name}", i.name) });
    for (const i of low) pool.push({ key: `low:${i.id}`, text: t("ro_sug_low").replace("{name}", i.name) });
    if (topName && topRev > 0) {
      pool.push({ key: `top:${topName}`, text: t("ro_sug_top").replace("{name}", topName) });
    }
    if (pool.length === 0) return { key: "ok", text: t("ro_sug_ok") };
    return pool[tick % pool.length];
  }, [inv, weekItems, tiktokIdByProduct, loading, t, tick, lowThreshold]);

  const rangeLabel =
    range === "week" ? t("this_week") : range === "month" ? t("this_month") : t("custom");

  // Count of TikTok orders in the current period still awaiting real
  // financial data — shown as a soft indicator on the hero card so the
  // seller knows why a sale they can see isn't reflected in the numbers yet.
  const pendingSyncCount = curOrders.filter((o: any) => o.financial_status === "pending").length;

  const remind = (o: OrderRow) => {
    if (!o.phone) {
      alert(t("no_phone_for_wa"));
      return;
    }
    const msg = renderTemplate(
      getReminderTemplate(lang, bizType, customReminderTpl),
      {
        customer_name: o.customer_name ?? "",
        business_name: waProfile.businessName,
        code: o.code ?? "",
        product: o.product ?? "",
        quantity: Number(o.quantity ?? 1),
        amount: Number(o.amount ?? 0).toFixed(2),
        status: o.status ?? "",
        days_ago: daysSince(o.created_at),
        payment_details: waProfile.paymentDetails,
      },
      lang,
    );
    const cleaned = (o.phone || "").replace(/[^0-9]/g, "");
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(stripEmoji(msg))}`;
    window.open(url, "_blank");
  };

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">{t("ro_title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("ro_subtitle")}</p>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setRangePickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-card border border-border/60 text-foreground shadow-[var(--shadow-card)] active:scale-95"
          >
            {rangeLabel}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {rangePickerOpen && (
            <div className="absolute right-0 mt-1.5 z-20 rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden min-w-[10rem]">
              {(["week", "month", "custom"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRange(r);
                    setRangePickerOpen(false);
                  }}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-muted ${
                    range === r ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {r === "week" ? t("this_week") : r === "month" ? t("this_month") : t("custom")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {range === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-muted-foreground">
            {t("from_date")}
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-xs"
            />
          </label>
          <label className="text-[10px] text-muted-foreground">
            {t("to_date")}
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-xs"
            />
          </label>
        </div>
      )}

      {/* First-run guidance for brand-new users; auto-hides when all 5 steps done. */}
      <div className="mt-4">
        <SetupChecklist />
      </div>

      {/* 11.11 campaign teaser — only renders once a campaign date range is
          saved on /campaign, and hides itself once the campaign has ended. */}
      <CampaignBanner />

      {/* Hero card: net profit for the period, on the brand's real logo
          gradient (blue → purple, sampled from bossify-logo.png). Shows
          both Contribution Profit (before operating expenses) and Net
          Profit (after) — two different numbers, deliberately not one. */}
      <div
        className="mt-4 rounded-2xl p-4"
        style={{ background: "linear-gradient(135deg, #2925EC, #7B25F5)" }}
      >
        <div className="flex items-baseline justify-between pb-2.5 mb-2.5 border-b border-white/20">
          <span className="text-[11px] text-white/70">
            {lang === "zh" ? "边际利润" : lang === "ms" ? "Untung sumbangan" : "Contribution profit"}
          </span>
          <span className="text-sm font-semibold text-white/90">
            {loading ? "…" : money(stats.contribution)}
          </span>
        </div>
        <p className="text-[11px] text-white/70">{t("ro_total_profit")}</p>
        <p className="mt-1 text-3xl font-bold text-white">
          {loading ? "…" : money(stats.netProfit)}
        </p>
        <TrendPill delta={loading ? null : stats.profitDelta} onDark />
        {stats.operatingExpenses > 0 && (
          <p className="mt-1 text-[10px] text-white/60">
            {lang === "zh"
              ? `已扣除 ${money(stats.operatingExpenses)} 营业费用`
              : lang === "ms"
                ? `Selepas ${money(stats.operatingExpenses)} perbelanjaan operasi`
                : `After ${money(stats.operatingExpenses)} operating expenses`}
          </p>
        )}
        <div className="mt-3 flex items-center gap-5 pt-3 border-t border-white/20">
          <div>
            <p className="text-[10px] text-white/70">{t("ro_total_sales")}</p>
            <p className="text-sm font-semibold text-white">{loading ? "…" : money(stats.sales)}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/70">{t("ro_orders_count")}</p>
            <p className="text-sm font-semibold text-white">{loading ? "…" : String(stats.count)}</p>
          </div>
        </div>
      </div>

      {pendingSyncCount > 0 && (
        <div className="mt-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-center gap-2">
          <span className="text-sm">⏳</span>
          <p className="text-[11px] text-amber-800">
            {pendingSyncCount} {lang === "zh" ? "笔 TikTok 订单同步中，暂未计入以上数字" : lang === "ms" ? "pesanan TikTok sedang disegerak, belum dikira" : "TikTok order(s) syncing — not counted above yet"}
          </p>
        </div>
      )}

      {/* Secondary stats: order count trend, low stock — kept as plain
          white cards so the hero card above stays the single visual anchor. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <KpiCard
          label={t("ro_orders_count")}
          value={loading ? "…" : String(stats.count)}
          delta={loading ? null : stats.countDelta}
        />
        <KpiCard
          label={t("ro_low_stock_items")}
          value={loading ? "…" : String(stats.lowStockItems)}
          delta={null}
          tone={stats.lowStockItems > 0 ? "warn" : "success"}
        />
      </div>

      {/* Suggestion */}
      {suggestion && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card p-3.5 shadow-[var(--shadow-card)]">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("ro_today_focus")}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground leading-snug">{suggestion.text}</p>
        </div>
      )}

      {/* Recent Orders */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-3.5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{t("ro_recent_orders")}</p>
          <Link to="/orders" className="text-xs font-semibold text-primary">
            {t("ro_view_all")}
          </Link>
        </div>
        <div className="mt-2 divide-y divide-border/60">
          {loading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">…</p>
          ) : recentOrders.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{t("ro_no_orders")}</p>
          ) : (
            recentOrders.map((o) => (
              <Link
                key={o.id}
                to="/orders/$orderId"
                params={{ orderId: o.id! }}
                className="flex items-center gap-3 py-2.5 active:bg-muted/50 rounded-lg -mx-1 px-1"
              >
                <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                  {(o.customer_name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {o.customer_name || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{o.code || ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <StatusPill status={o.status ?? ""} />
                  <p className="mt-0.5 text-sm font-bold text-foreground">
                    {money(Number(o.amount ?? 0))}
                  </p>
                </div>
                {o.status === "Unpaid" && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remind(o);
                    }}
                    aria-label={t("remind")}
                    className="ml-1 h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-100 active:scale-95 shrink-0"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                )}
              </Link>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta: number | null;
  tone?: "primary" | "success" | "danger" | "warn";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : tone === "warn"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] text-muted-foreground font-medium truncate">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      <TrendPill delta={delta} />
    </div>
  );
}

function TrendPill({ delta, onDark }: { delta: number | null; onDark?: boolean }) {
  if (delta === null || !isFinite(delta)) {
    return <p className={`mt-1 text-[11px] ${onDark ? "text-white/60" : "text-muted-foreground"}`}>—</p>;
  }
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = onDark
    ? (up ? "text-emerald-300" : "text-red-300")
    : (up ? "text-emerald-600" : "text-red-600");
  return (
    <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${color}`}>
      <Icon className="h-3 w-3" />
      {`${up ? "+" : ""}${delta.toFixed(1)}%`}
    </p>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : s === "unpaid"
        ? "bg-red-100 text-red-600"
        : s === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status || "—"}
    </span>
  );
}