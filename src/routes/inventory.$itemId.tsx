import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2, ImageIcon, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { parseVariants, type InvRow } from "@/lib/inventoryTypes";
import { ProductFormSheet, QtySheet, ConfirmSheet } from "@/components/InventorySheets";

export const Route = createFileRoute("/inventory/$itemId")({ component: InventoryDetail });

type Sheet =
  | { kind: "none" }
  | { kind: "form" }
  | { kind: "restock" }
  | { kind: "remove" }
  | { kind: "delete" };

function InventoryDetail() {
  const { itemId } = Route.useParams();
  const { t } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<InvRow | null>(null);
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
    if (!item) return;
    const prev = item;
    setItem({ ...item, stock: next });
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", item.id);
    if (error) {
      setItem(prev);
      toast.error(error.message);
    } else {
      toast.success(t("stock_updated"));
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
            <span className={`text-2xl font-bold ${item.stock <= 5 ? "text-red-500" : "text-foreground"}`}>
              {item.stock} <span className="text-xs font-normal text-muted-foreground">{formatUnit(item.unit, t)}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSheet({ kind: "remove" })}
              className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98]"
            >
              <Minus className="inline h-3.5 w-3.5 mr-1" />{t("remove")}
            </button>
            <button
              onClick={() => setSheet({ kind: "restock" })}
              className="py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold active:scale-[0.98]"
            >
              <Plus className="inline h-3.5 w-3.5 mr-1" />{t("restock")}
            </button>
          </div>
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