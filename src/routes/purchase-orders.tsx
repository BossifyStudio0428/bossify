import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, X, Trash2, ChevronRight, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { SheetShell, SheetField, ConfirmSheet } from "@/components/InventorySheets";
import { StockTabs } from "@/components/StockTabs";

export const Route = createFileRoute("/purchase-orders")({ component: PurchaseOrdersPage });

type POStatus = "pending" | "received" | "cancelled";

type PurchaseOrder = {
  id: string;
  user_id: string;
  supplier_id: string | null;
  order_date: string;
  status: POStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
};

type Supplier = { id: string; name: string };
type Ingredient = { id: string; name: string; unit: string; cost_per_unit: number };

type Counts = Record<string, { items: number; supplier: string | null }>;

function statusColor(s: POStatus) {
  if (s === "received") return "bg-emerald-100 text-emerald-700";
  if (s === "cancelled") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function PurchaseOrdersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType } = useBusinessType();
  const allowed = bizType === "fnb" || bizType === "retail";

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const load = async () => {
    setLoading(true);
    const [{ data: po }, { data: sup }, { data: ing }] = await Promise.all([
      supabase
        .from("purchase_orders" as any)
        .select("*")
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("suppliers" as any).select("id, name").order("name"),
      supabase
        .from("ingredients" as any)
        .select("id, name, unit, cost_per_unit")
        .order("name"),
    ]);
    const list = (po ?? []) as unknown as PurchaseOrder[];
    setOrders(list);
    setSuppliers((sup ?? []) as unknown as Supplier[]);
    setIngredients((ing ?? []) as unknown as Ingredient[]);
    if (list.length) {
      const ids = list.map((o) => o.id);
      const { data: items } = await supabase
        .from("purchase_order_items" as any)
        .select("purchase_order_id")
        .in("purchase_order_id", ids);
      const c: Counts = {};
      ((items ?? []) as any[]).forEach((it) => {
        const k = it.purchase_order_id as string;
        c[k] = c[k] ?? { items: 0, supplier: null };
        c[k].items += 1;
      });
      setCounts(c);
    } else {
      setCounts({});
    }
    setLoading(false);
  };

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  if (!allowed) return null;

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("po_title")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {orders.length}
        </span>
      </header>

      <StockTabs active="purchase-orders" />

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("po_no_orders")}</p>
      )}

      <div className="space-y-2">
        {orders.map((o) => {
          const cnt = counts[o.id]?.items ?? 0;
          const supplierName = (o.supplier_id && supplierMap.get(o.supplier_id)) || "—";
          const label =
            o.status === "received"
              ? t("po_status_received")
              : o.status === "cancelled"
              ? t("po_status_cancelled")
              : t("po_status_pending");
          return (
            <Link
              key={o.id}
              to="/purchase-orders/$id"
              params={{ id: o.id }}
              className="block rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground truncate">{supplierName}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.order_date).toLocaleDateString()} · {cnt} {t("po_item_count")}
                  </p>
                  <p className="text-xs text-foreground font-semibold">
                    RM {Number(o.total_amount ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(o.status)}`}>
                    {label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <button
        onClick={() => setFormOpen(true)}
        aria-label={t("po_add")}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {formOpen && (
        <PurchaseOrderForm
          userId={user?.id ?? ""}
          suppliers={suppliers}
          ingredients={ingredients}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

type LineItem = {
  key: string;
  ingredient_id: string;
  quantity: string;
  unit: string;
  unit_price: string;
};

function newLine(): LineItem {
  return { key: crypto.randomUUID(), ingredient_id: "", quantity: "1", unit: "", unit_price: "0" };
}

export function PurchaseOrderForm({
  userId,
  suppliers,
  ingredients,
  onClose,
  onSaved,
}: {
  userId: string;
  suppliers: Supplier[];
  ingredients: Ingredient[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<POStatus>("pending");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    ingredients.forEach((i) => m.set(i.id, i));
    return m;
  }, [ingredients]);

  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.ingredient_id !== undefined) {
          const ing = ingMap.get(patch.ingredient_id);
          if (ing) {
            next.unit = ing.unit ?? "";
            if (!l.unit_price || l.unit_price === "0") {
              next.unit_price = String(ing.cost_per_unit ?? 0);
            }
          }
        }
        return next;
      }),
    );
  };

  const removeLine = (key: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));

  const overallTotal = useMemo(
    () =>
      lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [lines],
  );

  const save = async () => {
    if (!userId) return;
    if (!supplierId) {
      toast.error(t("po_need_supplier"));
      return;
    }
    const validLines = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      toast.error(t("po_need_items"));
      return;
    }
    setSaving(true);
    const { data: poRow, error: e1 } = await supabase
      .from("purchase_orders" as any)
      .insert({
        user_id: userId,
        supplier_id: supplierId,
        order_date: orderDate,
        status,
        total_amount: overallTotal,
        notes: notes.trim() || null,
      })
      .select()
      .single();
    if (e1 || !poRow) {
      setSaving(false);
      toast.error(e1?.message ?? "Failed");
      return;
    }
    const poId = (poRow as any).id as string;

    const itemsPayload = validLines.map((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      return {
        purchase_order_id: poId,
        ingredient_id: l.ingredient_id,
        quantity: qty,
        unit: l.unit || null,
        unit_price: price,
        total_price: qty * price,
      };
    });
    const { error: e2 } = await supabase.from("purchase_order_items" as any).insert(itemsPayload);
    if (e2) {
      setSaving(false);
      toast.error(e2.message);
      return;
    }

    if (status === "received") {
      await applyReceivedStock(validLines);
      toast.success(t("po_stock_updated"));
    } else {
      toast.success(t("po_saved"));
    }
    setSaving(false);
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t("po_add")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_supplier")}
        </label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("po_select_supplier")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <SheetField label={t("po_order_date")} value={orderDate} onChange={setOrderDate} type="date" />

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_status")}
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as POStatus)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="pending">{t("po_status_pending")}</option>
          <option value="received">{t("po_status_received")}</option>
          <option value="cancelled">{t("po_status_cancelled")}</option>
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_items")}
        </p>
        {lines.map((l) => {
          const lineTotal = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
          return (
            <div key={l.key} className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={l.ingredient_id}
                  onChange={(e) => updateLine(l.key, { ingredient_id: e.target.value })}
                  className="flex-1 rounded-xl bg-card border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">{t("po_select_ingredient")}</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                  aria-label="remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_quantity")}</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                    className="w-full rounded-xl bg-card border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_unit")}</p>
                  <input
                    value={l.unit}
                    onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                    className="w-full rounded-xl bg-card border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_unit_price")}</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                    className="w-full rounded-xl bg-card border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <p className="text-xs text-right text-muted-foreground">
                {t("po_line_total")}: <span className="font-semibold text-foreground">RM {lineTotal.toFixed(2)}</span>
              </p>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setLines((p) => [...p, newLine()])}
          className="w-full py-2.5 rounded-2xl border border-dashed border-border/70 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          {t("po_add_item")}
        </button>
      </div>

      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{t("po_overall_total")}</span>
        <span className="text-lg font-bold text-primary">RM {overallTotal.toFixed(2)}</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_notes")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary resize-none"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99]"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </SheetShell>
  );
}

export async function applyReceivedStock(
  items: { ingredient_id: string; quantity: string | number }[],
) {
  // Fetch current stock for each ingredient, then increment.
  const ids = Array.from(new Set(items.map((i) => i.ingredient_id).filter(Boolean)));
  if (!ids.length) return;
  const { data } = await supabase
    .from("ingredients" as any)
    .select("id, current_stock")
    .in("id", ids);
  const stockMap = new Map<string, number>();
  ((data ?? []) as any[]).forEach((r) => stockMap.set(r.id, Number(r.current_stock ?? 0)));
  const delta = new Map<string, number>();
  items.forEach((it) => {
    const q = Number(it.quantity) || 0;
    if (!it.ingredient_id || q <= 0) return;
    delta.set(it.ingredient_id, (delta.get(it.ingredient_id) ?? 0) + q);
  });
  for (const [id, add] of delta.entries()) {
    const next = (stockMap.get(id) ?? 0) + add;
    await supabase.from("ingredients" as any).update({ current_stock: next }).eq("id", id);
  }
}

// Re-export for detail page convenience
export type { POStatus, PurchaseOrder, Supplier, Ingredient };
export { statusColor };

// Silence unused import warning when ConfirmSheet stays unused here.
void ConfirmSheet;