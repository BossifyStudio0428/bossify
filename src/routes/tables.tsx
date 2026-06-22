import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2, QrCode, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getPublicOrigin } from "@/lib/publicUrl";

export const Route = createFileRoute("/tables")({ component: TablesPage });

type TableRow = { id: string; label: string; seats: number | null; active: boolean };

function TablesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulk, setBulk] = useState("5");
  const [qrFor, setQrFor] = useState<TableRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("restaurant_tables" as any)
      .select("id,label,seats,active")
      .eq("user_id", user.id)
      .order("label");
    if (error) { toast.error(error.message); return; }
    setRows((data as any) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function bulkAdd() {
    if (!user) return;
    const n = Math.max(1, Math.min(200, parseInt(bulk, 10) || 0));
    if (!n) return;
    const existing = new Set(rows.map(r => r.label.toLowerCase()));
    const toInsert: { user_id: string; label: string }[] = [];
    let i = 1;
    while (toInsert.length < n) {
      const label = `Table ${i}`;
      if (!existing.has(label.toLowerCase())) toInsert.push({ user_id: user.id, label });
      i++;
      if (i > 1000) break;
    }
    const { error } = await supabase.from("restaurant_tables" as any).insert(toInsert);
    if (error) { toast.error(error.message); return; }
    toast.success(t("saved"));
    load();
  }

  async function addOne() {
    if (!user) return;
    const label = (rows.length + 1).toString();
    const { error } = await supabase
      .from("restaurant_tables" as any)
      .insert({ user_id: user.id, label: `Table ${label}` });
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function rename(row: TableRow, label: string) {
    const { error } = await supabase
      .from("restaurant_tables" as any)
      .update({ label })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else setRows(r => r.map(x => x.id === row.id ? { ...x, label } : x));
  }

  async function remove(row: TableRow) {
    if (!confirm(`Delete ${row.label}?`)) return;
    const { error } = await supabase.from("restaurant_tables" as any).delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else setRows(r => r.filter(x => x.id !== row.id));
  }

  async function toggleActive(row: TableRow) {
    const { error } = await supabase
      .from("restaurant_tables" as any)
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else setRows(r => r.map(x => x.id === row.id ? { ...x, active: !row.active } : x));
  }

  const origin = getPublicOrigin();

  function printAll() {
    const w = window.open("", "_blank");
    if (!w) return;
    const cards = rows.map(r => {
      const url = `${origin}/dine/${r.id}`;
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
      return `<div style="page-break-inside:avoid;text-align:center;padding:24px;border:1px dashed #999;margin:8px;display:inline-block;width:300px;vertical-align:top">
        <div style="font-size:22px;font-weight:700;margin-bottom:8px">${r.label}</div>
        <img src="${qr}" width="260" height="260" />
        <div style="font-size:12px;margin-top:8px;color:#555">${t("scan_to_order")}</div>
      </div>`;
    }).join("");
    w.document.write(`<html><head><title>QR Codes</title></head><body style="font-family:sans-serif">${cards}<script>setTimeout(()=>window.print(),500)</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95"
          aria-label="Back"
        ><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <h1 className="text-lg font-bold">🍱 {t("manage_tables")}</h1>
          <p className="text-[11px] text-muted-foreground">{t("scan_to_order")}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-border/60 p-4 bg-card space-y-3">
        <div className="text-sm font-medium">{t("bulk_add")}</div>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={200}
            value={bulk}
            onChange={e => setBulk(e.target.value)}
            className="w-24 h-10 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button onClick={bulkAdd} className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95">
            {t("add_n_tables").replace("{n}", bulk)}
          </button>
        </div>
        {rows.length > 0 && (
          <button onClick={printAll} className="w-full h-10 rounded-lg border border-border text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
            <Printer className="h-4 w-4" /> {t("print_qrs")}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {loading && <div className="text-sm text-muted-foreground">…</div>}
        {!loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">—</div>
        )}
        {rows.map(row => (
          <div key={row.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center gap-2">
            <input
              defaultValue={row.label}
              onBlur={e => { if (e.target.value !== row.label) rename(row, e.target.value); }}
              className="flex-1 h-9 rounded-lg border border-border/40 bg-background px-2 text-sm"
            />
            <button onClick={() => toggleActive(row)} className={`px-2 h-9 rounded-lg text-[11px] font-semibold ${row.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              {row.active ? "ON" : "OFF"}
            </button>
            <button onClick={() => setQrFor(row)} className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center" aria-label="QR">
              <QrCode className="h-4 w-4" />
            </button>
            <button onClick={() => remove(row)} className="h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={addOne} className="w-full h-11 rounded-xl border border-dashed border-border/80 text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
          <Plus className="h-4 w-4" /> {t("add_table")}
        </button>
      </div>

      {qrFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setQrFor(null)}>
          <div className="bg-card rounded-2xl p-6 max-w-xs w-full text-center space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-base font-bold">{qrFor.label}</div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(`${origin}/dine/${qrFor.id}`)}`}
              alt="QR" className="mx-auto rounded-lg"
            />
            <div className="text-[11px] text-muted-foreground break-all">{`${origin}/dine/${qrFor.id}`}</div>
            <button onClick={() => setQrFor(null)} className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}