import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { SheetShell, SheetField } from "@/components/InventorySheets";
import type { ParsedPoResult } from "@/lib/ai-parse-po.functions";
import { applyReceivedStock, applyReceivedStockInventory } from "@/routes/purchase-orders";
import { mergeCategories } from "@/lib/ingredientCategories";

type Supplier = { id: string; name: string };
type StockRef = { id: string; name: string; unit?: string; cost_per_unit?: number };
type Mode = "ingredients" | "inventory";

type ReviewItem = {
  key: string;
  include: boolean;
  matched_id: string | null;
  name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  confidence: number;
  category: string;
};

type POStatus = "pending" | "received" | "cancelled";

export function PurchaseOrderAiReview({
  userId,
  mode,
  suppliers,
  stockItems,
  customCategories = [],
  parsed,
  onClose,
  onSaved,
}: {
  userId: string;
  mode: Mode;
  suppliers: Supplier[];
  stockItems: StockRef[];
  customCategories?: string[];
  parsed: ParsedPoResult;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();

  const [supplierId, setSupplierId] = useState<string>(parsed.supplier.matched_id ?? "");
  const [newSupplierName, setNewSupplierName] = useState<string>(
    parsed.supplier.matched_id ? "" : parsed.supplier.name ?? "",
  );
  const [createNewSupplier, setCreateNewSupplier] = useState<boolean>(
    !parsed.supplier.matched_id && !!(parsed.supplier.name ?? "").trim(),
  );

  const [orderDate, setOrderDate] = useState(
    parsed.order_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.order_date)
      ? parsed.order_date
      : new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<POStatus>("pending");
  const [notes, setNotes] = useState(parsed.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<ReviewItem[]>(() =>
    parsed.items.map((it) => ({
      key: crypto.randomUUID(),
      include: (it.confidence ?? 0) >= 0.6,
      matched_id: it.matched_id,
      name: it.name,
      quantity: String(it.quantity ?? 1),
      unit: it.unit ?? "",
      unit_price: String(it.unit_price ?? 0),
      confidence: it.confidence ?? 0,
      category: (it.category ?? "").trim(),
    })),
  );

  const categoryOptions = useMemo(() => {
    const merged = mergeCategories(customCategories);
    // Also include any AI-suggested categories not yet in list
    const set = new Set(merged.map((c) => c.toLowerCase()));
    items.forEach((i) => {
      const c = i.category.trim();
      if (c && !set.has(c.toLowerCase())) {
        set.add(c.toLowerCase());
        merged.push(c);
      }
    });
    return merged;
  }, [customCategories, items]);

  const ingMap = useMemo(() => {
    const m = new Map<string, StockRef>();
    stockItems.forEach((i) => m.set(i.id, i));
    return m;
  }, [stockItems]);

  useEffect(() => {
    if (items.length === 0) toast(t("po_ai_no_items_found"));
  }, []); // eslint-disable-line

  const total = useMemo(
    () =>
      items
        .filter((l) => l.include)
        .reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [items],
  );

  const updateItem = (key: string, patch: Partial<ReviewItem>) =>
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeItem = (key: string) => setItems((prev) => prev.filter((l) => l.key !== key));

  const save = async () => {
    if (!userId) return;
    const chosen = items.filter((l) => l.include && Number(l.quantity) > 0 && l.name.trim());
    if (chosen.length === 0) {
      toast.error(t("po_need_items"));
      return;
    }

    let finalSupplierId = supplierId;
    if (createNewSupplier) {
      const nm = newSupplierName.trim();
      if (!nm) {
        toast.error(t("po_need_supplier"));
        return;
      }
      setSaving(true);
      const { data: created, error } = await supabase
        .from("suppliers" as any)
        .insert({ user_id: userId, name: nm })
        .select("id")
        .single();
      if (error || !created) {
        setSaving(false);
        toast.error(error?.message ?? "Failed to create supplier");
        return;
      }
      finalSupplierId = (created as any).id;
    }
    if (!finalSupplierId) {
      toast.error(t("po_need_supplier"));
      return;
    }

    setSaving(true);

    // Insert new stock items (those without matched id).
    const newOnes = chosen.filter((l) => !l.matched_id);
    const created: Record<string, string> = {};
    const newCatsToPersist = new Set<string>();
    const knownCatsLower = new Set(mergeCategories(customCategories).map((c) => c.toLowerCase()));
    for (const l of newOnes) {
      const insertPayload =
        mode === "inventory"
          ? {
              user_id: userId,
              name: l.name.trim(),
              price: Number(l.unit_price) || 0,
              stock: 0,
            }
          : {
              user_id: userId,
              name: l.name.trim(),
              unit: l.unit || "pcs",
              cost_per_unit: Number(l.unit_price) || 0,
              current_stock: 0,
              category: l.category.trim() || null,
            };
      const { data: row, error: e } = await supabase
        .from((mode === "inventory" ? "inventory" : "ingredients") as any)
        .insert(insertPayload)
        .select("id")
        .single();
      if (e || !row) {
        setSaving(false);
        toast.error(e?.message ?? "Failed to create item");
        return;
      }
      created[l.key] = (row as any).id;
      if (mode === "ingredients") {
        const c = l.category.trim();
        if (c && !knownCatsLower.has(c.toLowerCase())) {
          newCatsToPersist.add(c);
        }
      }
    }

    // Also update category for matched ingredients if user changed it and matched ingredient lacks one
    if (mode === "ingredients") {
      for (const l of chosen) {
        if (!l.matched_id) continue;
        const c = l.category.trim();
        if (!c) continue;
        if (!knownCatsLower.has(c.toLowerCase())) newCatsToPersist.add(c);
        await supabase
          .from("ingredients" as any)
          .update({ category: c })
          .eq("id", l.matched_id);
      }
    }

    // Persist any newly invented categories so they appear in future pickers
    if (newCatsToPersist.size > 0) {
      const rows = Array.from(newCatsToPersist).map((name) => ({ user_id: userId, name }));
      await supabase
        .from("ingredient_categories" as any)
        .upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });
    }

    // Build PO insert.
    const { data: poRow, error: e1 } = await supabase
      .from("purchase_orders" as any)
      .insert({
        user_id: userId,
        supplier_id: finalSupplierId,
        order_date: orderDate,
        status,
        total_amount: total,
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

    const itemsPayload = chosen.map((l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const refId = l.matched_id ?? created[l.key];
      return {
        purchase_order_id: poId,
        ingredient_id: mode === "ingredients" ? refId : null,
        inventory_id: mode === "inventory" ? refId : null,
        name: l.name.trim(),
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
      const payload = chosen.map((l) => ({
        ref_id: l.matched_id ?? created[l.key],
        quantity: l.quantity,
      }));
      if (mode === "inventory") {
        await applyReceivedStockInventory(
          payload.map((p) => ({ inventory_id: p.ref_id, quantity: p.quantity })),
        );
      } else {
        await applyReceivedStock(
          payload.map((p) => ({ ingredient_id: p.ref_id, quantity: p.quantity })),
        );
      }
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
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-bold text-foreground">{t("po_ai_review_title")}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Supplier */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_supplier")}
        </label>
        {!createNewSupplier ? (
          <select
            value={supplierId}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setCreateNewSupplier(true);
              } else {
                setSupplierId(e.target.value);
              }
            }}
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("po_select_supplier")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new__">+ {t("po_ai_new_supplier")}</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder={t("po_ai_new_supplier")}
              className="flex-1 rounded-2xl bg-muted/40 border border-primary/60 px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                setCreateNewSupplier(false);
                setNewSupplierName("");
              }}
              className="px-3 rounded-2xl bg-muted text-xs"
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      <SheetField label={t("po_order_date")} value={orderDate} onChange={setOrderDate} type="date" />

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_status")}
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as POStatus)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary"
        >
          <option value="pending">{t("po_status_pending")}</option>
          <option value="received">{t("po_status_received")}</option>
          <option value="cancelled">{t("po_status_cancelled")}</option>
        </select>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_items")} · {items.filter((i) => i.include).length}/{items.length}
        </p>
        {items.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">{t("po_ai_no_items_found")}</p>
        )}
        {items.map((l) => {
          const matched = l.matched_id ? ingMap.get(l.matched_id) : null;
          const isNew = !l.matched_id;
          const low = l.confidence < 0.6;
          return (
            <div
              key={l.key}
              className={`rounded-2xl border p-3 space-y-2 ${l.include ? "border-border/60 bg-muted/30" : "border-border/30 bg-muted/10 opacity-60"}`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={l.include}
                  onChange={(e) => updateItem(l.key, { include: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isNew ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {isNew ? t("po_ai_new_ingredient") : t("po_ai_matched")}
                    </span>
                    {low && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        {t("po_ai_low_confidence")}
                      </span>
                    )}
                    {matched && (
                      <span className="text-[10px] text-muted-foreground truncate">→ {matched.name}</span>
                    )}
                  </div>
                  <input
                    value={l.name}
                    onChange={(e) => updateItem(l.key, { name: e.target.value })}
                    className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm font-medium outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(l.key)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                  aria-label="remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pl-6">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_quantity")}</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={l.quantity}
                    onChange={(e) => updateItem(l.key, { quantity: e.target.value })}
                    className="w-full rounded-xl bg-card border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_unit")}</p>
                  <input
                    value={l.unit}
                    onChange={(e) => updateItem(l.key, { unit: e.target.value })}
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
                    onChange={(e) => updateItem(l.key, { unit_price: e.target.value })}
                    className="w-full rounded-xl bg-card border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setItems((p) => [
              ...p,
              {
                key: crypto.randomUUID(),
                include: true,
                matched_id: null,
                name: "",
                quantity: "1",
                unit: "",
                unit_price: "0",
                confidence: 1,
                category: "",
              },
            ])
          }
          className="w-full py-2.5 rounded-2xl border border-dashed border-border/70 text-sm font-semibold text-primary hover:bg-primary/5 flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" />
          {t("po_add_item")}
        </button>
      </div>

      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{t("po_overall_total")}</span>
        <span className="text-lg font-bold text-primary">RM {total.toFixed(2)}</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_notes")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary resize-none"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99]"
      >
        {saving ? t("saving") : t("po_ai_confirm_create")}
      </button>
    </SheetShell>
  );
}