import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft, ChevronRight, AlertTriangle, PackageX, TrendingDown, CheckCircle2, Receipt,
  Clock, Link2Off, Unplug, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { isLossMakingProduct, productUnitContribution } from "@/lib/orderMath";
import { QuickCostSheet, type QuickCostItem } from "@/components/QuickCostEditor";

type Product = {
  id: string;
  name: string;
  stock: number | null;
  price: number | null;
  cost_price: number | null;
  packaging_cost: number | null;
  tiktok_product_id: string | null;
  tiktok_delisted_at: string | null;
};

type UnpaidOrder = { id: string; code: string; customer_name: string; amount: number; created_at: string };
type StuckOrder = { id: string; code: string; last_error: string | null; created_at: string };

type Tone = "red" | "amber" | "violet" | "slate";

const TONES: Record<Tone, { icon: string; chip: string; ring: string }> = {
  red: { icon: "bg-red-500/15 text-red-600", chip: "bg-red-500/10 text-red-700 border-red-200", ring: "border-red-200" },
  amber: { icon: "bg-amber-500/15 text-amber-700", chip: "bg-amber-500/10 text-amber-800 border-amber-200", ring: "border-amber-200" },
  violet: { icon: "bg-primary/10 text-primary", chip: "bg-primary/10 text-primary border-primary/20", ring: "border-primary/20" },
  slate: { icon: "bg-muted text-foreground", chip: "bg-muted text-foreground border-border", ring: "border-border/60" },
};

export const Route = createFileRoute("/alerts")({ component: AlertsPage });

function AlertsPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const L = (zh: string, en: string, ms?: string) => (lang === "zh" ? zh : lang === "ms" ? ms ?? en : en);

  const [products, setProducts] = useState<Product[]>([]);
  const [unpaid, setUnpaid] = useState<UnpaidOrder[]>([]);
  const [stuck, setStuck] = useState<StuckOrder[]>([]);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [feePct, setFeePct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);
  const [costItem, setCostItem] = useState<QuickCostItem | null>(null);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then((p) => setLowThreshold(p.low_stock_threshold)).catch(() => undefined);
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user) return;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [inv, prof, unpaidRes, stuckRes, conn] = await Promise.all([
      supabase
        .from("inventory")
        .select("id,name,stock,price,cost_price,packaging_cost,tiktok_product_id,tiktok_delisted_at" as any)
        .eq("user_id", user.id),
      supabase.from("profiles").select("platform_fee_percent").eq("id", user.id).maybeSingle(),
      supabase
        .from("orders")
        .select("id,code,customer_name,amount,created_at")
        .eq("user_id", user.id)
        .eq("status", "Unpaid")
        .lt("created_at", dayAgo)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("orders" as any)
        .select("id,code,last_error,created_at")
        .eq("user_id", user.id)
        .eq("order_source", "tiktok")
        .eq("financial_status", "pending")
        .not("last_error", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("platform_connections" as any)
        .select("status,last_error")
        .eq("user_id", user.id)
        .eq("platform", "tiktok")
        .maybeSingle(),
    ]);
    if (inv.error) toast.error(inv.error.message);
    setProducts(((inv.data ?? []) as unknown) as Product[]);
    setFeePct(Number((prof.data as any)?.platform_fee_percent ?? 0));
    setUnpaid(((unpaidRes.data ?? []) as unknown) as UnpaidOrder[]);
    setStuck(((stuckRes.data ?? []) as unknown) as StuckOrder[]);
    const c = conn.data as any;
    setTiktokError(c && (c.status !== "active" || c.last_error) ? (c.last_error || L("TikTok Shop 连接已断开", "TikTok Shop is disconnected")) : null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, lang]);

  useEffect(() => { load(); }, [load]);

  const g = useMemo(() => {
    const out: Product[] = [];
    const low: Product[] = [];
    const losing: Product[] = [];
    const noCost: Product[] = [];
    const delisted: Product[] = [];
    for (const p of products) {
      const s = Number(p.stock ?? 0);
      if (s <= 0) out.push(p);
      else if (s <= lowThreshold) low.push(p);
      const hasCost = Number(p.cost_price ?? 0) > 0;
      if (!hasCost && Number(p.price ?? 0) > 0) noCost.push(p);
      else if (isLossMakingProduct(p, feePct)) losing.push(p);
      if (p.tiktok_delisted_at) delisted.push(p);
    }
    low.sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0));
    losing.sort((a, b) => productUnitContribution(a, feePct) - productUnitContribution(b, feePct));
    return { out, low, losing, noCost, delisted };
  }, [products, lowThreshold, feePct]);

  const unpaidTotal = unpaid.reduce((s, o) => s + Number(o.amount ?? 0), 0);

  const groups: Array<{ key: string; tone: Tone; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; count: number }> = [
    { key: "tiktok", tone: "red", icon: Unplug, title: L("TikTok 需要处理", "TikTok needs attention", "TikTok perlu tindakan"), desc: L("连接或订单配对有问题", "Connection or order matching problem"), count: (tiktokError ? 1 : 0) + stuck.length },
    { key: "out", tone: "red", icon: PackageX, title: t("alerts_out_title"), desc: t("alerts_out_desc"), count: g.out.length },
    { key: "losing", tone: "red", icon: TrendingDown, title: t("alerts_losing_title"), desc: L("算上成本、包装和平台费，每卖一件都亏", "After cost, packaging and platform fee, every sale loses money"), count: g.losing.length },
    { key: "unpaid", tone: "amber", icon: Clock, title: L("超过 1 天未付款", "Unpaid for over a day", "Belum bayar lebih sehari"), desc: L("记得跟进收款", "Follow up on payment"), count: unpaid.length },
    { key: "low", tone: "amber", icon: AlertTriangle, title: t("alerts_low_title"), desc: t("alerts_low_desc"), count: g.low.length },
    { key: "nocost", tone: "violet", icon: Receipt, title: L("还没填成本", "No cost yet", "Tiada kos"), desc: L("没有成本，利润会算多", "Without a cost, profit is overstated"), count: g.noCost.length },
    { key: "delisted", tone: "slate", icon: Link2Off, title: L("TikTok 已下架", "Delisted on TikTok", "Dinyahsenarai di TikTok"), desc: L("TikTok 上已经没有，要不要删掉由你决定", "Gone from TikTok — you decide whether to remove it"), count: g.delisted.length },
  ];
  const total = groups.reduce((s, x) => s + x.count, 0);
  const urgent = groups.filter((x) => x.tone === "red").reduce((s, x) => s + x.count, 0);

  const jump = (key: string) => document.getElementById(`alert-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const days = (iso: string) => Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const openCost = (p: Product) => setCostItem({ id: p.id, name: p.name, price: p.price, cost_price: p.cost_price, packaging_cost: p.packaging_cost });

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground lg:text-2xl">{t("alerts_title")}</h1>
          <p className="text-xs text-muted-foreground">{t("alerts_subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : total === 0 ? (
        <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-3 text-base text-foreground font-bold">{t("alerts_all_good")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{L("库存、价钱、成本、收款和 TikTok 都没问题。", "Stock, prices, costs, payments and TikTok all look fine.")}</p>
        </section>
      ) : (
        <>
          {/* Summary */}
          <section className={`rounded-3xl p-5 shadow-[var(--shadow-card)] ${urgent > 0 ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"}`}>
            <p className="text-xs font-semibold opacity-85">{L("需要你处理", "Needs your attention", "Perlu perhatian")}</p>
            <p className="text-3xl font-bold mt-0.5">
              {total} <span className="text-base font-semibold opacity-90">{L("件事", total === 1 ? "item" : "items", "perkara")}</span>
            </p>
            {urgent > 0 && <p className="text-xs opacity-90 mt-0.5">{L(`其中 ${urgent} 件比较急`, `${urgent} urgent`, `${urgent} segera`)}</p>}
            {unpaidTotal > 0 && (
              <p className="text-xs opacity-90 mt-1">{L("未收款", "Waiting to be paid", "Belum dibayar")}: RM {unpaidTotal.toFixed(2)}</p>
            )}
          </section>

          {/* Category chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {groups.filter((x) => x.count > 0).map((x) => (
              <button
                key={x.key}
                onClick={() => jump(x.key)}
                className={`flex items-center gap-2.5 rounded-2xl border bg-card p-3 text-left active:scale-[0.99] transition-transform ${TONES[x.tone].ring}`}
              >
                <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${TONES[x.tone].icon}`}>
                  <x.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-none text-foreground">{x.count}</span>
                  <span className="block text-[11px] text-muted-foreground truncate mt-0.5">{x.title}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
            {/* TikTok */}
            <Group id="tiktok" g={groups[0]}>
              {tiktokError && (
                <Row
                  title={L("TikTok Shop 连接", "TikTok Shop connection")}
                  meta={tiktokError}
                  metaClass="text-red-600"
                  to="/profile"
                  action={L("去处理", "Fix")}
                />
              )}
              {stuck.map((o) => (
                <Row
                  key={o.id}
                  title={o.code}
                  meta={o.last_error ?? ""}
                  to={`/orders/${o.id}`}
                  action={L("查看", "View")}
                />
              ))}
              {stuck.length > 0 && (
                <p className="text-[11px] text-muted-foreground px-1 pt-1">
                  {L("这些 TikTok 订单的商品对不上 Bossify 的产品。到产品页同步 TikTok 商品，或把产品名字改成和 TikTok 一样，下次同步就会完成。", "These TikTok orders have products Bossify can't match. Sync TikTok products on the Products page, or rename the product to match TikTok; the next sync will finish them.")}
                </p>
              )}
            </Group>

            <Group id="out" g={groups[1]}>
              {g.out.map((p) => (
                <Row key={p.id} title={p.name} meta={t("alerts_out_meta").replace("{n}", String(Number(p.stock ?? 0)))} metaClass="text-red-600" to={`/inventory/${p.id}`} action={L("补货", "Restock")} />
              ))}
            </Group>

            <Group id="losing" g={groups[2]}>
              {g.losing.map((p) => {
                const loss = -productUnitContribution(p, feePct);
                return (
                  <Row
                    key={p.id}
                    title={p.name}
                    meta={`${L("每件亏", "Loses")} RM ${loss.toFixed(2)} · ${L("售价", "price")} RM ${Number(p.price ?? 0).toFixed(2)} · ${L("成本", "cost")} RM ${Number(p.cost_price ?? 0).toFixed(2)}${Number(p.packaging_cost ?? 0) > 0 ? ` + ${L("包装", "packaging")} RM ${Number(p.packaging_cost).toFixed(2)}` : ""}`}
                    metaClass="text-red-600"
                    onAction={() => openCost(p)}
                    action={L("改成本", "Edit cost")}
                    actionIcon
                  />
                );
              })}
            </Group>

            <Group id="unpaid" g={groups[3]}>
              {unpaid.map((o) => (
                <Row
                  key={o.id}
                  title={`${o.customer_name} · ${o.code}`}
                  meta={`RM ${Number(o.amount ?? 0).toFixed(2)} · ${L(`${days(o.created_at)} 天前`, `${days(o.created_at)}d ago`)}`}
                  to={`/orders/${o.id}`}
                  action={L("查看", "View")}
                />
              ))}
            </Group>

            <Group id="low" g={groups[4]}>
              {g.low.map((p) => {
                const s = Number(p.stock ?? 0);
                return (
                  <Row
                    key={p.id}
                    title={p.name}
                    meta={t("alerts_low_meta").replace("{n}", String(s)).replace("{thr}", String(lowThreshold))}
                    to={`/inventory/${p.id}`}
                    action={L("补货", "Restock")}
                    bar={Math.min(100, Math.round((s / Math.max(1, lowThreshold)) * 100))}
                  />
                );
              })}
            </Group>

            <Group id="nocost" g={groups[5]}>
              {g.noCost.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  meta={`${L("售价", "Price")} RM ${Number(p.price ?? 0).toFixed(2)}`}
                  onAction={() => openCost(p)}
                  action={L("+ 填成本", "+ Add cost")}
                  actionIcon
                />
              ))}
            </Group>

            <Group id="delisted" g={groups[6]}>
              {g.delisted.map((p) => (
                <Row key={p.id} title={p.name} meta={`${L("库存", "Stock")} ${Number(p.stock ?? 0)}`} to={`/inventory/${p.id}`} action={L("查看", "View")} />
              ))}
            </Group>
          </div>
        </>
      )}

      {costItem && (
        <QuickCostSheet
          item={costItem}
          userId={user?.id ?? ""}
          onClose={() => setCostItem(null)}
          onSaved={() => { setCostItem(null); load(); }}
        />
      )}
    </div>
  );
}

