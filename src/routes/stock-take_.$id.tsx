import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { savePdf } from "@/lib/pdf";

export const Route = createFileRoute("/stock-take_/$id")({ component: StockTakeReportPage });

type Take = { id: string; started_at: string; completed_at: string | null; status: string };
type ProfileResult = { data: { business_name: string | null } | null; error: unknown };
type Item = {
  id: string;
  product_name: string;
  unit?: string | null;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  reason: string | null;
};

function StockTakeReportPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [take, setTake] = useState<Take | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [businessName, setBusinessName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [tk, its, prof] = await Promise.all([
        supabase
          .from("stock_takes" as never)
          .select("*")
          .eq("id", id)
          .single(),
        supabase
          .from("stock_take_items" as never)
          .select("*")
          .eq("stock_take_id", id)
          .order("product_name", { ascending: true }),
        user
          ? supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as ProfileResult),
      ]);
      if (tk.error) toast.error(tk.error.message);
      else setTake(tk.data as unknown as Take);
      if (its.error) toast.error(its.error.message);
      else setItems((its.data ?? []) as unknown as Item[]);
      if (prof.data?.business_name) setBusinessName(prof.data.business_name);
      setLoading(false);
    })();
  }, [id, user]);

  const discrepancies = items.filter((i) => i.difference !== 0).length;
  const totalShortage = items.reduce((acc, i) => acc + (i.difference < 0 ? -i.difference : 0), 0);
  const totalSurplus = items.reduce((acc, i) => acc + (i.difference > 0 ? i.difference : 0), 0);
  const diffItems = items.filter((i) => i.difference !== 0);
  const hasReasons = items.some((i) => i.reason && i.reason.trim());

  const exportPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(16);
      doc.text("Bossify", 14, 16);
      doc.setFontSize(13);
      doc.text(t("stock_take_report"), 14, 24);
      doc.setFontSize(10);
      let y = 32;
      if (businessName) {
        doc.text(`${t("business_name")}: ${businessName}`, 14, y);
        y += 6;
      }
      if (take) {
        doc.text(`${t("started_at")}: ${new Date(take.started_at).toLocaleString()}`, 14, y);
        y += 6;
        if (take.completed_at) {
          doc.text(`${t("completed_at")}: ${new Date(take.completed_at).toLocaleString()}`, 14, y);
          y += 6;
        }
        doc.text(`Status: ${t("status_completed")}`, 14, y);
        y += 6;
      }
      doc.text(
        `${t("items_checked_label")}: ${items.length}    ${t("items_with_discrepancies")}: ${discrepancies}`,
        14,
        y,
      );
      y += 6;
      doc.text(
        `${t("total_shortage")}: ${totalShortage}    ${t("total_surplus")}: +${totalSurplus}`,
        14,
        y,
      );
      y += 4;
      const head = hasReasons
        ? [
            [
              "Item",
              t("unit"),
              t("system_qty"),
              t("actual_qty"),
              t("difference"),
              t("reason_for_difference"),
            ],
          ]
        : [["Item", t("unit"), t("system_qty"), t("actual_qty"), t("difference")]];
      autoTable(doc, {
        startY: y + 4,
        head,
        body: items.map((i) => {
          const row = [
            i.product_name,
            i.unit ?? "",
            i.system_quantity,
            i.actual_quantity,
            (i.difference > 0 ? "+" : "") + i.difference,
          ];
          if (hasReasons) row.push(i.reason ?? "");
          return row;
        }),
      });
      // Watermark on every page
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(t("generated_by_bossify"), pageW / 2, pageH - 8, { align: "center" });
        doc.setTextColor(0);
      }
      await savePdf(doc, `stock-take-${id.slice(0, 8)}.pdf`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("pdf_failed"));
    }
  };

  return (
    <div className="px-5 pt-10 pb-24 space-y-5">
      <Link
        to="/stock-take"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("stock_take")}
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{t("stock_take_report")}</h1>
        {businessName && <p className="text-sm font-semibold text-foreground">{businessName}</p>}
        {take && (
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {new Date(take.started_at).toLocaleString()}
            </p>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {t("status_completed")}
            </span>
          </div>
        )}
      </header>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-card border border-border/60 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">
                {t("items_checked_label")}
              </p>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">
                {t("items_with_discrepancies")}
              </p>
              <p
                className={`text-2xl font-bold ${discrepancies > 0 ? "text-amber-600" : "text-green-600"}`}
              >
                {discrepancies}
              </p>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">{t("total_shortage")}</p>
              <p className="text-2xl font-bold text-red-500">{totalShortage}</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">{t("total_surplus")}</p>
              <p className="text-2xl font-bold text-green-600">+{totalSurplus}</p>
            </div>
          </div>

          <button
            onClick={exportPdf}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <Download className="h-4 w-4" /> {t("export_pdf")}
          </button>

          <div className="space-y-2">
            {(diffItems.length > 0 ? diffItems : items).map((it) => (
              <div
                key={it.id}
                className={`rounded-2xl bg-card border p-3 ${it.difference !== 0 ? "border-amber-300 bg-amber-50/40" : "border-border/60"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {it.product_name}
                  </p>
                  {it.unit && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                      {it.unit}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("system_qty")}</p>
                    <p className="font-semibold">{it.system_quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("actual_qty")}</p>
                    <p className="font-semibold">{it.actual_quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("difference")}</p>
                    <p
                      className={`font-bold ${it.difference < 0 ? "text-red-500" : it.difference > 0 ? "text-green-600" : "text-muted-foreground"}`}
                    >
                      {it.difference > 0 ? "+" : ""}
                      {it.difference}
                    </p>
                  </div>
                </div>
                {it.reason && (
                  <p className="mt-2 text-xs">
                    <span className="text-muted-foreground">{t("reason_for_difference")}:</span>{" "}
                    <span className="font-semibold text-foreground">{it.reason}</span>
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-[10px] text-muted-foreground pt-4">
            {t("generated_by_bossify")}
          </p>
        </>
      )}
    </div>
  );
}
