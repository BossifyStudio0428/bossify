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
import { useSubscription } from "@/contexts/SubscriptionContext";
import { notifySituation } from "@/lib/autoNotify";
import { getNotifMessage } from "@/lib/notifMessages";
import { ProductFormSheet, QtySheet, ConfirmSheet } from "@/components/InventorySheets";

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

const LOW_THRESHOLD = 5;

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
  const firstLowRef = useRef<HTMLElement | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("inventory").select("*").order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as unknown as InvRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
  const lowItems = items.filter((i) => i.stock <= LOW_THRESHOLD);
  const atLimit = !hasFullAccess && productsUsed >= productsLimit;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t(bizKey(bizType, "inventory"))}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length} {t("items")}
        </span>
        {!hasFullAccess && (
          <Link
            to="/plans"
            className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95 transition"
          >
            Free plan {productsUsed}/{productsLimit}
          </Link>
        )}
      </header>

      {(bizType === "retail" || bizType === "fnb") && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/suppliers"
            className="flex items-center justify-between rounded-2xl bg-card border border-border/60 p-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>🏭</span>{t("suppliers")}
            </span>
            <span className="text-xs text-muted-foreground">›</span>
          </Link>
          <Link
            to="/stock-take"
            className="flex items-center justify-between rounded-2xl bg-card border border-border/60 p-3 active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>📋</span>{t("stock_take")}
            </span>
            <span className="text-xs text-muted-foreground">›</span>
          </Link>
        </div>
      )}

      {lowItems.length > 0 && (
        <button
          onClick={() => firstLowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="w-full text-left rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 active:scale-[0.99] transition-transform"
        >
          <span className="text-base leading-tight">⚠️</span>
          <p className="text-xs text-amber-800 leading-snug">
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
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_products_create")}</p>
        )}
        {!loading && items.length > 0 && visible.map((it, idx) => {
          const low = it.stock <= LOW_THRESHOLD;
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
                        {it.category}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5">
                  {low && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
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
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                    aria-label={t("delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold ${low ? "text-red-500" : "text-foreground"}`}>{it.stock}</span>
                <span className="text-xs text-muted-foreground">{it.unit} {t("left")}</span>
                {it.price ? (
                  <span className="ml-auto text-xs font-semibold text-primary">
                    RM {Number(it.price).toFixed(2)}<span className="text-muted-foreground font-normal"> / {it.unit}</span>
                  </span>
                ) : null}
              </div>
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

      <button
        onClick={() => atLimit ? showUpgrade(t("limit_inventory")) : setSheet({ kind: "form" })}
        id="tour-inv-add"
        aria-label={t("add_product")}
        title={atLimit ? t("limit_inventory") : t("add_product")}
        className={`fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform ${atLimit ? "bg-muted-foreground/60" : "bg-gradient-to-br from-primary to-primary/80"}`}
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        {atLimit ? <span className="text-base">🔒</span> : <Plus className="h-6 w-6" strokeWidth={2.5} />}
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

