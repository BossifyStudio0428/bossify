import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { logInventoryChange } from "@/lib/inventoryAudit";
import { SheetShell } from "@/components/InventorySheets";

export type QuickCostItem = {
  id: string;
  name: string;
  price?: number | null;
  cost_price?: number | null;
  packaging_cost?: number | null;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Saves a product's unit cost and packaging cost straight to inventory —
 * the quick way to fill in a missing cost without opening the full product
 * form. This sets the cost directly; receiving a new batch at a different
 * price (weighted average) still goes through "Product purchase cost".
 */
async function saveCost(userId: string, item: QuickCostItem, cost: number, packaging: number) {
  const { error } = await supabase
    .from("inventory")
    .update({ cost_price: cost, packaging_cost: packaging } as any)
    .eq("id", item.id);
  if (error) throw new Error(error.message);
  logInventoryChange({
    userId,
    productId: item.id,
    productName: item.name,
    fieldName: "cost_price",
    oldValue: item.cost_price ?? 0,
    newValue: cost,
    source: "quick_cost_edit",
  });
}

function labels(lang: string) {
  return {
    cost: lang === "zh" ? "成本 (RM / 件)" : lang === "ms" ? "Kos (RM / unit)" : "Cost (RM / unit)",
    packaging: lang === "zh" ? "包装费 (RM / 件，可选)" : lang === "ms" ? "Bungkusan (RM / unit, pilihan)" : "Packaging (RM / unit, optional)",
    profit: lang === "zh" ? "每件利润" : lang === "ms" ? "Untung / unit" : "Profit / unit",
    price: lang === "zh" ? "售价" : lang === "ms" ? "Harga" : "Price",
    save: lang === "zh" ? "保存" : lang === "ms" ? "Simpan" : "Save",
    saved: lang === "zh" ? "成本已保存" : lang === "ms" ? "Kos disimpan" : "Cost saved",
    needCost: lang === "zh" ? "请填成本" : lang === "ms" ? "Sila isi kos" : "Enter a cost",
    title: lang === "zh" ? "修改成本" : lang === "ms" ? "Edit kos" : "Edit cost",
  };
}

/** Cost + packaging inputs with a live per-unit profit preview and a save
 *  button. `compact` lays it out as one tight row (for lists). */
export function QuickCostFields({
  item, userId, onSaved, compact = false,
}: {
  item: QuickCostItem;
  userId: string;
  onSaved: (cost: number, packaging: number) => void;
  compact?: boolean;
}) {
  const { lang } = useI18n();
  const L = labels(lang);
  const [cost, setCost] = useState(num(item.cost_price) > 0 ? String(item.cost_price) : "");
  const [packaging, setPackaging] = useState(num(item.packaging_cost) > 0 ? String(item.packaging_cost) : "");
  const [saving, setSaving] = useState(false);

  const price = num(item.price);
  const c = num(cost);
  const pk = num(packaging);
  const profit = price - c - pk;
  const hasCost = cost.trim() !== "" && c > 0;

  const submit = async () => {
    if (!hasCost) { toast.error(L.needCost); return; }
    setSaving(true);
    try {
      await saveCost(userId, item, c, pk);
      toast.success(L.saved);
      onSaved(c, pk);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground">{L.cost}</label>
          <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground">{L.packaging}</label>
          <input type="number" inputMode="decimal" value={packaging} onChange={(e) => setPackaging(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          {L.price} RM {price.toFixed(2)}
          {hasCost && (
            <>
              {" · "}{L.profit}{" "}
              <span className={`font-semibold ${profit < 0 ? "text-red-600" : profit > 0 ? "text-emerald-600" : "text-foreground"}`}>
                RM {profit.toFixed(2)}
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="shrink-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-60 active:scale-[0.98] transition-transform"
        >
          {saving ? "…" : L.save}
        </button>
      </div>
    </div>
  );
}

/** Bottom sheet wrapper around QuickCostFields, opened from a product row. */
export function QuickCostSheet({
  item, userId, onClose, onSaved,
}: {
  item: QuickCostItem;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useI18n();
  const L = labels(lang);
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold truncate">{L.title} · {item.name}</h3>
        <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-muted shrink-0"><X className="h-4 w-4" /></button>
      </div>
      <QuickCostFields item={item} userId={userId} onSaved={() => onSaved()} />
    </SheetShell>
  );
}
