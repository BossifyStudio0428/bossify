import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package, Layers, Bell, MoreHorizontal, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { orderGrossProfit } from "@/lib/orderMath";

type InvRow = {
  id: string;
  name: string;
  price: number | null;
  cost_price: number | null;
  stock: number | null;
};

type OrderRow = {
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  product: string | null;
  created_at: string;
};

const LOW_STOCK_THRESHOLD = 5;

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfDaysAgoISO(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function RetailOverview() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [inv, setInv] = useState<InvRow[]>([]);
  const [todayOrders, setTodayOrders] = useState<OrderRow[]>([]);
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  // Rotate through equal-priority suggestions on each page load.
  const [tick] = useState(() => Math.floor(Math.random() * 1000));

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [invRes, todayRes, weekRes] = await Promise.all([
        supabase
          .from("inventory")
          .select("id,name,price,cost_price,stock")
          .eq("user_id", user.id),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at")
          .eq("user_id", user.id)
          .gte("created_at", startOfTodayISO()),
        supabase
          .from("orders")
          .select("amount,cost,gross_profit,product,created_at")
          .eq("user_id", user.id)
          .gte("created_at", startOfDaysAgoISO(7)),
      ]);
      if (cancelled) return;
      setInv((invRes.data ?? []) as InvRow[]);
      setTodayOrders((todayRes.data ?? []) as OrderRow[]);
      setWeekOrders((weekRes.data ?? []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const stats = useMemo(() => {
    const salesToday = todayOrders.reduce((s, o) => s + Number(o.amount ?? 0), 0);
    const profitToday = todayOrders.reduce(
      (s, o) => s + orderGrossProfit({ amount: o.amount, cost: o.cost, gross_profit: o.gross_profit }),
      0,
    );
    let low = 0;
    let restock = 0;
    let losing = 0;
    for (const it of inv) {
      const stock = Number(it.stock ?? 0);
      const thr = LOW_STOCK_THRESHOLD;
      const price = Number(it.price ?? 0);
      const cost = Number(it.cost_price ?? 0);
      if (stock <= 0) restock++;
      else if (stock <= thr) low++;
      if (price > 0 && cost > price) losing++;
    }
    return { salesToday, profitToday, low, restock, losing };
  }, [inv, todayOrders]);

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

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-xl font-bold text-foreground">{t("ro_title")}</h1>
      <p className="text-xs text-muted-foreground mt-0.5">{t("ro_subtitle")}</p>

      {/* 5 numbers */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <BigStat label={t("ro_sales_today")} value={loading ? "…" : money(stats.salesToday)} tone="primary" />
        <BigStat
          label={t("ro_profit_today")}
          value={loading ? "…" : money(stats.profitToday)}
          tone={stats.profitToday >= 0 ? "success" : "danger"}
        />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <SmallStat label={t("ro_low_stock")} value={loading ? "…" : String(stats.low)} tone="warn" />
        <SmallStat label={t("ro_needs_restock")} value={loading ? "…" : String(stats.restock)} tone="danger" />
        <SmallStat label={t("ro_losing_money")} value={loading ? "…" : String(stats.losing)} tone="danger" />
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

      {/* Quick actions */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <QuickCard to="/inventory" icon={Package} label={t("ro_open_products")} />
        <QuickCard to="/stock" icon={Layers} label={t("ro_open_stock")} />
        <QuickCard to="/alerts" icon={Bell} label={t("ro_open_alerts")} />
        <QuickCard to="/more" icon={MoreHorizontal} label={t("ro_open_more")} />
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

function BigStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : "text-primary";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-[var(--shadow-card)]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "warn" | "danger";
}) {
  const toneClass = tone === "danger" ? "text-red-600" : "text-amber-600";
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2.5 shadow-[var(--shadow-card)]">
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
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