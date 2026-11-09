import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, MessageCircle, Plus, Trophy, Package, Wallet, FileText, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from "recharts";
import { useServerFn } from "@tanstack/react-start";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { orderGrossProfit, orderContributionProfit } from "@/lib/orderMath";
import { SetupChecklist } from "@/components/SetupChecklist";
import { CampaignBanner } from "@/components/CampaignBanner";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { fetchPeriodAdjustments, type PeriodAdjustments } from "@/lib/refundAdjustments";
import { getPlatformConnection } from "@/lib/platformConnect.functions";
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

const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Range = "today" | "week" | "days30" | "month" | "custom";

function rangeWindows(range: Range, customFrom?: string, customTo?: string) {
  const now = new Date();
  const curEnd = new Date(now);
  let curStart: Date;
  if (range === "today") {
    curStart = new Date(now);
    curStart.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    curStart = new Date(now);
    curStart.setHours(0, 0, 0, 0);
    curStart.setDate(curStart.getDate() - 6);
  } else if (range === "days30") {
    curStart = new Date(now);
    curStart.setHours(0, 0, 0, 0);
    curStart.setDate(curStart.getDate() - 29);
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
  const { hasFullAccess, showUpgrade } = useSubscription();
  const getConnection = useServerFn(getPlatformConnection);
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
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number; profit: number }[]>([]);
  const [tiktokConnected, setTiktokConnected] = useState<boolean | null>(null);
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

  // TikTok Shop connection status — same check as the Profile page, just
  // for "tiktok" alone, so the dashboard can show a live connected/not
  // connected pill instead of a placeholder.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        let connected = false;
        if (Capacitor.isNativePlatform()) {
          const headers = await getAuthHeader();
          const res = await fetch(`${API_ORIGIN}/api/platforms/connect?platform=tiktok`, { headers });
          const j = await res.json();
          connected = j?.connection?.status === "active";
        } else {
          const { connection } = await getConnection({ data: { platform: "tiktok" as any } });
          connected = (connection as any)?.status === "active";
        }
        if (!cancelled) setTiktokConnected(connected);
      } catch {
        if (!cancelled) setTiktokConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
          .select("id,amount,cost,gross_profit,product,created_at,status,financial_status,platform_fee_amount,shipping_cost,affiliate_commission")
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

      // Top products by profit for the SELECTED period (not the fixed
      // 7-day window above) — same accurate line-item math as the
      // dedicated /product-profit page (unit_cost_at_sale +
      // packaging_cost_at_sale, netted against refunds/returns),
      // condensed to the top 3 for this dashboard card.
      const curOrderIds = ((curRes.data ?? []) as any[]).map((o) => o.id).filter(Boolean);
      if (curOrderIds.length > 0) {
        const [{ data: curItems }, { data: curAdjRows }] = await Promise.all([
          supabase
            .from("order_items" as any)
            .select("product_name,quantity,unit_price_at_sale,unit_cost_at_sale,packaging_cost_at_sale")
            .in("order_id", curOrderIds),
          supabase
            .from("order_adjustments" as any)
            .select("id")
            .eq("user_id", user.id)
            .gte("created_at", curStart.toISOString())
            .lte("created_at", curEnd.toISOString()),
        ]);
        const adjIds = ((curAdjRows ?? []) as any[]).map((a) => a.id);
        let adjItems: { product_name: string; revenue_reversed: number; cogs_reversed: number }[] = [];
        if (adjIds.length > 0) {
          const { data: adjItemRows } = await supabase
            .from("order_adjustment_items" as any)
            .select("product_name,revenue_reversed,cogs_reversed")
            .in("adjustment_id", adjIds);
          adjItems = ((adjItemRows ?? []) as any) ?? [];
        }
        const rawMap = new Map<string, { revenue: number; cost: number }>();
        for (const it of ((curItems ?? []) as any[])) {
          const key = it.product_name || "—";
          const qty = Number(it.quantity ?? 0);
          const revenue = Number(it.unit_price_at_sale ?? 0) * qty;
          const cost = (Number(it.unit_cost_at_sale ?? 0) + Number(it.packaging_cost_at_sale ?? 0)) * qty;
          const existing = rawMap.get(key) ?? { revenue: 0, cost: 0 };
          existing.revenue += revenue;
          existing.cost += cost;
          rawMap.set(key, existing);
        }
        for (const a of adjItems) {
          const key = a.product_name || "—";
          const existing = rawMap.get(key);
          if (!existing) continue;
          existing.revenue -= Number(a.revenue_reversed ?? 0);
          existing.cost -= Number(a.cogs_reversed ?? 0);
        }
        const grouped = new Map<string, { name: string; revenue: number; cost: number }>();
        for (const [rawName, v] of rawMap) {
          const key = stripVariantSuffix(rawName);
          const existing = grouped.get(key) ?? { name: key, revenue: 0, cost: 0 };
          existing.revenue += v.revenue;
          existing.cost += v.cost;
          grouped.set(key, existing);
        }
        const ranked = Array.from(grouped.values())
          .map((p) => ({ name: p.name, revenue: p.revenue, profit: p.revenue - p.cost }))
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 3);
        if (!cancelled) setTopProducts(ranked);
      } else if (!cancelled) {
        setTopProducts([]);
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
      // cogs = sales - gross profit; sellingCosts = gross profit -
      // contribution profit (platform fee + shipping + affiliate commission
      // bundled together) — both derived rather than re-summed so they
      // stay exactly consistent with the profit figures above, for the
      // Profit Breakdown chart.
      const cogs = sales - profit;
      const sellingCosts = profit - contribution;
      return { sales, profit, contribution, cogs, sellingCosts, count: complete.length };
    };
    const applyAdjustments = (
      s: { sales: number; profit: number; contribution: number; cogs: number; sellingCosts: number; count: number },
      adj: PeriodAdjustments,
    ) => ({
      ...s,
      sales: s.sales - adj.revenueReversed,
      profit: s.profit - (adj.revenueReversed - adj.cogsReversed),
      contribution: s.contribution - (adj.revenueReversed - adj.cogsReversed),
      cogs: s.cogs - adj.cogsReversed,
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
    const unpaidOrders = curOrders.filter((o: any) => o.status === "Unpaid");
    const unpaidTotal = unpaidOrders.reduce((s, o: any) => s + Number(o.amount ?? 0), 0);
    const unpaidCount = unpaidOrders.length;
    return {
      sales: cur.sales,
      profit: cur.profit,
      contribution: cur.contribution,
      cogs: cur.cogs,
      sellingCosts: cur.sellingCosts,
      netProfit,
      operatingExpenses,
      count: cur.count,
      salesDelta: pctDelta(cur.sales, prev.sales),
      profitDelta: pctDelta(cur.contribution, prev.contribution),
      countDelta: pctDelta(cur.count, prev.count),
      lowStockItems,
      losing,
      unpaidTotal,
      unpaidCount,
    };
  }, [inv, curOrders, prevOrders, operatingExpenses, lowThreshold, curAdjustments, prevAdjustments]);

  // Daily net-profit trend for the currently selected range — reuses
  // curOrders (no extra query). Loss days render in red so a glance at
  // the bar below the zero line is enough to spot a bad day.
  const dailyChart = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const o of curOrders as any[]) {
      if (o.financial_status === "pending") continue;
      const day = String(o.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const p = orderContributionProfit({
        amount: o.amount,
        cost: o.cost,
        gross_profit: o.gross_profit,
        platform_fee_amount: o.platform_fee_amount,
        shipping_cost: o.shipping_cost,
        affiliate_commission: o.affiliate_commission,
      });
      byDay.set(day, (byDay.get(day) ?? 0) + p);
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
  }, [curOrders, lang]);

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
    range === "today"
      ? t("today_label")
      : range === "week"
        ? (lang === "zh" ? "过去7天" : lang === "ms" ? "7 Hari Lepas" : "Last 7 Days")
        : range === "days30"
          ? (lang === "zh" ? "过去30天" : lang === "ms" ? "30 Hari Lepas" : "Last 30 Days")
          : range === "month"
            ? t("this_month")
            : t("custom");

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

  // Home header: time-of-day greeting + the seller's own business name,
  // read from their real profile (same source as the WhatsApp templates)
  // -- never shown when it's still the unset "us" placeholder, so we
  // never greet someone by a name they never set.
  const greetingHour = new Date().getHours();
  const greetingKey = greetingHour < 12 ? "good_morning" : greetingHour < 18 ? "good_afternoon" : "good_evening";
  const sellerName = waProfile.businessName && waProfile.businessName !== "us" ? waProfile.businessName : null;
  const todayDateLabel = new Date().toLocaleDateString(
    lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY",
    { weekday: "short", day: "numeric", month: "short" },
  );
  const greetingSubtitle =
    lang === "zh"
      ? "这是你今天的生意状况。"
      : lang === "ms"
        ? "Berikut cara perniagaan anda hari ini."
        : "Here's how your business is doing today.";

  return (
    <>
    <div className="px-4 pt-4 pb-6 lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {t(greetingKey)}
            {sellerName ? `, ${sellerName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {todayDateLabel} · {greetingSubtitle}
          </p>
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
            <div className="absolute right-0 mt-1.5 z-20 rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden min-w-[9.5rem]">
              {(["today", "week", "days30", "month", "custom"] as Range[]).map((r) => (
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
                  {r === "today"
                    ? t("today_label")
                    : r === "week"
                      ? (lang === "zh" ? "过去7天" : lang === "ms" ? "7 Hari Lepas" : "Last 7 Days")
                      : r === "days30"
                        ? (lang === "zh" ? "过去30天" : lang === "ms" ? "30 Hari Lepas" : "Last 30 Days")
                        : r === "month"
                          ? t("this_month")
                          : t("custom")}
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

      {/* Main Business Summary: Revenue -> Costs -> Real Profit -> Margin.
          Real Profit carries the strongest visual weight on purpose --
          it's Bossify's core value proposition, not just another number
          next to Revenue. Contribution profit + order count are kept as
          small supporting text underneath rather than their own cards. */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">
            {lang === "zh" ? "营业额" : lang === "ms" ? "Hasil" : "Revenue"}
          </span>
          <span className="text-sm font-semibold text-foreground font-mono">
            {loading ? "…" : money(stats.sales)}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">
            {lang === "zh" ? "成本" : lang === "ms" ? "Kos" : "Costs"}
          </span>
          <span className="text-sm font-semibold text-foreground font-mono">
            {loading ? "…" : money(stats.sales - stats.netProfit)}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-foreground">
              {lang === "zh" ? "真实利润" : lang === "ms" ? "Untung Sebenar" : "Real Profit"}
            </span>
            <TrendPill delta={loading ? null : stats.profitDelta} />
          </div>
          <p className="mt-1 text-3xl font-bold text-primary font-mono tracking-tight">
            {loading ? "…" : money(stats.netProfit)}
          </p>
          {!loading && stats.sales > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {lang === "zh" ? "利润率" : lang === "ms" ? "Margin untung" : "Profit margin"}{" "}
              <span className="font-semibold text-foreground">
                {((stats.netProfit / stats.sales) * 100).toFixed(1)}%
              </span>
            </p>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>
            {lang === "zh" ? "边际利润" : lang === "ms" ? "Untung sumbangan" : "Contribution profit"}{" "}
            <span className="font-semibold text-foreground font-mono">{loading ? "…" : money(stats.contribution)}</span>
          </span>
          <span>
            {t("ro_orders_count")}{" "}
            <span className="font-semibold text-foreground font-mono">{loading ? "…" : String(stats.count)}</span>
          </span>
        </div>
        {stats.operatingExpenses > 0 && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {lang === "zh"
              ? `已扣除 ${money(stats.operatingExpenses)} 营业费用`
              : lang === "ms"
                ? `Selepas ${money(stats.operatingExpenses)} perbelanjaan operasi`
                : `After ${money(stats.operatingExpenses)} operating expenses`}
          </p>
        )}
      </div>

      {pendingSyncCount > 0 && (
        <div className="mt-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 flex items-center gap-2">
          <p className="text-[11px] text-amber-700 font-medium">
            {pendingSyncCount} {lang === "zh" ? "笔 TikTok 订单同步中，暂未计入以上数字" : lang === "ms" ? "pesanan TikTok sedang disegerak, belum dikira" : "TikTok order(s) syncing — not counted above yet"}
          </p>
        </div>
      )}

      <div className="mt-2.5">
        <TikTokStatusPill connected={tiktokConnected} lang={lang} />
      </div>

      {/* Profit Trend — Contribution Profit per day for the selected
          period. Operating expenses aren't dated per-day in the schema,
          so they're deliberately left out of this chart rather than
          faked; the Business Summary above already nets them into Real
          Profit, which is the number that matters most. */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {lang === "zh" ? "利润趋势" : lang === "ms" ? "Trend Untung" : "Profit Trend"}
          </p>
          <TrendPill delta={loading ? null : stats.profitDelta} />
        </div>
        <p className="mt-1 text-xl font-bold text-foreground font-mono">
          {loading ? "…" : money(stats.contribution)}
        </p>
        {dailyChart.length > 1 ? (
          <div className="mt-2 -mx-1">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={dailyChart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
                <Bar dataKey="profit" radius={[3, 3, 3, 3]}>
                  {dailyChart.map((d, i) => (
                    <Cell key={i} fill={d.profit < 0 ? "#DC2626" : "#8B5CF6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          !loading && (
            <p className="mt-3 text-xs text-muted-foreground text-center py-4">
              {lang === "zh" ? "这段时间还没有订单数据" : lang === "ms" ? "Tiada data pesanan untuk tempoh ini" : "No order data for this period yet"}
            </p>
          )
        )}
      </div>

      <div className="mt-2.5">
        <ProfitBreakdownCard
          cogs={stats.cogs}
          sellingCosts={stats.sellingCosts}
          operatingExpenses={stats.operatingExpenses}
          netProfit={stats.netProfit}
          lang={lang}
        />
      </div>

      {/* Needs Attention — a real action list instead of the old single
          rotating tip; each row links straight to where it gets fixed. */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-card)] overflow-hidden">
        <p className="px-3.5 pt-3.5 text-sm font-semibold text-foreground">
          {lang === "zh" ? "需要关注" : lang === "ms" ? "Perlu Perhatian" : "Needs Attention"}
        </p>
        <div className="mt-1 divide-y divide-border/60">
          {loading ? (
            <p className="px-3.5 py-4 text-xs text-muted-foreground">…</p>
          ) : stats.lowStockItems === 0 && stats.losing === 0 && stats.unpaidCount === 0 ? (
            <p className="px-3.5 py-4 text-xs text-muted-foreground">
              {lang === "zh" ? "今日一切正常" : lang === "ms" ? "Semua nampak baik hari ini" : "Everything looks healthy today"}
            </p>
          ) : (
            <>
              {stats.lowStockItems > 0 && (
                <Link to="/inventory" className="flex items-center gap-2.5 px-3.5 py-2.5 active:bg-muted/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="flex-1 text-xs text-foreground">
                    {lang === "zh"
                      ? `${stats.lowStockItems} 个产品库存偏低`
                      : lang === "ms"
                        ? `${stats.lowStockItems} produk stok rendah`
                        : `${stats.lowStockItems} ${stats.lowStockItems === 1 ? "product is" : "products are"} low in stock`}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
              {stats.losing > 0 && (
                <Link to="/product-profit" className="flex items-center gap-2.5 px-3.5 py-2.5 active:bg-muted/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600 shrink-0" />
                  <span className="flex-1 text-xs text-foreground">
                    {lang === "zh"
                      ? `${stats.losing} 个产品正在亏本`
                      : lang === "ms"
                        ? `${stats.losing} produk sedang rugi`
                        : `${stats.losing} ${stats.losing === 1 ? "product is" : "products are"} losing money`}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
              {stats.unpaidCount > 0 && (
                <Link to="/orders" className="flex items-center gap-2.5 px-3.5 py-2.5 active:bg-muted/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="flex-1 text-xs text-foreground">
                    {money(stats.unpaidTotal)}{" "}
                    {lang === "zh" ? "未付款订单" : lang === "ms" ? "dalam pesanan belum bayar" : "in unpaid orders"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>

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
                search={{} as never}
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

      <div className="mt-4">
        <TopProductsCard products={topProducts} lang={lang} t={t} />
      </div>

      {/* Quick Actions — the most common things a seller does from Home. */}
      <div className="mt-4">
        <p className="text-sm font-semibold text-foreground mb-2">
          {lang === "zh" ? "快捷操作" : lang === "ms" ? "Tindakan Pantas" : "Quick Actions"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          <Link
            to="/new-order"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card py-3 active:bg-muted/50"
          >
            <Plus className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium text-foreground text-center leading-tight">{t("new_order")}</span>
          </Link>
          <Link
            to="/inventory"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card py-3 active:bg-muted/50"
          >
            <Package className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium text-foreground text-center leading-tight">{t("add_product")}</span>
          </Link>
          <Link
            to="/add-cost"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card py-3 active:bg-muted/50"
          >
            <Wallet className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium text-foreground text-center leading-tight">{t("more_add_cost")}</span>
          </Link>
          <Link
            to="/reports"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card py-3 active:bg-muted/50"
          >
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium text-foreground text-center leading-tight">{t("more_reports")}</span>
          </Link>
        </div>
      </div>

      {!hasFullAccess && (
        <div className="mt-4">
          <UpgradeToProCard onUpgrade={() => showUpgrade("dashboard")} lang={lang} />
        </div>
      )}

    </div>
    {/* Desktop: same data/state as the mobile view above, laid out to
        use the available width instead of a centered mobile column. */}
    <div className="hidden lg:block">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground">{t("ro_title")}</h1>
            <TikTokStatusPill connected={tiktokConnected} lang={lang} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{t("ro_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <button
              onClick={() => setRangePickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg border border-border/60 bg-card text-foreground"
            >
              {rangeLabel}
              <ChevronDown className="h-4 w-4" />
            </button>
            {rangePickerOpen && (
              <div className="absolute right-0 mt-1.5 z-20 rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden min-w-[10rem]">
                {(["today", "week", "days30", "month", "custom"] as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRange(r);
                      setRangePickerOpen(false);
                    }}
                    className={`w-full text-left text-sm px-3.5 py-2.5 hover:bg-muted ${
                      range === r ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {r === "today"
                      ? t("today_label")
                      : r === "week"
                        ? (lang === "zh" ? "过去7天" : lang === "ms" ? "7 Hari Lepas" : "Last 7 Days")
                        : r === "days30"
                          ? (lang === "zh" ? "过去30天" : lang === "ms" ? "30 Hari Lepas" : "Last 30 Days")
                          : r === "month"
                            ? t("this_month")
                            : t("custom")}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            to="/new-order"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t("ro_new_sale")}
          </Link>
        </div>
      </div>

      {range === "custom" && (
        <div className="mb-5 flex gap-3">
          <label className="text-xs text-muted-foreground">
            {t("from_date")}
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="mt-1 w-48 rounded-lg bg-card border border-border/60 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("to_date")}
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="mt-1 w-48 rounded-lg bg-card border border-border/60 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      <CampaignBanner />

      {/* Ledger stat strip — same underlying numbers as the mobile hero
          card and KPI tiles, laid out as a single row now that desktop
          has the width for it. */}
      <div className="mt-4 grid grid-cols-6 rounded-xl border border-border/60 bg-card overflow-hidden">
        <DesktopStatCell
          label={t("ro_total_profit")}
          value={loading ? "…" : money(stats.netProfit)}
          delta={loading ? null : stats.profitDelta}
        />
        <DesktopStatCell
          label={lang === "zh" ? "边际利润" : lang === "ms" ? "Untung sumbangan" : "Contribution profit"}
          value={loading ? "…" : money(stats.contribution)}
        />
        <DesktopStatCell
          label={lang === "zh" ? "毛利润" : lang === "ms" ? "Untung kasar" : "Gross profit"}
          value={loading ? "…" : money(stats.profit)}
        />
        <DesktopStatCell label={t("ro_total_sales")} value={loading ? "…" : money(stats.sales)} />
        <DesktopStatCell
          label={t("ro_orders_count")}
          value={loading ? "…" : String(stats.count)}
          delta={loading ? null : stats.countDelta}
        />
        <DesktopStatCell
          label={t("ro_low_stock_items")}
          value={loading ? "…" : String(stats.lowStockItems)}
          tone={stats.lowStockItems > 0 ? "warn" : "success"}
          last
        />
      </div>

      {pendingSyncCount > 0 && (
        <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 flex items-center gap-2">
          <p className="text-xs text-amber-700 font-medium">
            {pendingSyncCount}{" "}
            {lang === "zh"
              ? "笔 TikTok 订单同步中，暂未计入以上数字"
              : lang === "ms"
                ? "pesanan TikTok sedang disegerak, belum dikira"
                : "TikTok order(s) syncing — not counted above yet"}
          </p>
        </div>
      )}

      {dailyChart.length > 1 && (
        <div className="mt-5 rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
            {lang === "zh" ? "每日利润趋势" : lang === "ms" ? "Trend Untung Harian" : "Daily Profit Trend"}
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dailyChart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={48} />
              <Tooltip formatter={(v: number) => `RM ${v.toFixed(2)}`} />
              <Bar dataKey="profit" radius={[4, 4, 4, 4]}>
                {dailyChart.map((d, i) => (
                  <Cell key={i} fill={d.profit < 0 ? "#DC2626" : "#8B5CF6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && dailyChart.length <= 1 && (
        <div className="mt-5 rounded-xl border border-dashed border-border/60 bg-card/50 p-4 text-center">
          <p className="text-xs text-muted-foreground">{lang === "zh" ? "这段时间还没有订单数据" : lang === "ms" ? "Tiada data pesanan untuk tempoh ini" : "No order data for this period yet"}</p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-5 items-start">
        {/* Recent Orders table */}
        <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
            <h2 className="text-sm font-semibold text-foreground">{t("ro_recent_orders")}</h2>
            <Link to="/orders" className="text-xs font-semibold text-primary">
              {t("ro_view_all")}
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("customer_name")}
                </th>
                <th className="px-5 py-2.5" />
                <th className="px-5 py-2.5" />
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                    …
                  </td>
                </tr>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                    {t("ro_no_orders")}
                  </td>
                </tr>
              ) : (
                recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <Link to="/orders/$orderId" params={{ orderId: o.id! }} search={{} as never} className="flex items-center gap-2.5">
                        <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                          {(o.customer_name ?? "?").slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-foreground truncate">{o.customer_name || "—"}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">{o.code || ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">
                      {money(Number(o.amount ?? 0))}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={o.status ?? ""} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {o.status === "Unpaid" && (
                        <button
                          onClick={() => remind(o)}
                          aria-label={t("remind")}
                          className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-100 hover:opacity-90"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Side panels */}
        <div className="flex flex-col gap-4">
          <SetupChecklist />
          {suggestion && (
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("ro_today_focus")}
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground leading-snug">{suggestion.text}</p>
            </div>
          )}
          {!hasFullAccess && (
            <UpgradeToProCard onUpgrade={() => showUpgrade("dashboard")} lang={lang} />
          )}
          <TopProductsCard products={topProducts} lang={lang} t={t} />
          <ProfitBreakdownCard
            cogs={stats.cogs}
            sellingCosts={stats.sellingCosts}
            operatingExpenses={stats.operatingExpenses}
            netProfit={stats.netProfit}
            lang={lang}
          />
        </div>
      </div>
    </div>
    </>
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

function DesktopStatCell({
  label,
  value,
  delta,
  tone = "primary",
  last,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone?: "primary" | "success" | "danger" | "warn";
  last?: boolean;
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
    <div className={`px-4 py-3.5 ${last ? "" : "border-r border-border/60"}`}>
      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
      {delta !== undefined && <TrendPill delta={delta ?? null} />}
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
    ? (up ? "text-emerald-700" : "text-red-700")
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
      ? "bg-emerald-500/15 text-emerald-700"
      : s === "unpaid"
        ? "bg-red-500/15 text-red-700"
        : s === "pending"
          ? "bg-amber-500/15 text-amber-700"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status || "—"}
    </span>
  );
}
function TikTokStatusPill({ connected, lang }: { connected: boolean | null; lang: string }) {
  if (connected === null) return null;
  const label = connected
    ? (lang === "zh" ? "TikTok Shop 已连接" : lang === "ms" ? "TikTok Shop disambungkan" : "TikTok Shop connected")
    : (lang === "zh" ? "TikTok Shop 未连接" : lang === "ms" ? "TikTok Shop belum disambung" : "TikTok Shop not connected");
  const content = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        connected ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
      {label}
    </span>
  );
  return connected ? content : <Link to="/profile">{content}</Link>;
}

function UpgradeToProCard({ onUpgrade, lang }: { onUpgrade: () => void; lang: string }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {lang === "zh" ? "升级到 Pro" : lang === "ms" ? "Naik taraf ke Pro" : "Upgrade to Pro"}
        </p>
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary border border-primary/40 rounded-full px-2 py-0.5">
          Pro
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {lang === "zh"
          ? "解锁无限订单、自动 TikTok Shop 同步，以及完整的 7 份报表导出。"
          : lang === "ms"
            ? "Buka kunci pesanan tanpa had, penyegerakan TikTok Shop automatik, dan ke-7 laporan PDF."
            : "Unlock unlimited orders, automatic TikTok Shop sync, and all 7 exportable reports."}
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        {lang === "zh" ? "查看方案" : lang === "ms" ? "Lihat pelan" : "View plans"}
      </button>
    </div>
  );
}

function TopProductsCard({
  products,
  lang,
  t,
}: {
  products: { name: string; revenue: number; profit: number }[];
  lang: string;
  t: (key: any) => string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-primary" />
          {lang === "zh" ? "利润最高的产品" : lang === "ms" ? "Produk paling untung" : "Top products by profit"}
        </p>
        <Link to="/product-profit" className="text-xs font-semibold text-primary">
          {t("ro_view_all")}
        </Link>
      </div>
      <div className="mt-3 space-y-2.5">
        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {lang === "zh" ? "这段时间还没有产品利润数据" : lang === "ms" ? "Tiada data untung produk untuk tempoh ini" : "No product profit data for this period yet"}
          </p>
        ) : (
          products.map((p, i) => (
            <div key={p.name + i} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-xs font-medium text-foreground">{p.name}</span>
              <span className={`text-xs font-bold font-mono ${p.profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {money(p.profit)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProfitBreakdownCard({
  cogs,
  sellingCosts,
  operatingExpenses,
  netProfit,
  lang,
}: {
  cogs: number;
  sellingCosts: number;
  operatingExpenses: number;
  netProfit: number;
  lang: string;
}) {
  const slices = [
    { key: "cogs", label: lang === "zh" ? "产品成本" : lang === "ms" ? "Kos produk" : "Product cost", value: Math.max(cogs, 0), color: "#8B5CF6" },
    { key: "selling", label: lang === "zh" ? "平台/运费" : lang === "ms" ? "Yuran platform/penghantaran" : "Platform & shipping fees", value: Math.max(sellingCosts, 0), color: "#D946EF" },
    { key: "opex", label: lang === "zh" ? "营业费用" : lang === "ms" ? "Perbelanjaan operasi" : "Operating expenses", value: Math.max(operatingExpenses, 0), color: "#60A5FA" },
    { key: "net", label: lang === "zh" ? "净利润" : lang === "ms" ? "Untung bersih" : "Net profit", value: Math.max(netProfit, 0), color: "#4ADE80" },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-sm font-semibold text-foreground">
        {lang === "zh" ? "利润构成" : lang === "ms" ? "Pecahan untung" : "Profit breakdown"}
      </p>
      {total <= 0 ? (
        <p className="mt-3 text-xs text-muted-foreground py-2">
          {lang === "zh" ? "这段时间还没有数据" : lang === "ms" ? "Tiada data untuk tempoh ini" : "No data for this period yet"}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <div className="h-[110px] w-[110px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius={32} outerRadius={50} paddingAngle={2} strokeWidth={0}>
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {slices.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
                <span className="font-semibold text-foreground">{money(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(cogs < 0 || sellingCosts < 0 || netProfit < 0) && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {lang === "zh"
            ? "注：本期有退款/亏损，图表只显示正数部分"
            : lang === "ms"
              ? "Nota: tempoh ini ada bayaran balik/kerugian, carta hanya tunjuk nilai positif"
              : "Note: this period includes refunds/losses — the chart shows positive amounts only"}
        </p>
      )}
    </div>
  );
}
