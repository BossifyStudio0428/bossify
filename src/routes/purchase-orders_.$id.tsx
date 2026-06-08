import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2, FileDown, Lock, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ConfirmSheet } from "@/components/InventorySheets";
import { savePdf } from "@/lib/pdf";
import {
  applyReceivedStock,
  statusColor,
  type POStatus,
  type PurchaseOrder,
} from "./purchase-orders";

export const Route = createFileRoute("/purchase-orders_/$id")({ component: PurchaseOrderDetailPage });

type Item = {
  id: string;
  ingredient_id: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total_price: number;
};

function PurchaseOrderDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isPro, isLifetime, isTeam } = useSubscription();
  const canExport = isPro || isLifetime || isTeam;

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [ingredientNames, setIngredientNames] = useState<Record<string, string>>({});
  const [supplierName, setSupplierName] = useState<string>("—");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: poRow }, { data: itemRows }] = await Promise.all([
      supabase.from("purchase_orders" as any).select("*").eq("id", id).maybeSingle(),
      supabase.from("purchase_order_items" as any).select("*").eq("purchase_order_id", id),
    ]);
    if (!poRow) {
      setLoading(false);
      return;
    }
    const po = poRow as unknown as PurchaseOrder;
    setPo(po);
    const its = ((itemRows ?? []) as unknown) as Item[];
    setItems(its);
    if (po.supplier_id) {
      const { data: s } = await supabase
        .from("suppliers" as any)
        .select("name")
        .eq("id", po.supplier_id)
        .maybeSingle();
      setSupplierName((s as any)?.name ?? "—");
    }
    const ingIds = Array.from(new Set(its.map((i) => i.ingredient_id).filter(Boolean) as string[]));
    if (ingIds.length) {
      const { data: ings } = await supabase
        .from("ingredients" as any)
        .select("id, name")
        .in("id", ingIds);
      const map: Record<string, string> = {};
      ((ings ?? []) as any[]).forEach((r) => (map[r.id] = r.name));
      setIngredientNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const overallTotal = useMemo(
    () => items.reduce((s, i) => s + Number(i.total_price ?? 0), 0),
    [items],
  );

  const changeStatus = async (next: POStatus) => {
    if (!po) return;
    if (next === po.status) return;
    setStatusBusy(true);
    const wasReceived = po.status === "received";
    const { error } = await supabase
      .from("purchase_orders" as any)
      .update({ status: next })
      .eq("id", po.id);
    if (error) {
      setStatusBusy(false);
      toast.error(error.message);
      return;
    }
    if (next === "received" && !wasReceived) {
      await applyReceivedStock(
        items.map((i) => ({ ingredient_id: i.ingredient_id ?? "", quantity: i.quantity })),
      );
      toast.success(t("po_stock_updated"));
    } else {
      toast.success(t("po_saved"));
    }
    setPo({ ...po, status: next });
    setStatusBusy(false);
  };

  const handleDelete = async () => {
    if (!po) return;
    const { error: e1 } = await supabase
      .from("purchase_order_items" as any)
      .delete()
      .eq("purchase_order_id", po.id);
    if (e1) {
      toast.error(e1.message);
      return;
    }
    const { error: e2 } = await supabase.from("purchase_orders" as any).delete().eq("id", po.id);
    if (e2) {
      toast.error(e2.message);
      return;
    }
    toast.success(t("po_deleted"));
    navigate({ to: "/purchase-orders" });
  };

  const exportPdf = async () => {
    if (!po) return;
    if (!canExport) {
      toast.error(t("pro_feature_required"));
      return;
    }
    const node = pdfRef.current;
    if (!node) return;
    try {
      // Render the HTML version (which supports CJK via system fonts) to canvas,
      // then embed as image into PDF. This bypasses jsPDF's lack of Chinese fonts.
      const canvas = await html2canvas(node, {
        background: "#ffffff",
        scale: 2,
      } as any);
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdfW = 210;
      const pdfH = 297;
      const ratio = canvas.height / canvas.width;
      const imgW = pdfW - 20;
      const imgH = imgW * ratio;
      const doc = new jsPDF("p", "mm", "a4");
      if (imgH <= pdfH - 20) {
        doc.addImage(imgData, "JPEG", 10, 10, imgW, imgH);
      } else {
        // Slice tall content into pages
        const pageHpx = ((pdfH - 20) * canvas.width) / imgW;
        let y = 0;
        let first = true;
        while (y < canvas.height) {
          const sliceH = Math.min(pageHpx, canvas.height - y);
          const c = document.createElement("canvas");
          c.width = canvas.width;
          c.height = sliceH;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const slice = c.toDataURL("image/jpeg", 0.92);
          if (!first) doc.addPage();
          doc.addImage(slice, "JPEG", 10, 10, imgW, (sliceH * imgW) / canvas.width);
          y += sliceH;
          first = false;
        }
      }
      await savePdf(doc, `purchase-order-${po.id.slice(0, 8)}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to export PDF");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  if (!po) {
    return <p className="px-5 pt-10 text-sm text-muted-foreground">—</p>;
  }

  const statusLabel =
    po.status === "received"
      ? t("po_status_received")
      : po.status === "cancelled"
      ? t("po_status_cancelled")
      : t("po_status_pending");

  const startEdit = () => {
    setEditItems(items.map((i) => ({ ...i })));
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditItems([]);
  };
  const updateEditItem = (id: string, patch: Partial<Item>) => {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        next.total_price = Number(next.quantity || 0) * Number(next.unit_price || 0);
        return next;
      }),
    );
  };
  const removeEditItem = (id: string) =>
    setEditItems((prev) => prev.filter((it) => it.id !== id));
  const saveEdits = async () => {
    if (!po) return;
    setSaving(true);
    const removedIds = items
      .filter((orig) => !editItems.find((e) => e.id === orig.id))
      .map((o) => o.id);
    if (removedIds.length) {
      const { error } = await supabase
        .from("purchase_order_items" as any)
        .delete()
        .in("id", removedIds);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    for (const it of editItems) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const { error } = await supabase
        .from("purchase_order_items" as any)
        .update({
          quantity: qty,
          unit: it.unit,
          unit_price: price,
          total_price: qty * price,
        })
        .eq("id", it.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    const newTotal = editItems.reduce(
      (s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0),
      0,
    );
    await supabase
      .from("purchase_orders" as any)
      .update({ total_amount: newTotal })
      .eq("id", po.id);
    setSaving(false);
    setEditing(false);
    toast.success(t("po_saved"));
    await load();
  };

  const displayItems = editing ? editItems : items;
  const displayTotal = editing
    ? editItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
    : overallTotal;

  return (
    <div className="px-5 pt-10 pb-24 space-y-5">
      <button
        onClick={() => navigate({ to: "/purchase-orders" })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{t("po_detail")}</h1>
        <p className="text-sm text-muted-foreground">{supplierName}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(po.order_date).toLocaleDateString()}
        </p>
      </header>

      <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t("po_status")}</span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColor(po.status)}`}>
            {statusLabel}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["pending", "received", "cancelled"] as POStatus[]).map((s) => (
            <button
              key={s}
              disabled={statusBusy || s === po.status}
              onClick={() => changeStatus(s)}
              className={`py-2 rounded-xl text-xs font-semibold border transition ${
                s === po.status
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-card text-foreground border-border/60 hover:bg-muted"
              } disabled:opacity-60`}
            >
              {s === "received"
                ? t("po_status_received")
                : s === "cancelled"
                ? t("po_status_cancelled")
                : t("po_status_pending")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            {t("po_items")}
          </p>
          {!editing ? (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("edit")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" /> {t("cancel")}
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" /> {saving ? t("saving") : t("save")}
              </button>
            </div>
          )}
        </div>
        {displayItems.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">—</p>
        )}
        {displayItems.map((i) => (
          <div key={i.id} className="rounded-2xl bg-card border border-border/60 p-3">
            {!editing ? (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {(i.ingredient_id && ingredientNames[i.ingredient_id]) || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Number(i.quantity)} {i.unit ?? ""} × RM {Number(i.unit_price).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  RM {Number(i.total_price).toFixed(2)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate flex-1">
                    {(i.ingredient_id && ingredientNames[i.ingredient_id]) || "—"}
                  </p>
                  <button
                    onClick={() => removeEditItem(i.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
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
                      value={i.quantity}
                      onChange={(e) => updateEditItem(i.id, { quantity: Number(e.target.value) })}
                      className="w-full rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_unit")}</p>
                    <input
                      value={i.unit ?? ""}
                      onChange={(e) => updateEditItem(i.id, { unit: e.target.value })}
                      className="w-full rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">{t("po_unit_price")}</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={i.unit_price}
                      onChange={(e) => updateEditItem(i.id, { unit_price: Number(e.target.value) })}
                      className="w-full rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <p className="text-xs text-right text-muted-foreground">
                  {t("po_line_total")}: <span className="font-semibold text-foreground">RM {Number(i.total_price).toFixed(2)}</span>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{t("po_overall_total")}</span>
        <span className="text-lg font-bold text-primary">RM {displayTotal.toFixed(2)}</span>
      </div>

      {po.notes && (
        <div className="rounded-2xl bg-card border border-border/60 p-3">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-1">
            {t("po_notes")}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportPdf}
          className="py-3 rounded-2xl bg-card border border-border/60 text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          {canExport ? <FileDown className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {t("po_export_pdf")}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="py-3 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          <Trash2 className="h-4 w-4" /> {t("delete")}
        </button>
      </div>

      {confirmDelete && (
        <ConfirmSheet
          title={t("po_delete_confirm")}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}

      {/* Hidden PDF render target — CJK-safe via system fonts */}
      <div
        ref={pdfRef}
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "794px",
          background: "#ffffff",
          color: "#000000",
          padding: "32px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans", Arial, sans-serif',
        }}
      >
        <div style={{ background: "#6C3FD6", color: "#fff", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
          <div style={{ fontSize: "22px", fontWeight: 700 }}>{t("po_title")}</div>
          <div style={{ fontSize: "14px", opacity: 0.9, marginTop: 4 }}>{supplierName}</div>
        </div>
        <div style={{ fontSize: "13px", marginBottom: 6 }}>
          {t("po_order_date")}: {new Date(po.order_date).toLocaleDateString()}
        </div>
        <div style={{ fontSize: "13px", marginBottom: 16 }}>
          {t("po_status")}: {statusLabel}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#6C3FD6", color: "#fff" }}>
              <th style={{ textAlign: "left", padding: "8px" }}>{t("po_select_ingredient")}</th>
              <th style={{ textAlign: "right", padding: "8px" }}>{t("po_quantity")}</th>
              <th style={{ textAlign: "left", padding: "8px" }}>{t("po_unit")}</th>
              <th style={{ textAlign: "right", padding: "8px" }}>{t("po_unit_price")}</th>
              <th style={{ textAlign: "right", padding: "8px" }}>{t("po_line_total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id} style={{ background: idx % 2 === 0 ? "#fff" : "#F0EEF8" }}>
                <td style={{ padding: "8px" }}>
                  {(it.ingredient_id && ingredientNames[it.ingredient_id]) || "—"}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>{Number(it.quantity)}</td>
                <td style={{ padding: "8px" }}>{it.unit ?? ""}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>RM {Number(it.unit_price).toFixed(2)}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>RM {Number(it.total_price).toFixed(2)}</td>
              </tr>
            ))}
            <tr style={{ background: "#F0EEF8", fontWeight: 700 }}>
              <td colSpan={4} style={{ padding: "8px", textAlign: "right" }}>{t("po_overall_total")}</td>
              <td style={{ padding: "8px", textAlign: "right" }}>RM {overallTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        {po.notes && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("po_notes")}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{po.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}