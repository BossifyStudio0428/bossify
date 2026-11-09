import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

type ItemRow = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_at_sale: number;
  unit_cost_at_sale: number;
  packaging_cost_at_sale: number;
  order_id: string;
};

type ProductStat = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

type VariantStat = ProductStat & { productId: string | null };

type AdjItemRow = {
  product_name: string;
  quantity: number;
  revenue_reversed: number;
  cogs_reversed: number;
};

export const Route = createFileRoute("/product-profit")({ component: ProductProfitPage });

type Range = "week" | "month" | "all";

/** Strips the trailing " (SKU)" suffix tiktok-products-sync.server.ts appends
 *  to variant rows, recovering the parent TikTok product's title so grouped
 *  variants can share one card. Mirrors the same helper in inventory.tsx. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

/** Extracts just the "(SKU)" part of a variant's name for display inside a
 *  grouped card, where the parent title is already shown once above. */
function variantLabel(name: string): string {
  const m = name.match(/\(([^)]*)\)\s*$/);
  return m ? m[1] : name;
}

type StatsEntry =
  | { kind: "single"; stat: VariantStat }
  | {
      kind: "group";
      key: string;
      title: string;
      qty: number;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
      variants: VariantStat[];
    };

function ProductProfitPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [range, setRange] = useState<Range>("month");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [adjItems, setAdjItems] = useState<AdjItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryByProduct, setCategoryByProduct] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [tiktokIdByProduct, setTiktokIdByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const now = new Date();
      let from = new Date(0);
      if (range === "week") { from = new Date(now); from.setDate(from.getDate() - 7); }
      if (range === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); }

      const { data: orders, error: ordErr } = await supabase
        .from("orders" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .neq("financial_status", "pending")
        .gte("created_at", from.toISOString());
      if (ordErr) toast.error(ordErr.message);
      const orderIds = ((orders ?? []) as any[]).map((o) => o.id);

      if (orderIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: rows, error: itemErr } = await supabase
        .from("order_items" as any)
        .select("product_id,product_name,quantity,unit_price_at_sale,unit_cost_at_sale,packaging_cost_at_sale,order_id")
        .in("order_id", orderIds);
      if (itemErr) toast.error(itemErr.message);
      setItems(((rows ?? []) as any) as ItemRow[]);

      const { data: adjRows, error: adjErr } = await supabase
        .from("order_adjustments" as any)
        .select("id,created_at")
        .eq("user_id", user.id)
        .gte("created_at", from.toISOString());
      if (adjErr) toast.error(adjErr.message);
      const adjIds = ((adjRows ?? []) as any[]).map((a) => a.id);
      if (adjIds.length > 0) {
        const { data: adjItemRows } = await supabase
          .from("order_adjustment_items" as any)
          .select("product_name,quantity,revenue_reversed,cogs_reversed")
          .in("adjustment_id", adjIds);
        setAdjItems(((adjItemRows ?? []) as any) as AdjItemRow[]);
      } else {
        setAdjItems([]);
      }

      const { data: invRows } = await supabase.from("inventory").select("id,category,tiktok_product_id").eq("user_id", user.id);
      const catMap: Record<string, string> = {};
      const tidMap: Record<string, string> = {};
      for (const r of ((invRows ?? []) as any[])) {
        catMap[r.id] = r.category || (lang === "zh" ? "未分类" : lang === "ms" ? "Tiada kategori" : "Uncategorized");
        if (r.tiktok_product_id) tidMap[r.id] = r.tiktok_product_id;
      }
      setCategoryByProduct(catMap);
      setTiktokIdByProduct(tidMap);

      setLoading(false);
    })();
  }, [user?.id, range]);

  const stats = useMemo<StatsEntry[]>(() => {
    const map = new Map<string, VariantStat>();
    for (const it of items) {
      if (activeCategory !== "__all" && (it.product_id ? categoryByProduct[it.product_id] : undefined) !== activeCategory) continue;
      const key = it.product_name || "—";
      const qty = Number(it.quantity ?? 0);
      const revenue = Number(it.unit_price_at_sale ?? 0) * qty;
      const cost = (Number(it.unit_cost_at_sale ?? 0) + Number(it.packaging_cost_at_sale ?? 0)) * qty;
      const existing = map.get(key) ?? { name: key, qty: 0, revenue: 0, cost: 0, profit: 0, margin: 0, productId: it.product_id ?? null };
      existing.qty += qty;
      existing.revenue += revenue;
      existing.cost += cost;
      if (!existing.productId && it.product_id) existing.productId = it.product_id;
      map.set(key, existing);
    }
    // Net out refunds/returns, matched by product name — this is what
    // makes each product's profit genuinely accurate, not just a
    // disclaimer that it might be off.
    for (const a of adjItems) {
      const key = a.product_name || "—";
      const existing = map.get(key);
      if (!existing) continue;
      existing.revenue -= Number(a.revenue_reversed ?? 0);
      existing.cost -= Number(a.cogs_reversed ?? 0);
    }
    for (const s of map.values()) {
      s.profit = s.revenue - s.cost;
      s.margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
    }
    const variantStats = Array.from(map.values());

    // Group variants (S/M/L, different colors, etc.) that belong to the
    // same TikTok-synced product — same tiktok_product_id — into one
    // product-level card, with each variant ranked inside by its own
    // profit so the best (and worst) performing size/color is obvious at
    // a glance. Manually-added products, or variants whose parent product
    // was never TikTok-synced, are left exactly as before.
    const byTiktokId = new Map<string, VariantStat[]>();
    for (const v of variantStats) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      if (!tid) continue;
      if (!byTiktokId.has(tid)) byTiktokId.set(tid, []);
      byTiktokId.get(tid)!.push(v);
    }
    const groupedIds = new Set<string>();
    for (const [tid, arr] of byTiktokId) if (arr.length > 1) groupedIds.add(tid);

    const out: StatsEntry[] = [];
    const seen = new Set<string>();
    for (const v of variantStats) {
      const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
      if (tid && groupedIds.has(tid)) {
        if (seen.has(tid)) continue;
        seen.add(tid);
        const vs = byTiktokId.get(tid)!.slice().sort((a, b) => b.profit - a.profit);
        const qty = vs.reduce((s, x) => s + x.qty, 0);
        const revenue = vs.reduce((s, x) => s + x.revenue, 0);
        const cost = vs.reduce((s, x) => s + x.cost, 0);
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        out.push({ kind: "group", key: tid, title: stripVariantSuffix(vs[0].name), qty, revenue, cost, profit, margin, variants: vs });
      } else {
        out.push({ kind: "single", stat: v });
      }
    }

    return out.sort((a, b) => {
      const pa = a.kind === "group" ? a.profit : a.stat.profit;
      const pb = b.kind === "group" ? b.profit : b.stat.profit;
      return pb - pa;
    });
  }, [items, adjItems, activeCategory, categoryByProduct, tiktokIdByProduct]);

  const title = lang === "zh" ? "商品利润分析" : lang === "ms" ? "Analisis Untung Produk" : "Product Profit";

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
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
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${range === r ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
          >
            {r === "week" ? (lang === "zh" ? "本周" : lang === "ms" ? "Minggu ini" : "This week") : r === "month" ? (lang === "zh" ? "本月" : lang === "ms" ? "Bulan ini" : "This month") : (lang === "zh" ? "全部" : lang === "ms" ? "Semua" : "All time")}
          </button>
        ))}
      </div>

      {Object.values(categoryByProduct).length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory("__all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === "__all" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
          >
            {lang === "zh" ? "全部分类" : lang === "ms" ? "Semua kategori" : "All categories"}
          </button>
          {Array.from(new Set(Object.values(categoryByProduct))).map((c) => (
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



      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : stats.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {lang === "zh" ? "这段期间没有销售数据" : lang === "ms" ? "Tiada jualan dalam tempoh ini" : "No sales in this period"}
        </p>
      ) : (
        <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 xl:grid-cols-3 lg:items-start">
          {stats.map((entry) => {
            if (entry.kind === "group") {
              const { key, title, qty, revenue, cost, profit, margin, variants } = entry;
              return (
                <div key={key} className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{title}</p>
                      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {variants.length} {lang === "zh" ? "规格" : lang === "ms" ? "varian" : "variants"}
                      </span>
                    </div>
                    {profit >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{lang === "zh" ? `卖出 ${qty} 件` : lang === "ms" ? `${qty} unit dijual` : `${qty} sold`}</span>
                    <span>{lang === "zh" ? "营收" : lang === "ms" ? "Hasil" : "Revenue"}: RM {revenue.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-bold ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      RM {profit.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{margin.toFixed(1)}% {lang === "zh" ? "利润率" : "margin"}</span>
                  </div>

                  {/* Ranked by profit, best variant first — answers "which
                      size/color is actually doing well" at a glance. */}
                  <div className="rounded-xl bg-muted/30 border border-border/50 divide-y divide-border/50 overflow-hidden">
                    {variants.map((v, i) => (
                      <div key={v.name} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-xs font-medium text-foreground truncate flex items-center gap-1 min-w-0">
                          {i === 0 && (
                            <span title={lang === "zh" ? "这个规格最赚" : lang === "ms" ? "Paling untung" : "Top performer"}>🏆</span>
                          )}
                          <span className="truncate">{variantLabel(v.name)}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {lang === "zh" ? `${v.qty} 件` : lang === "ms" ? `${v.qty} unit` : `${v.qty} sold`}
                        </span>
                        <span className={`text-xs font-semibold shrink-0 ${v.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          RM {v.profit.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            const s = entry.stat;
            return (
              <div key={s.name} className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold flex-1 min-w-0 truncate">{s.name}</p>
                  {s.profit >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{lang === "zh" ? `卖出 ${s.qty} 件` : lang === "ms" ? `${s.qty} unit dijual` : `${s.qty} sold`}</span>
                  <span>{lang === "zh" ? "营收" : lang === "ms" ? "Hasil" : "Revenue"}: RM {s.revenue.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-base font-bold ${s.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    RM {s.profit.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.margin.toFixed(1)}% {lang === "zh" ? "利润率" : lang === "ms" ? "margin" : "margin"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}