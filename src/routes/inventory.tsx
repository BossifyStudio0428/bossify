import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase, type InventoryRow } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

const LOW_THRESHOLD = 10;

function InventoryPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("inventory").select("*").order("name");
    setItems((data ?? []) as InventoryRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const adjust = async (id: string, delta: number) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const next = Math.max(0, it.stock + delta);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, stock: next } : x)));
    await supabase.from("inventory").update({ stock: next }).eq("id", id);
  };

  const visible = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const lowCount = items.filter((i) => i.stock <= LOW_THRESHOLD).length;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("inventory")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length} {t("items")}
        </span>
      </header>

      {lowCount > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <span className="text-base leading-tight">⚠️</span>
          <p className="text-xs text-amber-800 leading-snug">
            <span className="font-semibold">{lowCount} {t("low_stock_alert")}</span> — {t("restock_before")}
          </p>
        </div>
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

      <div className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground py-10">{t("loading")}</p>}
        {!loading && visible.map((it) => {
          const low = it.stock <= LOW_THRESHOLD;
          const pct = Math.min(100, Math.round((it.stock / Math.max(1, it.max_stock)) * 100));
          return (
            <article
              key={it.id}
              className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{it.name}</p>
                {low && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                    LOW STOCK
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold ${low ? "text-red-500" : "text-foreground"}`}>
                  {it.stock}
                </span>
                <span className="text-xs text-muted-foreground">{it.unit} {t("left")}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${low ? "bg-red-500" : "bg-gradient-to-r from-primary to-primary/70"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => adjust(it.id, -1)}
                  className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  – {t("remove")}
                </button>
                <button
                  onClick={() => adjust(it.id, 1)}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform"
                >
                  + {t("restock")}
                </button>
              </div>
            </article>
          );
        })}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_products")}</p>
        )}
      </div>
    </div>
  );
}
