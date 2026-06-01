import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, X, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { SheetShell, ConfirmSheet } from "@/components/InventorySheets";

export const Route = createFileRoute("/stock-take")({ component: StockTakePage });

type StockTake = {
  id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  notes: string | null;
};

type InvItem = { id: string; name: string; stock: number; image_url: string | null };
type CountRow = { inventory_id: string; product_name: string; system_quantity: number; actual_quantity: number | ""; };

function StockTakePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: btLoading } = useBusinessType();
  const navigate = useNavigate();
  const allowed = bizType === "retail" || bizType === "fnb";

  const [takes, setTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(false);
  const [rows, setRows] = useState<CountRow[]>([]);
  const [confirmDone, setConfirmDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!btLoading && !allowed) navigate({ to: "/inventory" });
  }, [btLoading, allowed, navigate]);

  const load = async () => {
    const { data, error } = await supabase
      .from("stock_takes" as any)
      .select("*")
      .order("started_at", { ascending: false });
    if (error) toast.error(error.message);
    setTakes(((data ?? []) as unknown) as StockTake[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const startNew = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("inventory")
      .select("id, name, stock, image_url")
      .order("name", { ascending: true });
    if (error) { toast.error(error.message); return; }
    const items = (data ?? []) as InvItem[];
    setRows(items.map(i => ({
      inventory_id: i.id,
      product_name: i.name,
      system_quantity: i.stock ?? 0,
      actual_quantity: i.stock ?? 0,
    })));
    setCounting(true);
  };

  const updateActual = (idx: number, v: string) => {
    const n = v === "" ? "" : Math.max(0, parseInt(v, 10) || 0);
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, actual_quantity: n } : r));
  };

  const completeTake = async () => {
    if (!user) return;
    setSaving(true);
    const { data: takeData, error: e1 } = await supabase
      .from("stock_takes" as any)
      .insert({ user_id: user.id, status: "completed", completed_at: new Date().toISOString() })
      .select()
      .single();
    if (e1 || !takeData) { setSaving(false); toast.error(e1?.message ?? "Failed"); return; }
    const takeId = (takeData as any).id as string;

    const items = rows.map(r => {
      const actual = typeof r.actual_quantity === "number" ? r.actual_quantity : r.system_quantity;
      return {
        stock_take_id: takeId,
        inventory_id: r.inventory_id,
        product_name: r.product_name,
        system_quantity: r.system_quantity,
        actual_quantity: actual,
        difference: actual - r.system_quantity,
      };
    });
    if (items.length > 0) {
      const { error: e2 } = await supabase.from("stock_take_items" as any).insert(items);
      if (e2) { setSaving(false); toast.error(e2.message); return; }
    }
    // Update inventory quantities to actual
    for (const r of rows) {
      const actual = typeof r.actual_quantity === "number" ? r.actual_quantity : r.system_quantity;
      if (actual !== r.system_quantity) {
        await supabase.from("inventory").update({ stock: actual }).eq("id", r.inventory_id);
      }
    }
    setSaving(false);
    setConfirmDone(false);
    setCounting(false);
    toast.success(t("stock_take_completed"));
    load();
    navigate({ to: "/stock-take/$id", params: { id: takeId } });
  };

  if (!allowed) return null;

  if (counting) {
    return (
      <div className="px-5 pt-10 pb-32 space-y-4">
        <button onClick={() => setCounting(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("back")}
        </button>
        <h1 className="text-2xl font-bold text-foreground">{t("start_stock_take")}</h1>
        {rows.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">{t("no_products")}</p>}
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const actual = typeof r.actual_quantity === "number" ? r.actual_quantity : r.system_quantity;
            const diff = actual - r.system_quantity;
            return (
              <div key={r.inventory_id} className="rounded-2xl bg-card border border-border/60 p-3 space-y-2">
                <p className="text-sm font-semibold text-foreground">{r.product_name}</p>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("system_qty")}</p>
                    <p className="text-base font-semibold">{r.system_quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("actual_qty")}</p>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={r.actual_quantity}
                      onChange={(e) => updateActual(idx, e.target.value)}
                      className="w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("difference")}</p>
                    <p className={`text-base font-bold ${diff < 0 ? "text-red-500" : diff > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                      {diff > 0 ? "+" : ""}{diff}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {rows.length > 0 && (
          <div className="fixed bottom-20 left-0 right-0 px-5 z-30">
            <div className="mx-auto max-w-[360px]">
              <button
                onClick={() => setConfirmDone(true)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold shadow-[var(--shadow-soft)] active:scale-[0.99]"
              >
                {t("complete_stock_take")}
              </button>
            </div>
          </div>
        )}
        {confirmDone && (
          <ConfirmSheet
            title={t("complete_stock_take_confirm")}
            onClose={() => setConfirmDone(false)}
            onConfirm={completeTake}
            confirmLabel={t("complete_stock_take")}
            variant="primary"
          />
        )}
        {saving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative">
      <Link to="/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("inventory")}
      </Link>
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("stock_take")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">{takes.length}</span>
      </header>

      <button
        onClick={startNew}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" /> {t("start_stock_take")}
      </button>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && takes.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10">{t("no_stock_takes")}</p>
      )}

      <div className="space-y-2">
        {takes.map((tk) => (
          <Link
            key={tk.id}
            to="/stock-take/$id"
            params={{ id: tk.id }}
            className="block rounded-2xl bg-card border border-border/60 p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  {new Date(tk.started_at).toLocaleString()}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${tk.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {tk.status === "completed" ? t("stock_take_done") : t("stock_take_in_progress")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}