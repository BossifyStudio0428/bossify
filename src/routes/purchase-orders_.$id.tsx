import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2, FileDown, Lock } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
    const doc = new jsPDF();
    doc.setFillColor(108, 63, 214);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(t("po_title"), 14, 13);
    doc.setFontSize(11);
    doc.text(supplierName, 14, 20);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(10);
    doc.text(`${t("po_order_date")}: ${new Date(po.order_date).toLocaleDateString()}`, 14, 36);
    doc.text(`${t("po_status")}: ${po.status}`, 14, 42);

    autoTable(doc, {
      startY: 50,
      head: [[t("po_select_ingredient"), t("po_quantity"), t("po_unit"), t("po_unit_price"), t("po_line_total")]],
      body: items.map((i) => [
        (i.ingredient_id && ingredientNames[i.ingredient_id]) || "—",
        String(i.quantity),
        i.unit ?? "",
        `RM ${Number(i.unit_price).toFixed(2)}`,
        `RM ${Number(i.total_price).toFixed(2)}`,
      ]),
      headStyles: { fillColor: [108, 63, 214] },
      foot: [["", "", "", t("po_overall_total"), `RM ${overallTotal.toFixed(2)}`]],
      footStyles: { fillColor: [240, 238, 248], textColor: 0, fontStyle: "bold" },
    });

    if (po.notes) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? 80;
      doc.setFontSize(10);
      doc.text(`${t("po_notes")}: ${po.notes}`, 14, finalY + 10);
    }

    try {
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
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("po_items")}
        </p>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">—</p>
        )}
        {items.map((i) => (
          <div key={i.id} className="rounded-2xl bg-card border border-border/60 p-3">
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
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{t("po_overall_total")}</span>
        <span className="text-lg font-bold text-primary">RM {overallTotal.toFixed(2)}</span>
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
    </div>
  );
}