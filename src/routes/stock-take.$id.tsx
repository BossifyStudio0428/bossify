import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/stock-take/$id")({ component: StockTakeReportPage });

type Take = { id: string; started_at: string; completed_at: string | null; status: string };
type Item = {
  id: string;
  product_name: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
};

function StockTakeReportPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const [take, setTake] = useState<Take | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [tk, its] = await Promise.all([
        supabase.from("stock_takes" as any).select("*").eq("id", id).single(),
        supabase.from("stock_take_items" as any).select("*").eq("stock_take_id", id).order("product_name", { ascending: true }),
      ]);
      if (tk.error) toast.error(tk.error.message);
      else setTake(tk.data as unknown as Take);
      if (its.error) toast.error(its.error.message);
      else setItems((its.data ?? []) as unknown as Item[]);
      setLoading(false);
    })();
  }, [id]);

  const discrepancies = items.filter(i => i.difference !== 0).length;

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(t("stock_take_report"), 14, 18);
    doc.setFontSize(10);
    if (take) {
      doc.text(`${t("started_at")}: ${new Date(take.started_at).toLocaleString()}`, 14, 26);
      if (take.completed_at) doc.text(`${t("completed_at")}: ${new Date(take.completed_at).toLocaleString()}`, 14, 32);
    }
    doc.text(`${t("total_products")}: ${items.length}    ${t("discrepancies")}: ${discrepancies}`, 14, 40);
    autoTable(doc, {
      startY: 46,
      head: [["Product", t("system_qty"), t("actual_qty"), t("difference")]],
      body: items.map(i => [i.product_name, i.system_quantity, i.actual_quantity, (i.difference > 0 ? "+" : "") + i.difference]),
    });
    doc.save(`stock-take-${id.slice(0, 8)}.pdf`);
  };

  return (
    <div className="px-5 pt-10 pb-24 space-y-5">
      <Link to="/stock-take" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("stock_take")}
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{t("stock_take_report")}</h1>
        {take && (
          <p className="text-xs text-muted-foreground">{new Date(take.started_at).toLocaleString()}</p>
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
              <p className="text-[10px] uppercase text-muted-foreground">{t("total_products")}</p>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 p-4">
              <p className="text-[10px] uppercase text-muted-foreground">{t("discrepancies")}</p>
              <p className={`text-2xl font-bold ${discrepancies > 0 ? "text-amber-600" : "text-green-600"}`}>{discrepancies}</p>
            </div>
          </div>

          <button
            onClick={exportPdf}
            className="w-full py-3 rounded-2xl bg-card border border-border/60 text-sm font-semibold text-foreground inline-flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <Download className="h-4 w-4" /> {t("export_report")}
          </button>

          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className={`rounded-2xl bg-card border p-3 ${it.difference !== 0 ? "border-amber-300 bg-amber-50/40" : "border-border/60"}`}>
                <p className="text-sm font-semibold text-foreground">{it.product_name}</p>
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
                    <p className={`font-bold ${it.difference < 0 ? "text-red-500" : it.difference > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                      {it.difference > 0 ? "+" : ""}{it.difference}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}