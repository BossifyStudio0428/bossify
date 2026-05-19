import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { toast } from "sonner";

type SvcType = "hostel" | "scholarship" | "ptptn" | "visa" | "materials" | "transport";
type SvcStatus = "pending" | "applied" | "approved" | "rejected" | "completed";

type SvcRow = {
  id?: string;
  client_id: string;
  user_id: string;
  service_type: SvcType;
  is_needed: boolean;
  status: SvcStatus;
  service_date: string | null;
  amount: number;
  notes: string | null;
};

const SERVICES: { key: SvcType; emoji: string; nameKey: TKey }[] = [
  { key: "hostel",      emoji: "🏠", nameKey: "edu_svc_hostel" },
  { key: "scholarship", emoji: "🏆", nameKey: "edu_svc_scholarship" },
  { key: "ptptn",       emoji: "💳", nameKey: "edu_svc_ptptn" },
  { key: "visa",        emoji: "✈️", nameKey: "edu_svc_visa" },
  { key: "materials",   emoji: "📚", nameKey: "edu_svc_materials" },
  { key: "transport",   emoji: "🚗", nameKey: "edu_svc_transport" },
];

const STATUSES: SvcStatus[] = ["pending", "applied", "approved", "rejected", "completed"];

export function AdditionalServices({ clientId, userId }: { clientId: string; userId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<SvcType, SvcRow>>({} as any);
  const [open, setOpen] = useState<SvcType | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("education_additional_services")
        .select("*").eq("client_id", clientId);
      const map = {} as Record<SvcType, SvcRow>;
      for (const r of (data ?? []) as SvcRow[]) map[r.service_type] = r;
      setRows(map);
    })();
  }, [clientId]);

  const upsert = async (type: SvcType, patch: Partial<SvcRow>) => {
    const existing = rows[type];
    const next: any = {
      ...(existing ?? {}),
      client_id: clientId,
      user_id: userId,
      service_type: type,
      is_needed: existing?.is_needed ?? false,
      status: existing?.status ?? "pending",
      amount: existing?.amount ?? 0,
      ...patch,
    };
    const { data, error } = await (supabase as any)
      .from("education_additional_services")
      .upsert(next, { onConflict: "client_id,service_type" })
      .select("*").single();
    if (error) { toast.error(error.message); return; }
    setRows((m) => ({ ...m, [type]: data as SvcRow }));
  };

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
        ✨ {t("edu_additional_services")}
      </p>
      <ul className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
        {SERVICES.map((s) => {
          const r = rows[s.key];
          const needed = !!r?.is_needed;
          const isOpen = open === s.key;
          return (
            <li key={s.key} className="p-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => upsert(s.key, { is_needed: !needed })}
                  className={`h-6 w-10 rounded-full p-0.5 transition-colors shrink-0 ${needed ? "bg-primary" : "bg-muted"}`}
                  aria-label="toggle"
                >
                  <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${needed ? "translate-x-4" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(isOpen ? null : s.key)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm font-semibold truncate">{s.emoji} {t(s.nameKey)}</p>
                  {needed && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t((`edu_svc_status_${r?.status ?? "pending"}`) as TKey)}
                      {r?.amount ? ` · RM ${Number(r.amount).toFixed(2)}` : ""}
                    </p>
                  )}
                </button>
              </div>
              {isOpen && needed && (
                <div className="mt-3 pl-13 space-y-2 grid grid-cols-2 gap-2">
                  <select
                    value={r?.status ?? "pending"}
                    onChange={(e) => upsert(s.key, { status: e.target.value as SvcStatus })}
                    className="col-span-2 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>{t((`edu_svc_status_${st}`) as TKey)}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={r?.service_date ?? ""}
                    onChange={(e) => upsert(s.key, { service_date: e.target.value || null })}
                    className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs"
                  />
                  <input
                    type="number" min={0} step="0.01"
                    placeholder="RM"
                    defaultValue={r?.amount ?? 0}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if ((r?.amount ?? 0) !== v) upsert(s.key, { amount: v });
                    }}
                    className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs"
                  />
                  <textarea
                    defaultValue={r?.notes ?? ""}
                    placeholder={t("notes")}
                    rows={2}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if ((r?.notes ?? "") !== v) upsert(s.key, { notes: v || null });
                    }}
                    className="col-span-2 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
