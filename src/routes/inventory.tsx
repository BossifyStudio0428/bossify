import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, X, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase, type InventoryRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription, FREE_LIMITS } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/inventory")({ component: InventoryPage });

const LOW_THRESHOLD = 5;

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: InventoryRow }
  | { kind: "restock"; item: InventoryRow }
  | { kind: "remove"; item: InventoryRow }
  | { kind: "delete"; item: InventoryRow };

function InventoryPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isPro, showUpgrade } = useSubscription();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const firstLowRef = useRef<HTMLElement | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("inventory").select("*").order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as InventoryRow[]);
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

  const adjust = async (it: InventoryRow, next: number) => {
    const prev = items;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: next } : x)));
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("stock_updated"));
      if (next <= 5 && next < it.stock) {
        Promise.all([
          import("@/lib/notifications"),
          import("@/lib/notifPrefs"),
        ]).then(([{ notify }, { isPrefEnabled }]) => {
          if (!isPrefEnabled("notif_inventory")) return;
          const title = next === 0 ? "Out of Stock ❌" : "Low Stock Alert 📦";
          const body = next === 0 ? `${it.name} is sold out. Restock now!` : `${it.name} is running low. Only ${next} left!`;
          return notify(title, body, { route: "/inventory" });
        }).catch(() => {});
      }
    }
  };

  const handleDelete = async (it: InventoryRow) => {
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

  const visible = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const lowItems = items.filter((i) => i.stock <= LOW_THRESHOLD);
  const atLimit = !isPro && items.length >= FREE_LIMITS.inventory;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("inventory")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length} {t("items")}
        </span>
      </header>

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
                <p className="text-sm font-semibold text-foreground flex-1">{it.name}</p>
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

function SheetShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[390px] rounded-t-3xl bg-card text-foreground p-5 pb-8 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ProductFormSheet({
  item, onClose, onSaved, userId,
}: { item?: InventoryRow; onClose: () => void; onSaved: () => void; userId: string }) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [stock, setStock] = useState(item?.stock != null ? String(item.stock) : "");
  const PRESET_UNITS = [
    { value: "pcs", label: t("unit_pieces"), icon: "🔢" },
    { value: "packs", label: t("unit_packs"), icon: "📦" },
    { value: "bottles", label: t("unit_bottles"), icon: "🍶" },
    { value: "jars", label: t("unit_jars"), icon: "🧴" },
    { value: "boxes", label: t("unit_boxes"), icon: "🎁" },
  ];
  const initialUnit = item?.unit ?? "pcs";
  const isPreset = PRESET_UNITS.some((u) => u.value === initialUnit);
  const [unit, setUnit] = useState(isPreset ? initialUnit : "other");
  const [customUnit, setCustomUnit] = useState(isPreset ? "" : initialUnit);
  const [price, setPrice] = useState(item?.price ? String(item.price) : "");
  const [costPrice, setCostPrice] = useState(item?.cost_price ? String(item.cost_price) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    if (!userId) return;
    const finalUnit = unit === "other" ? customUnit.trim() || "pcs" : unit;
    setSaving(true);
    const payload = {
      name: name.trim(),
      stock: Math.max(0, Number(stock) || 0),
      unit: finalUnit,
      max_stock: 999,
      price: Math.max(0, Number(price) || 0),
      cost_price: Math.max(0, Number(costPrice) || 0),
    };
    const { error } = item
      ? await supabase.from("inventory").update(payload).eq("id", item.id)
      : await supabase.from("inventory").insert({ ...payload, user_id: userId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(item ? t("customer_updated") : t("product_added"));
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{item ? t("edit") : t("new_product")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <SheetField label={t("product_name")} value={name} onChange={setName} placeholder={t("product_name_ph")} />
      <SheetField label={t("how_many_now")} value={stock} onChange={setStock} type="number" placeholder={t("stock_now_ph")} />

      <div className="space-y-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("measure_in")}</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_UNITS.map((u) => {
            const selected = unit === u.value;
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => setUnit(u.value)}
                className={`px-3 py-2 rounded-full text-xs font-semibold border transition active:scale-95 ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
                }`}
              >
                <span className="mr-1">{u.icon}</span>{u.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUnit("other")}
            className={`px-3 py-2 rounded-full text-xs font-semibold border transition active:scale-95 ${
              unit === "other"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
            }`}
          >
            <span className="mr-1">✏️</span>{t("unit_others")}
          </button>
        </div>
        {unit === "other" && (
          <input
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            placeholder={t("custom_unit_ph")}
            className="mt-2 w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
          />
        )}
      </div>

      <SheetField label={t("selling_price")} value={price} onChange={setPrice} type="number" placeholder={t("price_ph")} />
      <SheetField label={t("cost_price")} value={costPrice} onChange={setCostPrice} type="number" placeholder={t("cost_price_placeholder")} />

      <button
        onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? t("saving") : "Add to Inventory +"}
      </button>
    </SheetShell>
  );
}

function QtySheet({
  title, label, current, max, onClose, onConfirm,
}: { title: string; label: string; current: number; max?: number; onClose: () => void; onConfirm: (q: number) => void }) {
  const { t } = useI18n();
  const [qty, setQty] = useState("1");
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted-foreground">{t("current_stock")}: <span className="font-semibold text-foreground">{current}</span></p>
      <SheetField label={label} value={qty} onChange={setQty} type="number" />
      <button
        onClick={() => {
          const q = Number(qty) || 0;
          if (q < 1) { toast.error(t("required_field")); return; }
          if (max !== undefined && q > max) { toast.error(t("cant_remove_more")); return; }
          onConfirm(q);
        }}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold active:scale-[0.99]"
      >
        {t("confirm")}
      </button>
    </SheetShell>
  );
}

function ConfirmSheet({
  title, subtitle, onClose, onConfirm,
}: { title: string; subtitle?: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-base font-bold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={onClose} className="py-3 rounded-2xl bg-muted text-foreground font-semibold">{t("cancel")}</button>
        <button onClick={onConfirm} className="py-3 rounded-2xl bg-red-500 text-white font-semibold">{t("delete")}</button>
      </div>
    </SheetShell>
  );
}

function SheetField({
  label, value, onChange, type = "text", placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
      />
    </div>
  );
}