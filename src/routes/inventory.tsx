import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2, Pencil, ImageIcon, RefreshCw, Package, AlertTriangle, Search, Lock, XCircle, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { InvRow } from "@/lib/inventoryTypes";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { logInventoryChange } from "@/lib/inventoryAudit";
import { adjustStockAtomic } from "@/lib/inventoryStock";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { notifySituation } from "@/lib/autoNotify";
import { getNotifMessage } from "@/lib/notifMessages";
import { ProductFormSheet, QtySheet, ConfirmSheet } from "@/components/InventorySheets";
import { QuickCostSheet } from "@/components/QuickCostEditor";
import { StockTabs } from "@/components/StockTabs";
import { formatUnit, formatCategory } from "@/lib/labels";
import { HIDE_ORDER_FORM } from "@/lib/featureFlags";

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

function timeAgo(iso: string | null, lang: string): string {
  if (!iso) return lang === "zh" ? "从未同步" : lang === "ms" ? "Belum pernah disegerak" : "Never synced";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return lang === "zh" ? "刚刚" : lang === "ms" ? "Baru sahaja" : "Just now";
  if (mins < 60) return lang === "zh" ? `${mins} 分钟前` : lang === "ms" ? `${mins} minit lalu` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return lang === "zh" ? `${hrs} 小时前` : lang === "ms" ? `${hrs} jam lalu` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return lang === "zh" ? `${days} 天前` : lang === "ms" ? `${days} hari lalu` : `${days}d ago`;
}

/** Strips the trailing " (SKU)" suffix tiktok-products-sync.server.ts appends
 *  to variant rows, recovering the parent TikTok product's title for the
 *  grouped-card header. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

/** Extracts just the "(SKU)" part of a variant row's name for display inside
 *  a grouped card, where the parent title is already shown once above. */
function variantLabel(name: string): string {
  const m = name.match(/\(([^)]*)\)\s*$/);
  return m ? m[1] : name;
}

/** Badge shown on an inventory row whose tiktok_delisted_at is set — the
 *  product was removed/deactivated on TikTok's side. Row is never hidden
 *  or deleted automatically (per John's call, 2026-10) so this is the only
 *  signal the seller gets; they decide whether to delete it themselves. */
function DelistedBadge({ lang }: { lang: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 border border-rose-300">
      <AlertTriangle className="h-3 w-3" />
      {lang === "zh" ? "TikTok 已下架" : lang === "ms" ? "Dinyahsenarai di TikTok" : "Delisted on TikTok"}
    </span>
  );
}

/** Where a product row came from: pulled in by the TikTok product sync
 *  (tiktok_product_id is set) or added by the seller by hand. Shown on every
 *  product so it's obvious whose stock the TikTok sync will touch. */
function SourceBadge({ item, lang }: { item: unknown; lang: string }) {
  const fromTikTok = !!(item as any)?.tiktok_product_id;
  return fromTikTok ? (
    <span className="shrink-0 inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-black text-white">
      TikTok
    </span>
  ) : (
    <span className="shrink-0 inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
      {lang === "zh" ? "手动添加" : lang === "ms" ? "Tambah manual" : "Manual"}
    </span>
  );
}

