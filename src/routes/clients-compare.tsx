import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { toast } from "sonner";
import {
  incomeLabelKey, statusLabelKey, type EducationDetails,
} from "@/components/EducationDetailsForm";

export const Route = createFileRoute("/clients-compare")({ component: ComparePage });

function ComparePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [details, setDetails] = useState<Record<string, EducationDetails | null>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase.from("customers").select("*").order("name");
      const list = (cs ?? []) as CustomerRow[];
      setCustomers(list);
      if (list.length) {
        const ids = list.map((c) => c.id);
        const { data: ds } = await (supabase as any)
          .from("client_education_details").select("*").in("client_id", ids);
        const map: Record<string, EducationDetails | null> = {};
        for (const d of (ds ?? []) as EducationDetails[]) map[d.client_id] = d;
        setDetails(map);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) { toast.error("Max 3"); return prev; }
      return [...prev, id];
    });
  };

  const picked = useMemo(
    () => selected.map((id) => customers.find((c) => c.id === id)).filter(Boolean) as CustomerRow[],
    [selected, customers],
  );

  const rows: { key: TKey; render: (c: CustomerRow) => string }[] = [
    { key: "edu_field_course",      render: (c) => details[c.id]?.course_interest || "—" },
    { key: "edu_field_university",  render: (c) => details[c.id]?.university_preference || "—" },
    { key: "edu_field_result",      render: (c) => details[c.id]?.academic_result || "—" },
    { key: "edu_field_income",      render: (c) => { const k = incomeLabelKey(details[c.id]?.family_income ?? null); return k ? t(k) : "—"; } },
    { key: "edu_field_scholarship", render: (c) => details[c.id]?.scholarship_interest ? `✅ ${t("edu_yes")}` : `⭕ ${t("edu_no")}` },
    { key: "edu_field_status",      render: (c) => t(statusLabelKey(details[c.id]?.application_status)) },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/customers" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("edu_compare")}</h1>
      </div>
      <p className="text-xs text-muted-foreground">{t("edu_compare_pick")}</p>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">{t("loading")}</p>}
        {customers.map((c) => {
          const isSel = selected.includes(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border ${isSel ? "border-primary bg-primary/5" : "border-border/60 bg-card"} active:scale-[0.99]`}>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                {isSel && <span className="text-[10px]">✓</span>}
              </div>
              <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm font-semibold text-foreground flex-1 text-left truncate">{c.name}</p>
            </button>
          );
        })}
      </div>

      {picked.length >= 2 ? (
        <section className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            {t("edu_compare")}
          </p>
          <div className="overflow-x-auto rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-3 py-2 font-semibold">Field</th>
                  {picked.map((c) => (
                    <th key={c.id} className="text-left px-3 py-2 font-semibold">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-border/60">
                    <td className="px-3 py-2 font-semibold text-muted-foreground">{t(r.key)}</td>
                    {picked.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-foreground">{r.render(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">{t("edu_compare_min")}</p>
      )}
    </div>
  );
}