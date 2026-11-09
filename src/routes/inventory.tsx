import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2, Pencil, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { InvRow } from "@/lib/inventoryTypes";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { logInventoryChange } from "@/lib/inventoryAudit";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { notifySituation } from "@/lib/autoNotify";
import { getNotifMessage } from "@/lib/notifMessages";
import { ProductFormSheet, QtySheet, ConfirmSheet } from "@/components/InventorySheets";
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
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      {lang === "zh" ? "TikTok 已下架" : lang === "ms" ? "Dinyahsenarai di TikTok" : "Delisted on TikTok"}
    </span>
  );
}

function ProfitRow({
  price,
  cost,
  t,
}: {
  price: number | null | undefined;
  cost: number | null | undefined;
  t: (k: any) => string;
}) {
  const p = Number(price ?? 0);
  const c = Number(cost ?? 0);
  const hasCost = cost != null && !Number.isNaN(Number(cost)) && Number(cost) > 0;
  const profit = p - c;
  const positive = profit > 0;
  const negative = profit < 0;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 border border-border/50 px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_price_label")}</p>
        <p className="text-xs font-semibold text-foreground truncate">RM {p.toFixed(2)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_cost_label")}</p>
        <p className="text-xs font-semibold text-foreground truncate">
          {hasCost ? `RM ${c.toFixed(2)}` : "—"}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{t("inv_profit_label")}</p>
        <p
          className={`text-xs font-bold truncate ${
            !hasCost
              ? "text-muted-foreground"
              : negative
                ? "text-red-400"
                : positive
                  ? "text-emerald-400"
                  : "text-foreground"
          }`}
        >
          {hasCost ? `RM ${profit.toFixed(2)}` : t("inv_no_cost")}
        </p>
      </div>
    </div>
  );
}

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: InvRow }
  | { kind: "restock"; item: InvRow }
  | { kind: "remove"; item: InvRow }
  | { kind: "delete"; item: InvRow };

function InventoryPage() {
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const { hasFullAccess, showUpgrade, productsUsed, productsLimit } = useSubscription();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [items, setItems] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [showStock, setShowStock] = useState<boolean>(true);
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);
  const [tiktokConnected, setTiktokConnected] = useState(false);
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
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("stock_updated"));
      if (user) logInventoryChange({ userId: user.id, productId: it.id, productName: it.name, fieldName: "stock", oldValue: it.stock, newValue: next, source: "products_tab_adjust" });
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
    return matchesSearch && matchesCategory;
  });
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
            className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition"
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

      {tiktokConnected && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={tiktokImporting}
              onClick={() => importFromTikTok(false)}
              className="flex-1 py-2.5 rounded-xl bg-card border border-border/60 text-xs font-semibold active:scale-95 disabled:opacity-60"
            >
              {tiktokImporting
                ? (lang === "zh" ? "同步中…" : lang === "ms" ? "Menyegerak…" : "Syncing…")
                : `🎵 ${lang === "zh" ? "同步 TikTok 商品" : lang === "ms" ? "Segerak produk TikTok" : "Sync TikTok products"}`}
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
            <p className="text-xs font-semibold">📦 {t("pof_show_stock_label")}</p>
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

      {lowItems.length > 0 && (
        <button
          onClick={() => firstLowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="w-full text-left rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2 active:scale-[0.99] transition-transform"
        >
          <span className="text-base leading-tight">⚠️</span>
          <p className="text-xs text-amber-300 leading-snug">
            <span className="font-semibold">{lowItems.length} {t("low_stock_alert")}</span> — {t("restock_before")}
          </p>
        </button>
      )}

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_products")}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

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

      <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3 lg:items-start">
        {loading && (
          <div className="flex justify-center py-10 lg:col-span-full">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4 lg:col-span-full">{t("no_products_create")}</p>
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
                        <img src={coverImage} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
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
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 shrink-0">
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
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
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
                        <ProfitRow price={v.price} cost={(v as any).cost_price} t={t} />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSheet({ kind: "remove", item: v })}
                            className="py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold active:scale-[0.98] transition-transform"
                          >
                            – {t("remove")}
                          </button>
                          <button
                            onClick={() => setSheet({ kind: "restock", item: v })}
                            className="py-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-xs font-semibold active:scale-[0.98] transition-transform"
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
                      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                    {it.category && (
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {formatCategory(it.category, t)}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5">
                  {!!(it as any).tiktok_delisted_at && <DelistedBadge lang={lang} />}
                  {low && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
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
              <ProfitRow price={it.price} cost={(it as any).cost_price} t={t} />
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${low ? "bg-red-500" : "bg-gradient-to-r from-primary to-primary/70"}`}
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
                  className="py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
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
        className={`fixed fab-above-nav left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full text-primary-foreground font-semibold shadow-[var(--shadow-soft)] flex items-center gap-2 active:scale-[0.98] transition-transform lg:hidden ${atLimit ? "bg-muted-foreground/60" : "bg-gradient-to-br from-primary to-primary/80"}`}
      >
        {atLimit ? <span className="text-base">🔒</span> : <Plus className="h-5 w-5" strokeWidth={2.5} />}
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