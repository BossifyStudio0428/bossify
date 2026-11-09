import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Minus, Plus, Search, Package, AlertTriangle, XCircle, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { logInventoryChange } from "@/lib/inventoryAudit";

type Row = {
  id: string;
  name: string;
  stock: number | null;
  price: number | null;
  cost_price: number | null;
  image_url: string | null;
  cover_image_url: string | null;
};

const VELOCITY_WINDOW_DAYS = 14;
const PAR_MULTIPLIER = 2; // 2× weekly average

type SortMode = "needs" | "low" | "name";

function startOfDaysAgoISO(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const Route = createFileRoute("/stock")({ component: StockPage });

function StockKpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "amber" | "red" | "emerald";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-700",
    red: "bg-red-500/10 text-red-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function StockPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [velocity, setVelocity] = useState<Map<string, number>>(new Map()); // qty per day, keyed by lower(name)
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then((p) => setLowThreshold(p.low_stock_threshold)).catch(() => undefined);
  }, [user?.id]);
  const [sort, setSort] = useState<SortMode>("needs");

  const load = async () => {
    if (!user) return;
    const [invRes, ordRes] = await Promise.all([
      supabase
        .from("inventory")
        .select("id,name,stock,price,cost_price,image_url,cover_image_url")
        .eq("user_id", user.id)
        .order("stock", { ascending: true }),
      supabase
        .from("orders")
        .select("id,status,created_at")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .gte("created_at", startOfDaysAgoISO(VELOCITY_WINDOW_DAYS)),
    ]);
    if (invRes.error) toast.error(invRes.error.message);
    setRows((invRes.data ?? []) as Row[]);

    // Sales velocity is computed from order LINE ITEMS, not the order-level
    // "product" text field (every item in that order joined with commas,
    // e.g. "T恤 (S) × 2, 裤子 × 1"). Matched by exact name to each
    // inventory row, so a TikTok-synced size/color variant still gets its
    // own restock suggestion, driven by its own sales — that part is
    // deliberately NOT merged the way the Products list display is.
    const perDay = new Map<string, number>();
    const orderIds = ((ordRes.data ?? []) as any[]).map((o) => o.id).filter(Boolean);
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items" as any)
        .select("product_name,quantity")
        .in("order_id", orderIds);
      for (const it of (items ?? []) as any[]) {
        const key = String(it.product_name ?? "").trim().toLowerCase();
        if (!key) continue;
        const qty = Number(it.quantity ?? 0);
        if (qty <= 0) continue;
        perDay.set(key, (perDay.get(key) ?? 0) + qty / VELOCITY_WINDOW_DAYS);
      }
    }
    setVelocity(perDay);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows.slice();
    const suggested = (r: Row) => {
      const v = velocity.get(r.name.trim().toLowerCase()) ?? 0;
      const par = Math.ceil(v * 7 * PAR_MULTIPLIER);
      return Math.max(0, par - Number(r.stock ?? 0));
    };
    if (sort === "name") {
      base.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "low") {
      base.sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0));
    } else {
      // needs restock first
      base.sort((a, b) => {
        const diff = suggested(b) - suggested(a);
        if (diff !== 0) return diff;
        return Number(a.stock ?? 0) - Number(b.stock ?? 0);
      });
    }
    return base;
  }, [rows, q, sort, velocity]);

  const adjust = async (r: Row, delta: number) => {
    const next = Math.max(0, Number(r.stock ?? 0) + delta);
    const prev = rows;
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, stock: next } : x)));
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", r.id);
    if (error) {
      setRows(prev);
      toast.error(error.message);
    } else if (user) {
      logInventoryChange({ userId: user.id, productId: r.id, productName: r.name, fieldName: "stock", oldValue: r.stock, newValue: next, source: "stock_tab_adjust" });
    }
  };

  const tone = (r: Row): "danger" | "warn" | "ok" => {
    const s = Number(r.stock ?? 0);
    const thr = lowThreshold;
    if (s <= 0) return "danger";
    if (s <= thr) return "warn";
    return "ok";
  };

  const infoFor = (r: Row): { daysLine: string; suggest: number } => {
    const v = velocity.get(r.name.trim().toLowerCase()) ?? 0;
    const stock = Number(r.stock ?? 0);
    const par = Math.ceil(v * 7 * PAR_MULTIPLIER);
    const suggest = Math.max(0, par - stock);
    if (v <= 0) return { daysLine: t("stock_no_velocity"), suggest };
    const days = Math.floor(stock / v);
    return { daysLine: t("stock_days_left").replace("{n}", String(days)), suggest };
  };

  // Desktop KPIs — stock value uses cost basis (cost_price), falling back
  // to selling price only when no cost has been entered yet.
  const stockValueOf = (r: Row) => Number(r.stock ?? 0) * Number(r.cost_price ?? r.price ?? 0);
  const totalStockValue = rows.reduce((s, r) => s + stockValueOf(r), 0);
  const totalItems = rows.length;
  const lowStockCount = rows.filter((r) => tone(r) === "warn").length;
  const outOfStockCount = rows.filter((r) => tone(r) === "danger").length;
  const healthyCount = Math.max(0, totalItems - lowStockCount - outOfStockCount);
  // "Fast mover" = selling at an average of 1+ unit/day over the trailing
  // velocity window — same velocity figure the restock suggestion uses.
  const fastMoversCount = rows.filter((r) => (velocity.get(r.name.trim().toLowerCase()) ?? 0) >= 1).length;
  const healthData = [
    { name: t("stock_badge_ok"), value: healthyCount, color: "#10B981" },
    { name: t("stock_badge_low"), value: lowStockCount, color: "#F59E0B" },
    { name: t("stock_badge_out"), value: outOfStockCount, color: "#DC2626" },
  ].filter((d) => d.value > 0);

  return (
    <div className="px-4 pt-4 pb-24 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("stock_title")}</h1>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 ml-11">{t("stock_subtitle")}</p>

      {/* Desktop-only KPI row */}
      <div className="hidden lg:grid lg:grid-cols-5 lg:gap-4 mt-6">
        <StockKpiCard
          icon={Wallet}
          label={lang === "zh" ? "库存总价值" : lang === "ms" ? "Nilai Stok" : "Total Stock Value"}
          value={`RM ${totalStockValue.toFixed(2)}`}
        />
        <StockKpiCard icon={Package} label={t("items")} value={String(totalItems)} />
        <StockKpiCard icon={AlertTriangle} label={t("stock_badge_low")} value={String(lowStockCount)} tone="amber" />
        <StockKpiCard icon={XCircle} label={t("stock_badge_out")} value={String(outOfStockCount)} tone="red" />
        <StockKpiCard
          icon={TrendingUp}
          label={lang === "zh" ? "畅销商品" : lang === "ms" ? "Jualan Pantas" : "Fast Movers"}
          value={String(fastMoversCount)}
          tone="emerald"
        />
      </div>

      {/* Desktop-only Stock Health donut */}
      {healthData.length > 0 && (
        <div className="hidden lg:block mt-4 rounded-2xl bg-card border border-border/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            {lang === "zh" ? "库存健康度" : lang === "ms" ? "Kesihatan Stok" : "Stock Health"}
          </p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={healthData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={2}>
                  {healthData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {healthData.map((d) => (
                <span key={d.name} className="inline-flex items-center gap-2 text-sm text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name} <span className="text-muted-foreground">({d.value})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 h-11">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] text-muted-foreground shrink-0">{t("stock_sort_label")}:</span>
        {(
          [
            { k: "needs", label: t("stock_sort_needs") },
            { k: "low", label: t("stock_sort_low") },
            { k: "name", label: t("stock_sort_name") },
          ] as { k: SortMode; label: string }[]
        ).map((o) => (
          <button
            key={o.k}
            onClick={() => setSort(o.k)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border transition ${
              sort === o.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("stock_empty")}</p>
      ) : (
        <>
        <ul className="lg:hidden mt-3 space-y-2">
          {filtered.map((r) => {
            const st = tone(r);
            const badgeClass =
              st === "danger"
                ? "bg-red-500/15 text-red-700"
                : st === "warn"
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-emerald-500/15 text-emerald-700";
            const badgeText =
              st === "danger" ? t("stock_badge_out") : st === "warn" ? t("stock_badge_low") : t("stock_badge_ok");
            const img = r.cover_image_url || r.image_url;
            const info = infoFor(r);
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-muted overflow-hidden">
                    {img ? (
                      <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{info.daysLine}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      aria-label="decrement"
                      onClick={() => adjust(r, -1)}
                      className="h-8 w-8 rounded-full border border-border flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{Number(r.stock ?? 0)}</span>
                    <button
                      aria-label="increment"
                      onClick={() => adjust(r, 1)}
                      className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {info.suggest > 0 && (
                  <button
                    onClick={() => adjust(r, info.suggest)}
                    className="mt-2 w-full text-left text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 active:scale-[0.99] transition"
                  >
                    {t("stock_suggest_restock").replace("{n}", String(info.suggest))}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* Desktop: inventory list table */}
        <div className="hidden lg:block mt-3 rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{lang === "zh" ? "商品" : lang === "ms" ? "Produk" : "Product"}</th>
                <th className="px-4 py-3 text-right">{lang === "zh" ? "库存" : lang === "ms" ? "Stok" : "Stock"}</th>
                <th className="px-4 py-3">{lang === "zh" ? "状态" : lang === "ms" ? "Status" : "Status"}</th>
                <th className="px-4 py-3">{lang === "zh" ? "可用天数" : lang === "ms" ? "Hari Baki" : "Days Left"}</th>
                <th className="px-4 py-3 text-right">{lang === "zh" ? "库存价值" : lang === "ms" ? "Nilai Stok" : "Stock Value"}</th>
                <th className="px-4 py-3 text-right">{lang === "zh" ? "操作" : lang === "ms" ? "Tindakan" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const st = tone(r);
                const badgeClass =
                  st === "danger"
                    ? "bg-red-500/15 text-red-700"
                    : st === "warn"
                      ? "bg-amber-500/15 text-amber-700"
                      : "bg-emerald-500/15 text-emerald-700";
                const badgeText =
                  st === "danger" ? t("stock_badge_out") : st === "warn" ? t("stock_badge_low") : t("stock_badge_ok");
                const img = r.cover_image_url || r.image_url;
                const info = infoFor(r);
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-muted overflow-hidden">
                          {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                        </div>
                        <span className="font-semibold text-foreground truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          aria-label="decrement"
                          onClick={() => adjust(r, -1)}
                          className="h-7 w-7 rounded-full border border-border flex items-center justify-center active:scale-95 transition-transform"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{Number(r.stock ?? 0)}</span>
                        <button
                          aria-label="increment"
                          onClick={() => adjust(r, 1)}
                          className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold ${badgeClass}`}>{badgeText}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{info.daysLine}</td>
                    <td className="px-4 py-3 text-right text-foreground font-semibold">RM {stockValueOf(r).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {info.suggest > 0 ? (
                        <button
                          onClick={() => adjust(r, info.suggest)}
                          className="text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 active:scale-[0.99] transition whitespace-nowrap"
                        >
                          {t("stock_suggest_restock").replace("{n}", String(info.suggest))}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}