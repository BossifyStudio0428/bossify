import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { toast } from "sonner";

export type EducationDetails = {
  id?: string;
  client_id: string;
  user_id: string;
  course_interest: string | null;
  university_preference: string | null;
  academic_result: string | null;
  family_income: "below_3k" | "3k_5k" | "5k_10k" | "above_10k" | null;
  scholarship_interest: boolean;
  application_status:
    | "not_applied" | "applied" | "interview"
    | "offer_received" | "accepted" | "rejected";
};

const INCOMES: EducationDetails["family_income"][] = ["below_3k", "3k_5k", "5k_10k", "above_10k"];
const STATUSES: EducationDetails["application_status"][] = [
  "not_applied", "applied", "interview", "offer_received", "accepted", "rejected",
];

export const incomeLabelKey = (v: string | null | undefined): TKey | null => {
  if (!v) return null;
  return `edu_income_${v}` as TKey;
};
export const statusLabelKey = (v: string | null | undefined): TKey =>
  `edu_app_${(v ?? "not_applied")}` as TKey;

export function EducationDetailsForm({
  clientId, userId,
}: { clientId: string; userId: string }) {
  const { t } = useI18n();
  const [d, setD] = useState<EducationDetails>({
    client_id: clientId, user_id: userId,
    course_interest: "", university_preference: "", academic_result: "",
    family_income: null, scholarship_interest: false, application_status: "not_applied",
  });
  const [original, setOriginal] = useState<EducationDetails | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("client_education_details")
        .select("*").eq("client_id", clientId).maybeSingle();
      if (data) {
        const row = data as EducationDetails;
        setD(row); setOriginal(row);
      } else {
        setOriginal(null);
      }
    })();
  }, [clientId]);

  const changed = JSON.stringify(d) !== JSON.stringify(original ?? { ...d, id: undefined });

  const save = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId,
      user_id: userId,
      course_interest: (d.course_interest ?? "").trim().slice(0, 500) || null,
      university_preference: (d.university_preference ?? "").trim().slice(0, 500) || null,
      academic_result: (d.academic_result ?? "").trim().slice(0, 200) || null,
      family_income: d.family_income,
      scholarship_interest: !!d.scholarship_interest,
      application_status: d.application_status,
    };
    const { data, error } = await (supabase as any)
      .from("client_education_details")
      .upsert(payload, { onConflict: "client_id" })
      .select("*").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setOriginal(data as EducationDetails);
    setD(data as EducationDetails);
    toast.success(t("customer_updated"));
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1 block">{label}</label>
      {children}
    </div>
  );

  const inputCls = "w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
        🎓 {t("edu_section")}
      </p>
      <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 space-y-3">
        <Field label={`🎓 ${t("edu_course")}`}>
          <input maxLength={500} value={d.course_interest ?? ""} placeholder={t("edu_course_ph")}
            onChange={(e) => setD({ ...d, course_interest: e.target.value })} className={inputCls} />
        </Field>
        <Field label={`🏫 ${t("edu_university")}`}>
          <input maxLength={500} value={d.university_preference ?? ""} placeholder={t("edu_university_ph")}
            onChange={(e) => setD({ ...d, university_preference: e.target.value })} className={inputCls} />
        </Field>
        <Field label={`📊 ${t("edu_result")}`}>
          <input maxLength={200} value={d.academic_result ?? ""} placeholder={t("edu_result_ph")}
            onChange={(e) => setD({ ...d, academic_result: e.target.value })} className={inputCls} />
        </Field>
        <Field label={`💰 ${t("edu_income")}`}>
          <select value={d.family_income ?? ""} onChange={(e) => setD({ ...d, family_income: (e.target.value || null) as any })} className={inputCls}>
            <option value="">—</option>
            {INCOMES.map((i) => i && (
              <option key={i} value={i}>{t(`edu_income_${i}` as TKey)}</option>
            ))}
          </select>
        </Field>
        <Field label={`🏆 ${t("edu_scholarship")}`}>
          <button type="button" onClick={() => setD({ ...d, scholarship_interest: !d.scholarship_interest })}
            className={`w-full text-sm font-semibold px-3 py-2 rounded-xl ${d.scholarship_interest ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
            {d.scholarship_interest ? `✅ ${t("edu_yes")}` : `⭕ ${t("edu_no")}`}
          </button>
        </Field>
        <Field label={`📋 ${t("edu_app_status")}`}>
          <select value={d.application_status} onChange={(e) => setD({ ...d, application_status: e.target.value as any })} className={inputCls}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`edu_app_${s}` as TKey)}</option>
            ))}
          </select>
        </Field>
        {changed && (
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 active:scale-[0.99]">
            {saving ? t("saving") : t("save")}
          </button>
        )}
      </div>
    </section>
  );
}