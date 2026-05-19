import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";

export const Route = createFileRoute("/services-summary")({ component: ServicesSummary });

const SERVICES: { key: string; emoji: string; nameKey: TKey }[] = [
  { key: "hostel",      emoji: "🏠", nameKey: "edu_svc_hostel" },
  { key: "scholarship", emoji: "🏆", nameKey: "edu_svc_scholarship" },
  { key: "ptptn",       emoji: "💳", nameKey: "edu_svc_ptptn" },
  { key: "visa",        emoji: "✈️", nameKey: "edu_svc_visa" },
  { key: "materials",   emoji: "📚", nameKey: "edu_svc_materials" },
  { key: "transport",   emoji: "🚗", nameKey: "edu_svc_transport" },
];

type SvcRow = {
  client_id: string;
  service_type: string;
  is_needed: boolean;
  status: string;
  amount: number | null;
};

function ServicesSummary() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SvcRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, CustomerRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: svc }, { data: cs }] = await Promise.all([
        (supabase as any).from("education_additional_services").select("client_id,service_type,is_needed,status,amount").eq("user_id", user.id).eq("is_needed", true),
        supabase.from("customers").select("*").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setRows((svc ?? []) as SvcRow[]);
      const m: Record<string, CustomerRow> = {};
      for (const c of ((cs ?? []) as CustomerRow[])) m[c.id] = c;
      setCustomers(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/customers" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("services_summary")}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : (
        SERVICES.map((s) => {
          const items = rows.filter((r) => r.service_type === s.key);
          if (items.length === 0) return null;
          const total = items.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
          return (
            <section key={s.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.emoji} {t(s.nameKey)} ({items.length})</p>
                <p className="text-[11px] font-semibold text-primary">{t("total_value")}: RM {total.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/60 shadow-[var(--shadow-card)]">
                {items.map((r) => {
                  const c = customers[r.client_id];
                  if (!c) return null;
                  return (
                    <Link key={`${r.client_id}-${r.service_type}`} to="/customer/$customerId" params={{ customerId: c.id }} hash="services" className="flex items-center gap-3 p-3 active:bg-muted/40">
                      <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">{c.name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t((`edu_svc_status_${r.status}`) as TKey)}{r.amount ? ` · RM ${Number(r.amount).toFixed(2)}` : ""}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      {!loading && rows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10">{t("no_customers")}</p>
      )}
    </div>
  );
}