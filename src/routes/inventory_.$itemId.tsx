import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2, ImageIcon, Plus, Minus, Package, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { parseVariants, type InvRow } from "@/lib/inventoryTypes";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import { ProductFormSheet, QtySheet, ConfirmSheet } from "@/components/InventorySheets";
import { formatUnit } from "@/lib/labels";
import { calculateWeightedAverageCost, calculateUnitLandedCost } from "@/lib/orderMath";
import { logInventoryChange } from "@/lib/inventoryAudit";

export const Route = createFileRoute("/inventory_/$itemId")({ component: InventoryDetail });

type Sheet =
  | { kind: "none" }
  | { kind: "form" }
  | { kind: "restock" }
  | { kind: "receive" }
  | { kind: "supplier_refund" }
  | { kind: "remove" }
  | { kind: "delete" };

function InventoryDetail() {
  const { itemId } = Route.useParams();
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<InvRow | null>(null);
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then((p) => setLowThreshold(p.low_stock_threshold)).catch(() => undefined);
  }, [user?.id]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });

  const load = async () => {
    const { data, error } = await supabase.from("inventory").select("*").eq("id", itemId).maybeSingle();
    if (error) toast.error(error.message);
    setItem((data as unknown as InvRow) ?? null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [itemId]);

  const adjust = async (next: number) => {
    if (!item || !user) return;
    const prev = item;
    setItem({ ...item, stock: next });
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", item.id);
    if (error) {
      setItem(prev);
      toast.error(error.message);
    } else {
      toast.success(t("stock_updated"));
      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "stock", oldValue: prev.stock, newValue: next, source: "quick_adjust" });
    }
  };

  const [receiveQty, setReceiveQty] = useState("");
  const [receivePurchaseAmount, setReceivePurchaseAmount] = useState("");
  const [receiveLandedExtra, setReceiveLandedExtra] = useState("");
  const [receiveSupplier, setReceiveSupplier] = useState("");
  const [receiveSaving, setReceiveSaving] = useState(false);

  const submitReceive = async () => {
    if (!item || !user) return;
    const qty = Number(receiveQty);
    const purchaseAmount = Number(receivePurchaseAmount);
    const landedExtra = Number(receiveLandedExtra) || 0;
    if (qty <= 0 || purchaseAmount < 0) {
      toast.error(lang === "zh" ? "请填写正确的数量和金额" : lang === "ms" ? "Sila isi kuantiti dan jumlah yang betul" : "Enter a valid quantity and amount");
      return;
    }
    setReceiveSaving(true);
    try {
      const unitLandedCost = calculateUnitLandedCost(purchaseAmount, landedExtra, qty);
      const newCost = calculateWeightedAverageCost({
        existingStock: item.stock ?? 0,
        existingCostPrice: (item as any).cost_price ?? 0,
        quantityReceived: qty,
        unitLandedCost,
      });
      const newStock = Number(item.stock ?? 0) + qty;

      const { error: receiptErr } = await supabase.from("stock_receipts" as any).insert({
        user_id: user.id,
        product_id: item.id,
        quantity_received: qty,
        purchase_amount: purchaseAmount,
        landed_extra_costs: landedExtra,
        unit_landed_cost: unitLandedCost,
        cost_before: (item as any).cost_price ?? 0,
        cost_after: newCost,
        supplier_name: receiveSupplier || null,
      });
      if (receiptErr) throw new Error(receiptErr.message);

      const { error: invErr } = await supabase
        .from("inventory")
        .update({ stock: newStock, cost_price: newCost } as any)
        .eq("id", item.id);
      if (invErr) throw new Error(invErr.message);

      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "stock", oldValue: item.stock, newValue: newStock, source: "receive_stock" });
      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "cost_price", oldValue: (item as any).cost_price ?? 0, newValue: newCost, source: "receive_stock" });

      setItem({ ...item, stock: newStock, cost_price: newCost } as any);
      toast.success(
        lang === "zh"
          ? `已收货 ${qty} 件，成本更新为 RM ${newCost.toFixed(2)}`
          : lang === "ms"
            ? `${qty} unit diterima, kos dikemas kini RM ${newCost.toFixed(2)}`
            : `Received ${qty} units, cost updated to RM ${newCost.toFixed(2)}`,
      );
      setSheet({ kind: "none" });
      setReceiveQty(""); setReceivePurchaseAmount(""); setReceiveLandedExtra(""); setReceiveSupplier("");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setReceiveSaving(false);
    }
  };

  const [supRefundQty, setSupRefundQty] = useState("");
  const [supRefundAmount, setSupRefundAmount] = useState("");
  const [supRefundReason, setSupRefundReason] = useState("");
  const [supRefundSaving, setSupRefundSaving] = useState(false);

  const submitSupplierRefund = async () => {
    if (!item || !user) return;
    const qty = Number(supRefundQty);
    const refundAmount = Number(supRefundAmount);
    if (qty <= 0 || refundAmount < 0) {
      toast.error(lang === "zh" ? "请填写正确的数量和金额" : lang === "ms" ? "Sila isi kuantiti dan jumlah yang betul" : "Enter a valid quantity and amount");
      return;
    }
    setSupRefundSaving(true);
    try {
      const newStock = Math.max(0, Number(item.stock ?? 0) - qty);
      const { error: invErr } = await supabase.from("inventory").update({ stock: newStock } as any).eq("id", item.id);
      if (invErr) throw new Error(invErr.message);
      logInventoryChange({ userId: user.id, productId: item.id, productName: item.name, fieldName: "stock", oldValue: item.stock, newValue: newStock, source: "supplier_refund" });

      // Deliberately does NOT touch cost_price / weighted-average cost —
      // unwinding it retroactively is ambiguous once some of that batch
      // may already be sold. The refund itself is booked as a negative
      // expense (money recovered), which is what actually matters for
      // Net Profit.
      if (refundAmount > 0) {
        const { error: expErr } = await supabase.from("operating_expenses" as any).insert({
          user_id: user.id,
          category: "other",
          amount: -Math.round(refundAmount * 100) / 100,
          incurred_at: new Date().toISOString().slice(0, 10),
          description:
            (lang === "zh"
              ? `供应商退款 — ${item.name}`
              : lang === "ms"
                ? `Bayaran balik pembekal — ${item.name}`
                : `Supplier refund — ${item.name}`) + (supRefundReason ? ` (${supRefundReason})` : ""),
        } as any);
        if (expErr) throw new Error(expErr.message);
      }

      setItem({ ...item, stock: newStock } as any);
      toast.success(
        lang === "zh"
          ? `已记录退货 ${qty} 件${refundAmount > 0 ? `，拿回 RM ${refundAmount.toFixed(2)}` : ""}`
          : lang === "ms"
            ? `${qty} unit dipulangkan${refundAmount > 0 ? `, RM ${refundAmount.toFixed(2)} diterima balik` : ""}`
            : `Returned ${qty} units${refundAmount > 0 ? `, RM ${refundAmount.toFixed(2)} recovered` : ""}`,
      );
      setSheet({ kind: "none" });
      setSupRefundQty(""); setSupRefundAmount(""); setSupRefundReason("");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSupRefundSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    const { error } = await supabase.from("inventory").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("product_deleted"));
    navigate({ to: "/inventory" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-5 pt-10 pb-4 space-y-4">
        <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("back_inv")}
        </Link>
        <p className="text-center text-sm text-muted-foreground py-10">{t("no_products")}</p>
      </div>
    );
  }

  const variants = parseVariants(item.variants);

  return (
    <div className="pb-24 relative">
      {/* Header image */}
      <div className="relative h-64 w-full bg-muted/50">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="h-16 w-16 text-muted-foreground/40" />
          </div>
        )}
        <Link
          to="/inventory"
          className="absolute top-4 left-4 h-10 w-10 rounded-full bg-card/95 backdrop-blur flex items-center justify-center shadow-md"
          aria-label={t("back_inv")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setSheet({ kind: "form" })}
            className="h-10 w-10 rounded-full bg-card/95 backdrop-blur flex items-center justify-center shadow-md"
            aria-label={t("edit")}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSheet({ kind: "delete" })}
            className="h-10 w-10 rounded-full bg-card/95 backdrop-blur flex items-center justify-center shadow-md text-red-500"
            aria-label={t("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-5">
        {/* Title + category */}
        <div className="space-y-2">
          {item.category && (
            <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              {item.category}
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{item.name}</h1>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-primary">RM {Number(item.price).toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">/ {formatUnit(item.unit, t)}</span>
          </div>
        </div>

        {/* Stock */}
        <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">{t("current_stock")}</span>
            <span className={`text-2xl font-bold ${item.stock <= lowThreshold ? "text-red-500" : "text-foreground"}`}>
              {item.stock} <span className="text-xs font-normal text-muted-foreground">{formatUnit(item.unit, t)}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSheet({ kind: "remove" })}
              className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <Minus className="inline h-3.5 w-3.5 mr-1" />{t("remove")}
            </button>
            <button
              onClick={() => setSheet({ kind: "restock" })}
              className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <Plus className="inline h-3.5 w-3.5 mr-1" />{t("restock")}
            </button>
          </div>
          <button
            onClick={() => setSheet({ kind: "receive" })}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5 transition-transform"
          >
            <Package className="h-4 w-4" /> {lang === "zh" ? "收货（更新成本）" : lang === "ms" ? "Terima stok (kemas kini kos)" : "Receive stock (updates cost)"}
          </button>
          <button
            onClick={() => setSheet({ kind: "supplier_refund" })}
            className="w-full py-2.5 rounded-xl bg-card border border-border/60 text-amber-700 text-sm font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5 transition-transform"
          >
            <Undo2 className="h-4 w-4" /> {lang === "zh" ? "退货给供应商" : lang === "ms" ? "Pulangkan kepada pembekal" : "Return to supplier"}
          </button>
          <Link
            to="/inventory-history"
            search={{ id: item.id }}
            className="w-full py-2.5 rounded-xl bg-card border border-border/60 text-muted-foreground text-xs font-semibold active:scale-[0.98] flex items-center justify-center gap-1.5 transition-transform"
          >
            <History className="h-3.5 w-3.5" /> {lang === "zh" ? "查看变更记录" : lang === "ms" ? "Lihat sejarah perubahan" : "View change history"}
          </Link>
        </div>

        {/* Description */}
        {item.description && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">{t("description")}</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.description}</p>
          </div>
        )}

        {/* Variants */}
        {variants.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">{t("variants")}</h2>
            <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60">
              {variants.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{v.name}</span>
                  <span className="text-sm font-semibold text-primary">RM {v.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Type label */}
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          {t(bizKey(bizType, "inventory"))}
        </p>
      </div>

      {sheet.kind === "form" && (
        <ProductFormSheet
          item={item}
          userId={user?.id ?? ""}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
        />
      )}
      {sheet.kind === "restock" && (
        <QtySheet
          title={`${t("restock")} · ${item.name}`}
          label={t("add_quantity")}
          current={item.stock}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={(q) => { adjust(item.stock + q); setSheet({ kind: "none" }); }}
        />
      )}
      {sheet.kind === "receive" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setSheet({ kind: "none" })}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold flex items-center gap-1.5">
              <Package className="h-4 w-4" /> {lang === "zh" ? "收货" : lang === "ms" ? "Terima stok" : "Receive stock"} · {item.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {lang === "zh"
                ? "填完会自动算出新的加权平均成本，之前卖出的订单利润不会变"
                : lang === "ms"
                  ? "Kos purata baru akan dikira secara automatik; untung pesanan lama tidak berubah"
                  : "Your new weighted-average cost is calculated automatically — past orders' profit stays unchanged"}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "收到数量" : lang === "ms" ? "Kuantiti diterima" : "Quantity received"}</label>
              <input type="number" inputMode="numeric" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "这批货总价 (RM)" : lang === "ms" ? "Jumlah harga belian (RM)" : "Purchase amount for this batch (RM)"}</label>
              <input type="number" inputMode="decimal" value={receivePurchaseAmount} onChange={(e) => setReceivePurchaseAmount(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "运费/清关等额外费用 (RM，可选)" : lang === "ms" ? "Kos tambahan (RM, pilihan)" : "Freight/duty/other landed costs (RM, optional)"}</label>
              <input type="number" inputMode="decimal" value={receiveLandedExtra} onChange={(e) => setReceiveLandedExtra(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "供应商（可选）" : lang === "ms" ? "Pembekal (pilihan)" : "Supplier (optional)"}</label>
              <input value={receiveSupplier} onChange={(e) => setReceiveSupplier(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setSheet({ kind: "none" })} className="flex-1 py-3 rounded-2xl bg-muted text-sm font-semibold">{t("cancel")}</button>
              <button disabled={receiveSaving} onClick={submitReceive} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {receiveSaving ? "…" : (lang === "zh" ? "确认收货" : lang === "ms" ? "Sahkan" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {sheet.kind === "supplier_refund" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setSheet({ kind: "none" })}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold flex items-center gap-1.5">
              <Undo2 className="h-4 w-4" /> {lang === "zh" ? "退货给供应商" : lang === "ms" ? "Pulangkan kepada pembekal" : "Return to supplier"} · {item.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {lang === "zh"
                ? "库存会减少；成本价不会重新计算（已卖出的货不受影响）"
                : lang === "ms"
                  ? "Stok akan berkurang; kos purata tidak dikira semula"
                  : "Stock decreases; the weighted-average cost is not recalculated"}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "退货数量" : lang === "ms" ? "Kuantiti dipulangkan" : "Quantity returned"}</label>
              <input type="number" inputMode="numeric" value={supRefundQty} onChange={(e) => setSupRefundQty(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "供应商退回金额 (RM，可选)" : lang === "ms" ? "Jumlah bayaran balik (RM, pilihan)" : "Amount refunded by supplier (RM, optional)"}</label>
              <input type="number" inputMode="decimal" value={supRefundAmount} onChange={(e) => setSupRefundAmount(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{lang === "zh" ? "原因（可选）" : lang === "ms" ? "Sebab (pilihan)" : "Reason (optional)"}</label>
              <input value={supRefundReason} onChange={(e) => setSupRefundReason(e.target.value)}
                className="w-full rounded-xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setSheet({ kind: "none" })} className="flex-1 py-3 rounded-2xl bg-muted text-sm font-semibold">{t("cancel")}</button>
              <button disabled={supRefundSaving} onClick={submitSupplierRefund} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {supRefundSaving ? "…" : (lang === "zh" ? "确认" : lang === "ms" ? "Sahkan" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {sheet.kind === "remove" && (
        <QtySheet
          title={`${t("remove")} · ${item.name}`}
          label={t("remove_quantity")}
          current={item.stock}
          max={item.stock}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={(q) => {
            if (q > item.stock) { toast.error(t("cant_remove_more")); return; }
            adjust(item.stock - q); setSheet({ kind: "none" });
          }}
        />
      )}
      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t("delete_product_confirm")}
          subtitle={item.name}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}