function ProfitRow({
  price,
  cost,
  t,
  lang,
  onEditCost,
}: {
  price: number | null | undefined;
  cost: number | null | undefined;
  t: (k: any) => string;
  lang?: string;
  /** Tapping the row opens the quick cost editor (no need for the full form). */
  onEditCost?: () => void;
}) {
  const p = Number(price ?? 0);
  const c = Number(cost ?? 0);
  const hasCost = cost != null && !Number.isNaN(Number(cost)) && Number(cost) > 0;
  const profit = p - c;
  const positive = profit > 0;
  const negative = profit < 0;
  const Wrapper = onEditCost ? "button" : "div";
  return (
    <Wrapper
      {...(onEditCost ? { type: "button" as const, onClick: onEditCost } : {})}
      className={`w-full text-left grid grid-cols-3 gap-2 rounded-xl border px-2.5 py-2 ${
        onEditCost && !hasCost
          ? "bg-amber-500/10 border-amber-300 active:bg-amber-500/20"
          : "bg-muted/40 border-border/50" + (onEditCost ? " active:bg-muted" : "")
      }`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_price_label")}</p>
        <p className="text-xs font-semibold text-foreground truncate">RM {p.toFixed(2)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_cost_label")}</p>
        <p className={`text-xs font-semibold truncate ${!hasCost && onEditCost ? "text-amber-700" : "text-foreground"}`}>
          {hasCost
            ? <>RM {c.toFixed(2)}{onEditCost && <Pencil className="inline-block h-3 w-3 ml-1 -mt-0.5 text-muted-foreground" />}</>
            : onEditCost
              ? (lang === "zh" ? "+ 填成本" : lang === "ms" ? "+ Isi kos" : "+ Add cost")
              : "—"}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_profit_label")}</p>
        <p
          className={`text-xs font-bold truncate ${
            !hasCost
              ? "text-muted-foreground"
              : negative
                ? "text-red-600"
                : positive
                  ? "text-emerald-600"
                  : "text-foreground"
          }`}
        >
          {hasCost ? `RM ${profit.toFixed(2)}` : t("inv_no_cost")}
        </p>
      </div>
    </Wrapper>
  );
}

function InvKpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "amber" | "red";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-700",
    red: "bg-red-500/10 text-red-600",
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

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: InvRow }
  | { kind: "restock"; item: InvRow }
  | { kind: "remove"; item: InvRow }
  | { kind: "delete"; item: InvRow }
  | { kind: "cost"; item: InvRow };

function InventoryPage() {
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const { hasFullAccess, showUpgrade, productsUsed, productsLimit } = useSubscription();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [healthFilter, setHealthFilter] = useState<"all" | "profitable" | "low_profit" | "loss_making" | "low_stock" | "out_of_stock" | "delisted">("all");
  const [items, setItems] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [showStock, setShowStock] = useState<boolean>(true);
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  // Show only TikTok-synced products, only manually added ones, or both.
  const [sourceFilter, setSourceFilter] = useState<"all" | "tiktok" | "manual">("all");
  const [tiktokLastSynced, setTiktokLastSynced] = useState<string | null>(null);
  const [tiktokImporting, setTiktokImporting] = useState(false);
  const [tiktokMsg, setTiktokMsg] = useState<string | null>(null);
  const firstLowRef = useRef<HTMLElement | null>(null);

  const importFromTikTok = async (silent: boolean) => {
    setTiktokImporting(true);
    if (!silent) setTiktokMsg(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("https://tanstack-start-app.bossifystudio.workers.dev/api/platforms/tiktok/sync-products", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Import failed");
      if (user) {
        const { data: refreshed } = await supabase
          .from("platform_connections" as any)
          .select("last_synced_at")
          .eq("user_id", user.id)
          .eq("platform", "tiktok")
          .maybeSingle();
        setTiktokLastSynced((refreshed as any)?.last_synced_at ?? null);
      }
      const importedCount = (j.imported ?? []).length;
      const refreshedCount = Number(j.refreshed ?? 0);
      const delistedCount = Number(j.delisted ?? 0);
      // Delisted-on-TikTok is surfaced regardless of `silent`, same as a
      // new import — this is something the seller needs to notice even on
      // a background auto-sync, not just a manual tap.
      if (!silent || importedCount > 0 || delistedCount > 0) {
        const parts: string[] = [];
        if (importedCount > 0) {
          parts.push(lang === "zh" ? `${importedCount} 个新商品已导入，记得填成本价` : lang === "ms" ? `${importedCount} produk baru diimport` : `${importedCount} new product(s) imported`);
        }
        if (delistedCount > 0) {
          parts.push(lang === "zh" ? `${delistedCount} 个商品在 TikTok 已下架` : lang === "ms" ? `${delistedCount} produk telah dinyahsenarai di TikTok` : `${delistedCount} product(s) delisted on TikTok`);
        }
        if (parts.length === 0) {
          parts.push(
            refreshedCount > 0
              ? (lang === "zh" ? `已更新 ${refreshedCount} 个商品的价格/库存` : lang === "ms" ? `${refreshedCount} produk dikemas kini` : `${refreshedCount} product(s) refreshed`)
              : (lang === "zh" ? "已是最新" : lang === "ms" ? "Sudah terkini" : "Already up to date"),
          );
        }
        setTiktokMsg(parts.join(" · "));
        setTimeout(() => setTiktokMsg(null), 5000);
      }
      // Always reload the on-screen list after a sync attempt, not just
      // when something was newly imported/linked — otherwise a routine
      // re-sync that only refreshes an already-linked product's price/
      // stock (the common case) writes the new numbers to the database
      // but the screen keeps showing what it had before the sync, making
      // the sync look like it isn't doing anything.
      load();
    } catch (err: any) {
      if (!silent) {
        setTiktokMsg(err?.message || "Import failed");
        setTimeout(() => setTiktokMsg(null), 4000);
      }
    } finally {
      setTiktokImporting(false);
    }
  };

  const load = async () => {
    const { data, error } = await supabase.from("inventory").select("*").order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as unknown as InvRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then((p) => setLowThreshold(p.low_stock_threshold)).catch(() => undefined);
  }, [user?.id]);

  // Check whether TikTok Shop is connected; if so, quietly refresh the
  // product catalog on page load (throttled to once every 2 minutes so
  // repeated visits don't hammer the TikTok API).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("platform_connections" as any)
        .select("status,last_synced_at")
        .eq("user_id", user.id)
        .eq("platform", "tiktok")
        .maybeSingle();
      const isConnected = (data as any)?.status === "active";
      setTiktokConnected(isConnected);
      setTiktokLastSynced((data as any)?.last_synced_at ?? null);
      if (!isConnected) return;
      const key = "bossify_tiktok_products_last_auto_sync";
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last > 2 * 60 * 1000) {
        sessionStorage.setItem(key, String(Date.now()));
        importFromTikTok(true);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("order_form_show_stock" as any)
        .eq("id", user.id)
        .maybeSingle();
      setShowStock(((data as any)?.order_form_show_stock as boolean) ?? true);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("inv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const adjust = async (it: InvRow, next: number) => {
    const prev = items;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: next } : x)));
    // Send the CHANGE, not the new total, so a simultaneous edit from
    // another device isn't overwritten.
    const res = await adjustStockAtomic(it.id, next - Number(it.stock ?? 0));
    if (res.error || res.stock === null) {
      setItems(prev);
      toast.error(res.error ?? "Failed");
    } else {
      const saved = res.stock;
      if (saved !== next) setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: saved } : x)));
      toast.success(t("stock_updated"));
      if (user) logInventoryChange({ userId: user.id, productId: it.id, productName: it.name, fieldName: "stock", oldValue: it.stock, newValue: saved, source: "products_tab_adjust" });
      if (next <= 5 && next < it.stock) {
        const m = getNotifMessage("low_stock", bizType, lang, {
          product: it.name,
          quantity: next,
        });
        notifySituation({
          kind: "low_stock",
          title: m.title,
          body: m.body,
          link: "/inventory",
          prefKey: "notif_inventory",
          dedupeKey: `stock_${it.id}_${next}`,
        }).catch(() => {});
      }
    }
  };

  const handleDelete = async (it: InvRow) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("inventory").delete().eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("product_deleted"));
    }
    setSheet({ kind: "none" });
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.category) set.add(it.category);
    return Array.from(set).sort();
  }, [items]);

  const visible = items.filter((i) => {
    const matchesSearch = i.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = activeCategory === "__all" || (i.category ?? "") === activeCategory;
    const fromTikTok = !!(i as any).tiktok_product_id;
    const matchesSource = sourceFilter === "all" || (sourceFilter === "tiktok" ? fromTikTok : !fromTikTok);
    return matchesSearch && matchesCategory && matchesSource;
  });
  const tiktokItemCount = items.filter((i) => !!(i as any).tiktok_product_id).length;
  const lowItems = items.filter((i) => i.stock <= lowThreshold);
  const atLimit = !hasFullAccess && productsUsed >= productsLimit;

  // Group TikTok-synced variant rows (same product, different size/color —
  // each SKU is its own inventory row but they share tiktok_product_id)
  // into one card instead of listing them as separate, disconnected
  // products. Manually-added products (no tiktok_product_id) are untouched.
  type GroupedEntry =
    | { kind: "single"; item: InvRow }
    | { kind: "group"; key: string; title: string; items: InvRow[] };

  const grouped = useMemo<GroupedEntry[]>(() => {
    const byTiktokId = new Map<string, InvRow[]>();
    for (const it of visible) {
      const tid = (it as any).tiktok_product_id as string | null | undefined;
      if (!tid) continue;
      if (!byTiktokId.has(tid)) byTiktokId.set(tid, []);
      byTiktokId.get(tid)!.push(it);
    }
    const groupedIds = new Set<string>();
    for (const [tid, arr] of byTiktokId) if (arr.length > 1) groupedIds.add(tid);

    const out: GroupedEntry[] = [];
    const seen = new Set<string>();
    for (const it of visible) {
      const tid = (it as any).tiktok_product_id as string | null | undefined;
      if (tid && groupedIds.has(tid)) {
        if (seen.has(tid)) continue;
        seen.add(tid);
        const groupItems = byTiktokId.get(tid)!;
        out.push({ kind: "group", key: tid, title: stripVariantSuffix(groupItems[0].name), items: groupItems });
      } else {
        out.push({ kind: "single", item: it });
      }
    }
    return out;
  }, [visible]);

  // Desktop KPI row + health filter — profit margin is per-unit (price vs
  // cost_price), not tied to actual sales (this file has no order data).
  const marginOf = (it: InvRow): number | null => {
    const price = Number(it.price ?? 0);
    const cost = Number((it as any).cost_price ?? 0);
    if (price <= 0) return null;
    return ((price - cost) / price) * 100;
  };
  const totalProducts = items.length;
  const outOfStockCount = items.filter((i) => i.stock <= 0).length;
  const lowStockOnlyCount = items.filter((i) => i.stock > 0 && i.stock <= lowThreshold).length;
  const lossMakingCount = items.filter((i) => {
    const m = marginOf(i);
    return m !== null && m <= 0;
  }).length;
  const delistedCount = items.filter((i) => !!(i as any).tiktok_delisted_at).length;

  const matchesHealth = (it: InvRow) => {
    if (healthFilter === "all") return true;
    if (healthFilter === "low_stock") return it.stock > 0 && it.stock <= lowThreshold;
    if (healthFilter === "out_of_stock") return it.stock <= 0;
    if (healthFilter === "delisted") return !!(it as any).tiktok_delisted_at;
    const m = marginOf(it);
    if (healthFilter === "loss_making") return m !== null && m <= 0;
    if (healthFilter === "low_profit") return m !== null && m > 0 && m <= 20;
    if (healthFilter === "profitable") return m !== null && m > 20;
    return true;
  };
  // Desktop table shows one flat row per SKU (no variant grouping) filtered
  // by the same search + category state as mobile, plus the desktop-only
  // health filter.
  const desktopVisible = visible.filter(matchesHealth);

  return (
    <div className="px-5 pt-10 pb-4 space-y-5 relative lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t(bizKey(bizType, "inventory"))}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length} {t("items")}
        </span>
        {!hasFullAccess && (
          <Link
            to="/plans"
            className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 active:scale-95 transition"
          >
            Free plan {productsUsed}/{productsLimit}
          </Link>
        )}
        {/* Desktop: same add-product action as the mobile FAB below
            (which hides on desktop), reusing the same handler — no
            second form sheet, just a differently-placed trigger. */}
        <button
          onClick={() => (atLimit ? showUpgrade(t("limit_inventory")) : setSheet({ kind: "form" }))}
          className="hidden lg:inline-flex ml-auto items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t("add_product")}
        </button>
      </header>

      {/* Desktop-only KPI row */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
        <InvKpiCard
          icon={Package}
          label={lang === "zh" ? "总商品数" : lang === "ms" ? "Jumlah Produk" : "Total Products"}
          value={String(totalProducts)}
        />
        <InvKpiCard
          icon={AlertTriangle}
          label={lang === "zh" ? "库存低" : lang === "ms" ? "Stok Rendah" : "Low Stock"}
          value={String(lowStockOnlyCount)}
          tone="amber"
        />
        <InvKpiCard
          icon={XCircle}
          label={lang === "zh" ? "断货" : lang === "ms" ? "Kehabisan Stok" : "Out of Stock"}
          value={String(outOfStockCount)}
          tone="red"
        />
        <InvKpiCard
          icon={TrendingDown}
          label={lang === "zh" ? "亏本商品" : lang === "ms" ? "Produk Rugi" : "Loss-Making"}
          value={String(lossMakingCount)}
          tone="red"
        />
      </div>

      {tiktokConnected && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={tiktokImporting}
              onClick={() => importFromTikTok(false)}
              className="flex-1 py-2.5 rounded-xl bg-card border border-border/60 text-xs font-semibold active:scale-95 disabled:opacity-60 transition-transform"
            >
              {tiktokImporting ? (
                lang === "zh" ? "同步中…" : lang === "ms" ? "Menyegerak…" : "Syncing…"
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {lang === "zh" ? "同步 TikTok 商品" : lang === "ms" ? "Segerak produk TikTok" : "Sync TikTok products"}
                </span>
              )}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            {tiktokMsg ?? `${lang === "zh" ? "上次同步：" : lang === "ms" ? "Segerak terakhir: " : "Last synced: "}${timeAgo(tiktokLastSynced, lang)}`}
          </p>
        </div>
      )}

      {(bizType === "retail" || bizType === "fnb") && <StockTabs active="products" />}

      {!HIDE_ORDER_FORM && (bizType === "retail" || bizType === "fnb") && (
        <div className="flex items-center justify-between rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-3 py-2">
          <div className="min-w-0 pr-3">
            <p className="text-xs font-semibold flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> {t("pof_show_stock_label")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("pof_show_stock_sub")}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!user) return;
              const next = !showStock;
              setShowStock(next);
              const { error } = await supabase
                .from("profiles")
                .update({ order_form_show_stock: next } as any)
                .eq("id", user.id);
              if (error) {
                setShowStock(!next);
                toast.error(error.message);
              }
            }}
            role="switch"
            aria-checked={showStock}
            className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${showStock ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${showStock ? "translate-x-5" : ""}`}
            />
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (() => {
        const outCount = items.filter((i) => i.stock <= 0).length;
        const lowCount = items.filter((i) => i.stock > 0 && i.stock <= lowThreshold).length;
        const healthyCount = items.filter((i) => i.stock > lowThreshold).length;
        const total = Math.max(1, outCount + lowCount + healthyCount);
        const segs = [
          { key: "healthy", count: healthyCount, color: "bg-emerald-500", label: lang === "zh" ? "\u5e93\u5b58\u5145\u8db3" : lang === "ms" ? "Sihat" : "Healthy" },
          { key: "low", count: lowCount, color: "bg-amber-500", label: lang === "zh" ? "\u5e93\u5b58\u4f4e" : lang === "ms" ? "Rendah" : "Low" },
          { key: "out", count: outCount, color: "bg-red-500", label: lang === "zh" ? "\u65ad\u8d27" : lang === "ms" ? "Kehabisan" : "Out of stock" },
        ].filter((s) => s.count > 0);
        return (
          <div className="lg:hidden rounded-2xl bg-card border border-border/60 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {lang === "zh" ? "\u5e93\u5b58\u5065\u5eb7\u5ea6" : lang === "ms" ? "Kesihatan Inventori" : "Inventory health"}
            </p>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted">
              {segs.map((s) => (
                <div key={s.key} className={s.color} style={{ width: `${(s.count / total) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {segs.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${s.color}`} />
                  {s.label} ({s.count})
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {lowItems.length > 0 && (
        <button
          onClick={() => firstLowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="lg:hidden w-full text-left rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2 active:scale-[0.99] transition-transform"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-snug">
            <span className="font-semibold">{lowItems.length} {t("low_stock_alert")}</span> — {t("restock_before")}
          </p>
        </button>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_products")}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      {/* Source filter — only worth showing once there is a mix to tell apart */}
      {tiktokItemCount > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          {(
            [
              { k: "all", label: `${lang === "zh" ? "全部来源" : lang === "ms" ? "Semua sumber" : "All sources"} (${items.length})` },
              { k: "tiktok", label: `TikTok (${tiktokItemCount})` },
              { k: "manual", label: `${lang === "zh" ? "手动添加" : lang === "ms" ? "Tambah manual" : "Manual"} (${items.length - tiktokItemCount})` },
            ] as const
          ).map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setSourceFilter(f.k)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                sourceFilter === f.k
                  ? f.k === "tiktok"
                    ? "bg-black text-white border-black"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveCategory("__all")}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              activeCategory === "__all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            {t("all")}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                activeCategory === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border"
              }`}
            >
              {formatCategory(c, t)}
            </button>
          ))}
        </div>
      )}

      {/* Desktop-only health/profit filter chips */}
      <div className="hidden lg:flex lg:gap-2 lg:flex-wrap">
        {(
          [
            { k: "all", label: lang === "zh" ? "全部" : lang === "ms" ? "Semua" : "All" },
            { k: "profitable", label: lang === "zh" ? "盈利良好" : lang === "ms" ? "Menguntungkan" : "Profitable" },
            { k: "low_profit", label: lang === "zh" ? "低利润" : lang === "ms" ? "Untung Rendah" : "Low Profit" },
            { k: "loss_making", label: lang === "zh" ? "亏本" : lang === "ms" ? "Rugi" : "Loss-Making" },
            { k: "low_stock", label: lang === "zh" ? "库存低" : lang === "ms" ? "Stok Rendah" : "Low Stock" },
            { k: "out_of_stock", label: lang === "zh" ? "断货" : lang === "ms" ? "Kehabisan" : "Out of Stock" },
            {
              k: "delisted",
              label: `${lang === "zh" ? "TikTok 已下架" : lang === "ms" ? "Dinyahsenarai di TikTok" : "Delisted on TikTok"}${
                delistedCount > 0 ? ` (${delistedCount})` : ""
              }`,
            },
          ] as const
        ).map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setHealthFilter(f.k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              healthFilter === f.k
                ? f.k === "delisted"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-primary text-primary-foreground border-primary"
                : f.k === "delisted" && delistedCount > 0
                  ? "bg-rose-500/10 text-rose-700 border-rose-300"
                  : "bg-card text-foreground border-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="lg:hidden space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_products_create")}</p>
        )}
        {!loading && items.length > 0 && grouped.map((entry, idx) => {
          if (entry.kind === "group") {
            const { key, title, items: groupItems } = entry;
            const prices = groupItems.map((g) => Number(g.price ?? 0)).filter((p) => p > 0);
            const minPrice = prices.length ? Math.min(...prices) : 0;
            const anyLow = groupItems.some((g) => g.stock <= lowThreshold);
            const isFirstLowGroup = anyLow && !!lowItems[0] && groupItems.some((g) => g.id === lowItems[0].id);
            const coverImage = groupItems.find((g) => g.image_url)?.image_url;
            return (
              <article
                key={key}
                id={idx === 0 ? "tour-inv-card" : undefined}
                ref={isFirstLowGroup ? (el) => { firstLowRef.current = el; } : undefined}
                className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-12 w-12 shrink-0 rounded-xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center">
                      {coverImage ? (
                        <img src={coverImage} alt={title} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <SourceBadge item={groupItems[0]} lang={lang} />
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {groupItems.length} {lang === "zh" ? "个规格" : lang === "ms" ? "varian" : "variants"}
                        </span>
                        {minPrice > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {lang === "zh" ? "起 " : lang === "ms" ? "dari " : "from "}RM {minPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {anyLow && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 shrink-0">
                      {t("low_stock_badge")}
                    </span>
                  )}
                </div>

                <div className="rounded-xl bg-muted/30 border border-border/50 divide-y divide-border/50 overflow-hidden">
                  {groupItems.map((v) => {
                    const vLow = v.stock <= lowThreshold;
                    const label = variantLabel(v.name);
                    return (
                      <div key={v.id} className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to="/inventory/$itemId"
                            params={{ itemId: v.id }}
                            className="flex-1 min-w-0 active:opacity-70 transition"
                          >
                            <p className="text-sm font-semibold text-foreground truncate">{label}</p>
                          </Link>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!!(v as any).tiktok_delisted_at && <DelistedBadge lang={lang} />}
                            {vLow && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">
                                {t("low_stock_badge")}
                              </span>
                            )}
                            <button
                              onClick={() => setSheet({ kind: "form", item: v })}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                              aria-label={t("edit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setSheet({ kind: "delete", item: v })}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                              aria-label={t("delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-lg font-bold ${vLow ? "text-red-500" : "text-foreground"}`}>{v.stock}</span>
                          <span className="text-xs text-muted-foreground">{formatUnit(v.unit, t)} {t("left")}</span>
                          {v.price ? (
                            <span className="ml-auto text-xs font-semibold text-primary">
                              RM {Number(v.price).toFixed(2)}
                            </span>
                          ) : null}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${vLow ? "bg-red-500" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, Math.round((v.stock / Math.max(1, v.max_stock)) * 100))}%` }}
                          />
                        </div>
                        <ProfitRow price={v.price} cost={(v as any).cost_price} t={t} lang={lang} onEditCost={() => setSheet({ kind: "cost", item: v })} />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSheet({ kind: "remove", item: v })}
                            className="py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold active:scale-[0.98] transition-transform"
                          >
                            – {t("remove")}
                          </button>
                          <button
                            onClick={() => setSheet({ kind: "restock", item: v })}
                            className="py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-[0.98] transition-transform"
                          >
                            + {t("restock")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          }

          const it = entry.item;
          const low = it.stock <= lowThreshold;
          const pct = Math.min(100, Math.round((it.stock / Math.max(1, it.max_stock)) * 100));
          const isFirstLow = low && lowItems[0]?.id === it.id;
          return (
            <article
              key={it.id}
              id={idx === 0 ? "tour-inv-card" : undefined}
              ref={isFirstLow ? (el) => { firstLowRef.current = el; } : undefined}
              className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to="/inventory/$itemId"
                  params={{ itemId: it.id }}
                  className="flex items-start gap-3 flex-1 min-w-0 active:opacity-70 transition"
                >
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SourceBadge item={it} lang={lang} />
                      {it.category && (
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {formatCategory(it.category, t)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1.5">
                  {!!(it as any).tiktok_delisted_at && <DelistedBadge lang={lang} />}
                  {low && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">
                      {t("low_stock_badge")}
                    </span>
                  )}
                  <button
                    onClick={() => setSheet({ kind: "form", item: it })}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                    aria-label={t("edit")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setSheet({ kind: "delete", item: it })}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                    aria-label={t("delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold ${low ? "text-red-500" : "text-foreground"}`}>{it.stock}</span>
                <span className="text-xs text-muted-foreground">{formatUnit(it.unit, t)} {t("left")}</span>
                {it.price ? (
                  <span className="ml-auto text-xs font-semibold text-primary">
                    RM {Number(it.price).toFixed(2)}<span className="text-muted-foreground font-normal"> / {formatUnit(it.unit, t)}</span>
                  </span>
                ) : null}
              </div>
              <ProfitRow price={it.price} cost={(it as any).cost_price} t={t} lang={lang} onEditCost={() => setSheet({ kind: "cost", item: it })} />
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${low ? "bg-red-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setSheet({ kind: "remove", item: it })}
                  className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  – {t("remove")}
                </button>
                <button
                  onClick={() => setSheet({ kind: "restock", item: it })}
                  className="py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
                >
                  + {t("restock")}
                </button>
              </div>
            </article>
          );
        })}
        {!loading && items.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_products")}</p>
        )}
      </div>

      {/* Desktop: products table */}
      <div className="hidden lg:block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{lang === "zh" ? "商品" : lang === "ms" ? "Produk" : "Product"}</th>
              <th className="px-4 py-3">{lang === "zh" ? "分类" : lang === "ms" ? "Kategori" : "Category"}</th>
              <th className="px-4 py-3 text-right">{t("inv_price_label")}</th>
              <th className="px-4 py-3 text-right">{t("inv_cost_label")}</th>
              <th className="px-4 py-3 text-right">{t("inv_profit_label")}</th>
              <th className="px-4 py-3 text-right">{lang === "zh" ? "毛利率" : lang === "ms" ? "Margin" : "Margin"}</th>
              <th className="px-4 py-3 text-right">{lang === "zh" ? "库存" : lang === "ms" ? "Stok" : "Stock"}</th>
              <th className="px-4 py-3">{lang === "zh" ? "状态" : lang === "ms" ? "Status" : "Status"}</th>
              <th className="px-4 py-3 text-right">{lang === "zh" ? "操作" : lang === "ms" ? "Tindakan" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {!loading && desktopVisible.map((it) => {
              const price = Number(it.price ?? 0);
              const cost = Number((it as any).cost_price ?? 0);
              const hasCost = (it as any).cost_price != null && cost > 0;
              const profit = price - cost;
              const margin = marginOf(it);
              const low = it.stock > 0 && it.stock <= lowThreshold;
              const out = it.stock <= 0;
              const statusLabel = out
                ? (lang === "zh" ? "断货" : lang === "ms" ? "Kehabisan" : "Out of stock")
                : low
                  ? (lang === "zh" ? "库存低" : lang === "ms" ? "Rendah" : "Low stock")
                  : (lang === "zh" ? "健康" : lang === "ms" ? "Sihat" : "Healthy");
              const statusCls = out
                ? "bg-red-500/15 text-red-600"
                : low
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-emerald-500/15 text-emerald-700";
              return (
                <tr key={it.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link to="/inventory/$itemId" params={{ itemId: it.id }} className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center">
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.name} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <span className="font-semibold text-foreground truncate">{it.name}</span>
                      <SourceBadge item={it} lang={lang} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{it.category ? formatCategory(it.category, t) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">RM {price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "cost", item: it })}
                      title={lang === "zh" ? "修改成本" : lang === "ms" ? "Edit kos" : "Edit cost"}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors ${hasCost ? "text-muted-foreground hover:bg-muted" : "font-semibold text-amber-700 bg-amber-500/10 hover:bg-amber-500/20"}`}
                    >
                      {hasCost ? `RM ${cost.toFixed(2)}` : (lang === "zh" ? "+ 填成本" : lang === "ms" ? "+ Isi kos" : "+ Add cost")}
                      {hasCost && <Pencil className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${!hasCost ? "text-muted-foreground" : profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {hasCost ? `RM ${profit.toFixed(2)}` : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${margin === null ? "text-muted-foreground" : margin <= 0 ? "text-red-600" : margin <= 20 ? "text-amber-700" : "text-emerald-600"}`}>
                    {margin === null ? "—" : `${margin.toFixed(0)}%`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={low || out ? "font-bold text-red-500" : "font-semibold text-foreground"}>{it.stock}</span>
                    <span className="text-muted-foreground"> {formatUnit(it.unit, t)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCls}`}>{statusLabel}</span>
                      {!!(it as any).tiktok_delisted_at && <DelistedBadge lang={lang} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSheet({ kind: "remove", item: it })}
                        title={t("remove")}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        – {t("remove")}
                      </button>
                      <button
                        onClick={() => setSheet({ kind: "restock", item: it })}
                        title={t("restock")}
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        + {t("restock")}
                      </button>
                      <button
                        onClick={() => setSheet({ kind: "form", item: it })}
                        title={t("edit")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setSheet({ kind: "delete", item: it })}
                        title={t("delete")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && (items.length === 0 || desktopVisible.length === 0) && (
          <p className="text-center text-sm text-muted-foreground py-10">
            {items.length === 0 ? t("no_products_create") : t("no_products")}
          </p>
        )}
      </div>

      {/*
        Pill style (icon + label), centered above the bottom nav — matches
        the look of the home page's "+ new sale" button per John's request,
        instead of the old icon-only circle. Same onClick/lock logic as
        before, just restyled.
      */}
      <button
        onClick={() => atLimit ? showUpgrade(t("limit_inventory")) : setSheet({ kind: "form" })}
        id="tour-inv-add"
        aria-label={t("add_product")}
        title={atLimit ? t("limit_inventory") : t("add_product")}
        className={`fixed fab-above-nav left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full text-primary-foreground font-semibold shadow-[var(--shadow-soft)] flex items-center gap-2 active:scale-[0.98] transition-transform lg:hidden ${atLimit ? "bg-muted-foreground/60" : "bg-primary"}`}
      >
        {atLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" strokeWidth={2.5} />}
        {t("add_product")}
      </button>

      {sheet.kind === "form" && (
        <ProductFormSheet
          item={sheet.item}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
          userId={user?.id ?? ""}
        />
      )}
      {sheet.kind === "cost" && (
        <QuickCostSheet
          item={sheet.item as any}
          userId={user?.id ?? ""}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
        />
      )}
      {sheet.kind === "restock" && (
        <QtySheet
          title={`${t("restock")} · ${sheet.item.name}`}
          label={t("add_quantity")}
          current={sheet.item.stock}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={(q) => { adjust(sheet.item, sheet.item.stock + q); setSheet({ kind: "none" }); }}
        />
      )}
      {sheet.kind === "remove" && (
        <QtySheet
          title={`${t("remove")} · ${sheet.item.name}`}
          label={t("remove_quantity")}
          current={sheet.item.stock}
          max={sheet.item.stock}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={(q) => {
            if (q > sheet.item.stock) { toast.error(t("cant_remove_more")); return; }
            adjust(sheet.item, sheet.item.stock - q); setSheet({ kind: "none" });
          }}
        />
      )}
      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t("delete_product_confirm")}
          subtitle={sheet.item.name}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
        />
      )}
    </div>
  );
}