function Group({
  id, g, children,
}: {
  id: string;
  g: { tone: Tone; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; count: number };
  children: React.ReactNode;
}) {
  if (g.count === 0) return null;
  const Icon = g.icon;
  return (
    <section id={`alert-${id}`} className={`scroll-mt-20 rounded-3xl bg-card border shadow-[var(--shadow-card)] p-4 space-y-2 ${TONES[g.tone].ring}`}>
      <div className="flex items-center gap-2.5 pb-1">
        <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${TONES[g.tone].icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">{g.title}</h2>
          <p className="text-[11px] text-muted-foreground truncate">{g.desc}</p>
        </div>
        <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${TONES[g.tone].chip}`}>{g.count}</span>
      </div>
      <ul className="divide-y divide-border/50">{children}</ul>
    </section>
  );
}

function Row({
  title, meta, metaClass, to, onAction, action, actionIcon, bar,
}: {
  title: string;
  meta: string;
  metaClass?: string;
  to?: string;
  onAction?: () => void;
  action: string;
  actionIcon?: boolean;
  bar?: number;
}) {
  const btnClass = "shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary/10 text-primary active:scale-95 transition-transform";
  return (
    <li className="py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        <p className={`text-[11px] truncate ${metaClass ?? "text-muted-foreground"}`}>{meta}</p>
        {bar != null && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
      {to ? (
        <Link to={to as any} className={btnClass}>
          {action} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={btnClass}>
          {actionIcon && <Pencil className="h-3 w-3" />} {action}
        </button>
      )}
    </li>
  );
}
