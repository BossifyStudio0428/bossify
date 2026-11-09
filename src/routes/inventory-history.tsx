import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

type LogRow = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  source: string;
  changed_at: string;
};

export const Route = createFileRoute("/inventory-history")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: HistoryPage,
});

const SOURCE_LABEL: Record<string, Record<string, string>> = {
  manual_edit: { zh: "手动编辑", ms: "Edit manual", en: "Manual edit" },
  quick_adjust: { zh: "快速加减", ms: "Laras pantas", en: "Quick adjust" },
  products_tab_adjust: { zh: "产品页快速加减", ms: "Laras pantas (Produk)", en: "Quick adjust (Products)" },
  stock_tab_adjust: { zh: "库存页快速加减", ms: "Laras pantas (Stok)", en: "Quick adjust (Stock)" },
  receive_stock: { zh: "收货", ms: "Terima stok", en: "Receive stock" },
  supplier_refund: { zh: "退货给供应商", ms: "Pulang kepada pembekal", en: "Supplier refund" },
  stock_take: { zh: "盘点", ms: "Kiraan stok", en: "Stock take" },
  refund_restock: { zh: "顾客退款补回库存", ms: "Bayaran balik pelanggan", en: "Customer refund restock" },
  purchase_order_received: { zh: "采购单收货", ms: "PO diterima", en: "Purchase order received" },
};

const FIELD_LABEL: Record<string, Record<string, string>> = {
  cost_price: { zh: "成本价", ms: "Kos", en: "Cost price" },
  price: { zh: "售价", ms: "Harga", en: "Price" },
  stock: { zh: "库存", ms: "Stok", en: "Stock" },
};

function HistoryPage() {
  const { id: itemId } = Route.useSearch();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("inventory_audit_log" as any)
        .select("id,field_name,old_value,new_value,source,changed_at,product_name")
        .eq("product_id", itemId)
        .order("changed_at", { ascending: false })
        .limit(200);
      const list = (data ?? []) as any[];
      setRows(list);
      if (list[0]) setProductName(list[0].product_name);
      setLoading(false);
    })();
  }, [itemId]);

  const title = lang === "zh" ? "变更记录" : lang === "ms" ? "Sejarah Perubahan" : "Change History";

  return (
    <div className="px-4 pt-4 pb-24 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate({ to: "/inventory" })} className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
          {productName && <p className="text-xs text-muted-foreground">{productName}</p>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {lang === "zh" ? "还没有任何变更记录" : lang === "ms" ? "Tiada sejarah lagi" : "No changes recorded yet"}
        </p>
      ) : (
        <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
          {rows.map((r) => {
            const fieldLabel = FIELD_LABEL[r.field_name]?.[lang] ?? FIELD_LABEL[r.field_name]?.en ?? r.field_name;
            const sourceLabel = SOURCE_LABEL[r.source]?.[lang] ?? SOURCE_LABEL[r.source]?.en ?? r.source;
            return (
              <div key={r.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{fieldLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(r.changed_at).toLocaleString("en-MY")}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.old_value ?? "—"} → <span className="font-semibold text-foreground">{r.new_value ?? "—"}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{sourceLabel}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}