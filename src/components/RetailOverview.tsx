import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { orderGrossProfit } from "@/lib/orderMath";
import { SetupChecklist } from "@/components/SetupChecklist";

type InvRow = {
  id: string;
  name: string;
  price: number | null;
  cost_price: number | null;
  stock: number | null;
};

type OrderRow = {
  id?: string;
  code?: string | null;
  customer_name?: string | null;
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  product: string | null;
  status?: string | null;
  created_at: string;
};

const LOW_STOCK_THRESHOLD = 5;

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
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState<InvRow[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [curOrders, setCurOrders] = useState<OrderRow[]>([]);
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  // Rotate through equal-priority suggestions on each page load.
  const [tick] = useState(() => Math.floor(Math.random() * 1000));

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    const { curStart, curEnd, prevStart, prevEnd } = rangeWindows(range, customFrom, customTo);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 7);
    (async () => {
      const [invRes, curRes, prevRes, recentRes, weekRes] = await Promise.all([
        supabase
          .from("inventory")
          .select("id,name,price,cost_price,stock")
          .eq("user_id", user.id),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at,status")
          .eq("user_id", user.id)
          .gte("created_at", curStart.toISOString())
          .lte("created_at", curEnd.toISOString()),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at,status")
          .eq("user_id", user.id)
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
        supabase
          .from("orders")
          .select("id,code,customer_name,amount,cost,gross_profit,product,created_at,status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at")
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString()),
      ]);
      if (cancelled) return;
      setInv((invRes.data ?? []) as InvRow[]);
      setCurOrders((curRes.data ?? []) as OrderRow[]);
      setPrevOrders((prevRes.data ?? []) as OrderRow[]);
      setRecentOrders((recentRes.data ?? []) as OrderRow[]);
      setWeekOrders((weekRes.data ?? []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, range, customFrom, customTo]);

  const stats = useMemo(() => {
    const sum = (rows: OrderRow[]) => {
      let sales = 0;
      let profit = 0;
      for (const o of rows) {
        sales += Number(o.amount ?? 0);
        profit += orderGrossProfit({ amount: o.amount, cost: o.cost, gross_profit: o.gross_profit });
      }
      return { sales, profit, count: rows.length };
    };
    const cur = sum(curOrders);
    const prev = sum(prevOrders);
    let lowStockItems = 0;
    let losing = 0;
    for (const it of inv) {
      const stock = Number(it.stock ?? 0);
      const price = Number(it.price ?? 0);
      const cost = Number(it.cost_price ?? 0);
      if (stock <= LOW_STOCK_THRESHOLD) lowStockItems++;
      if (price > 0 && cost > price) losing++;
    }
    return {
      sales: cur.sales,
      profit: cur.profit,
      count: cur.count,
      salesDelta: pctDelta(cur.sales, prev.sales),
      profitDelta: pctDelta(cur.profit, prev.profit),
      countDelta: pctDelta(cur.count, prev.count),
      lowStockItems,
      losing,
    };
  }, [inv, curOrders, prevOrders]);

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
      return s > 0 && s <= LOW_STOCK_THRESHOLD;
    });

    // Best seller (last 7 days) by revenue, matched to inventory by name.
    const invByName = new Map<string, InvRow>();
    for (const it of inv) if (it.name) invByName.set(it.name.trim().toLowerCase(), it);
    const revByName = new Map<string, number>();
    for (const o of weekOrders) {
      const key = (o.product ?? "").trim().toLowerCase();
      if (!key) continue;
      revByName.set(key, (revByName.get(key) ?? 0) + Number(o.amount ?? 0));
    }
    let topName: string | null = null;
    let topRev = 0;
    for (const [k, v] of revByName) {
      if (v > topRev) {
        topRev = v;
        topName = invByName.get(k)?.name ?? k;
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
  }, [inv, weekOrders, loading, t, tick]);

  const rangeLabel =
    range === "week" ? t("this_week") : range === "month" ? t("this_month") : t("custom");

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

      {/* 2x2 KPI grid with real trend vs previous period */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <KpiCard
          label={t("ro_total_sales")}
          value={loading ? "…" : money(stats.sales)}
          delta={loading ? null : stats.salesDelta}
        />
        <KpiCard
          label={t("ro_total_profit")}
          value={loading ? "…" : money(stats.profit)}
          delta={loading ? null : stats.profitDelta}
          tone={stats.profit < 0 ? "danger" : "success"}
        />
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
              </Link>
            ))
          )}
        </div>
      </div>

      <Link
        to="/new-order"
        className="mt-5 flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold active:scale-[0.98]"
      >
        <Plus className="h-5 w-5" />
        {t("ro_new_sale")}
      </Link>
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

function TrendPill({ delta }: { delta: number | null }) {
  if (delta === null || !isFinite(delta)) {
    return <p className="mt-1 text-[11px] text-muted-foreground">—</p>;
  }
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "text-emerald-600" : "text-red-600";
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

function QuickCard({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-3.5 shadow-[var(--shadow-card)] active:scale-[0.98]"
    >
      <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </Link>
  );
}