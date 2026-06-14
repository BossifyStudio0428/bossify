import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  parseSpreadsheet, autoMapHeaders, applyMapping, generateCode,
  FIELD_LABELS, type ImportField, type ParsedSheet, type MappedOrder,
} from "@/lib/importOrders";

export const Route = createFileRoute("/import-orders")({ component: ImportOrdersPage });

type Step = "upload" | "map" | "result";

const FIELDS: ImportField[] = [
  "skip", "code", "customer_name", "phone", "product",
  "quantity", "amount", "status", "notes", "created_at", "cost",
];

function ImportOrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[] } | null>(null);

  const mapped: MappedOrder[] = useMemo(
    () => (parsed ? applyMapping(parsed.rows, mapping) : []),
    [parsed, mapping],
  );

  const validCount = mapped.filter((m) => m._errors.length === 0).length;
  const invalidCount = mapped.length - validCount;

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name);
      const p = await parseSpreadsheet(file);
      if (p.rows.length === 0) {
        toast.error(t("import_file_empty"));
        return;
      }
      if (p.rows.length > 1000) {
        toast.error(t("import_max_rows").replace("{n}", String(p.rows.length)));
        return;
      }
      setParsed(p);
      setMapping(autoMapHeaders(p.headers));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("import_read_failed"));
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const requiredMissing = () => {
    const fields = new Set(Object.values(mapping));
    const missing: string[] = [];
    if (!fields.has("customer_name")) missing.push(FIELD_LABELS.customer_name);
    if (!fields.has("product")) missing.push(FIELD_LABELS.product);
    if (!fields.has("amount")) missing.push(FIELD_LABELS.amount);
    return missing;
  };

  const runImport = async () => {
    if (!user) { toast.error(t("import_not_logged_in")); return; }
    const missing = requiredMissing();
    if (missing.length) {
      toast.error(t("import_please_map").replace("{fields}", missing.join(", ")));
      return;
    }
    const valid = mapped.filter((m) => m._errors.length === 0);
    if (valid.length === 0) { toast.error(t("import_no_valid")); return; }

    setImporting(true);
    let inserted = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    // Fetch existing codes once
    const codes = valid.map((v) => v.code).filter((c): c is string => !!c);
    const existingByCode = new Map<string, string>();
    if (codes.length) {
      const { data: existing } = await supabase
        .from("orders").select("id, code")
        .eq("user_id", user.id).in("code", codes);
      (existing ?? []).forEach((o) => existingByCode.set(o.code, o.id));
    }

    for (const row of valid) {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        customer_name: row.customer_name,
        phone: row.phone,
        product: row.product,
        quantity: row.quantity,
        amount: row.amount,
        status: row.status,
        notes: row.notes,
      };
      if (row.created_at) payload.created_at = row.created_at;
      if (row.cost != null) {
        payload.cost = row.cost;
        payload.gross_profit = row.amount - row.cost;
      }

      const existingId = row.code ? existingByCode.get(row.code) : undefined;
      if (existingId) {
        payload.code = row.code;
        const { error } = await supabase.from("orders").update(payload).eq("id", existingId).eq("user_id", user.id);
        if (error) { errors.push(`Row ${row._rowIndex}: ${error.message}`); skipped++; }
        else updated++;
      } else {
        payload.code = row.code || generateCode();
        const { error } = await supabase.from("orders").insert(payload);
        if (error) { errors.push(`Row ${row._rowIndex}: ${error.message}`); skipped++; }
        else {
          inserted++;
        }
      }
    }

    skipped += invalidCount;
    setResult({ inserted, updated, skipped, errors: errors.slice(0, 10) });
    setStep("result");
    setImporting(false);
  };

  return (
    <div className="px-5 pt-10 pb-8 space-y-5 min-h-screen">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/orders" })} className="p-2 -ml-2 rounded-full active:scale-95" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("import_orders")}
        </h1>
      </header>

      {step === "upload" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("import_upload_hint")}
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-border bg-card p-10 flex flex-col items-center gap-3 active:scale-[0.99] transition"
          >
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {t("import_tap_choose")}
            </p>
            <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv</p>
          </button>
          <input
            ref={fileRef} type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={onPick} className="hidden"
          />
          <div className="rounded-2xl bg-muted/40 border border-border/60 p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground">
              {t("import_tips")}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>{t("import_tip_header")}</li>
              <li>{t("import_tip_required")}</li>
              <li>{t("import_tip_overwrite")}</li>
              <li>{t("import_tip_limit")}</li>
            </ul>
          </div>
        </div>
      )}

      {step === "map" && parsed && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="truncate">{fileName}</span>
            <span>·</span>
            <span>{parsed.rows.length} {t("import_rows")}</span>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("import_match_cols")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("import_match_sub")}
            </p>
            <div className="space-y-2">
              {parsed.headers.map((h) => (
                <div key={h} className="flex items-center gap-2 rounded-xl bg-card border border-border/60 p-3">
                  <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{h || "(blank)"}</span>
                  <span className="text-muted-foreground">→</span>
                  <select
                    value={mapping[h] ?? "skip"}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ImportField }))}
                    className="text-sm bg-muted rounded-lg px-2 py-1.5 border border-border/60"
                  >
                    {FIELDS.map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              {t("import_preview")}
            </h2>
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                ✓ {validCount} {t("import_ready")}
              </span>
              {invalidCount > 0 && (
                <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                  ⚠ {invalidCount} {t("import_will_skip")}
                </span>
              )}
            </div>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="text-xs min-w-full">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">Customer</th>
                    <th className="py-1 pr-3">Product</th>
                    <th className="py-1 pr-3">Qty</th>
                    <th className="py-1 pr-3">Amount</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 10).map((r) => (
                    <tr key={r._rowIndex} className="border-t border-border/40">
                      <td className="py-1.5 pr-3 text-muted-foreground">{r._rowIndex}</td>
                      <td className="py-1.5 pr-3 max-w-[120px] truncate">{r.customer_name || "—"}</td>
                      <td className="py-1.5 pr-3 max-w-[120px] truncate">{r.product || "—"}</td>
                      <td className="py-1.5 pr-3">{r.quantity}</td>
                      <td className="py-1.5 pr-3">{r.amount.toFixed(2)}</td>
                      <td className="py-1.5 pr-3">{r.status}</td>
                      <td className="py-1.5 pr-3">
                        {r._errors.length ? (
                          <span className="text-red-600" title={r._errors.join(", ")}>
                            <AlertTriangle className="h-3.5 w-3.5 inline" />
                          </span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 inline text-emerald-600" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapped.length > 10 && (
                <p className="text-[11px] text-muted-foreground pt-2">
                  + {mapped.length - 10} {t("import_more_rows")}
                </p>
              )}
            </div>
          </section>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setParsed(null); setStep("upload"); }}
              className="flex-1 py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm active:scale-[0.99]"
              disabled={importing}
            >
              {t("cancel")}
            </button>
            <button
              onClick={runImport}
              disabled={importing || validCount === 0}
              className="flex-[2] py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              {importing
                ? t("import_importing")
                : `${t("import_btn")} ${validCount}`}
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-card border border-border/60 p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-foreground">
              {t("import_complete")}
            </h2>
            <div className="flex justify-center gap-4 text-sm pt-2">
              <div><span className="font-bold text-foreground">{result.inserted}</span> <span className="text-muted-foreground">{t("import_new")}</span></div>
              <div><span className="font-bold text-foreground">{result.updated}</span> <span className="text-muted-foreground">{t("import_updated")}</span></div>
              <div><span className="font-bold text-foreground">{result.skipped}</span> <span className="text-muted-foreground">{t("import_skipped")}</span></div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4 space-y-2">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                {t("import_some_errors")}
              </p>
              <ul className="text-xs text-red-700 dark:text-red-400 space-y-1">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
          <button
            onClick={() => navigate({ to: "/orders" })}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-sm active:scale-[0.99]"
          >
            {t("import_back_orders")}
          </button>
        </div>
      )}
    </div>
  );
}