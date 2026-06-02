import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/renewal/$id")({ component: RenewalEditor });

type Customer = { id: string; name: string };
type ReminderType = "insurance" | "tenancy" | "others";
type Status = "active" | "renewed" | "expired";

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function RenewalEditor() {
  const { id } = useParams({ from: "/renewal/$id" });
  const isNew = id === "new";
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [reminderType, setReminderType] = useState<ReminderType>("insurance");
  const [policyNumber, setPolicyNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState<string>(todayDateInput());
  const [remindDays, setRemindDays] = useState<string>("30");
  const [status, setStatus] = useState<Status>("active");
  const [notes, setNotes] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customers")
      .select("id,name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [user?.id]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("renewal_reminders" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setCustomerId(r.customer_id ?? "");
        setReminderType((r.reminder_type as ReminderType) ?? "insurance");
        setPolicyNumber(r.policy_number ?? "");
        setExpiryDate(r.expiry_date ?? todayDateInput());
        setRemindDays(String(r.remind_days_before ?? 30));
        setStatus((r.status as Status) ?? "active");
        setNotes(r.notes ?? "");
      }
      setLoading(false);
    })();
  }, [id, isNew, user?.id]);

  const save = async (overrides?: Partial<{ status: Status }>) => {
    if (!user) return;
    if (!customerId) { toast.error(t("fld_select_client")); return; }
    if (!expiryDate) { toast.error(t("fld_expiry_date")); return; }
    setSaving(true);
    const payload: any = {
      customer_id: customerId,
      reminder_type: reminderType,
      policy_number: policyNumber.trim() || null,
      expiry_date: expiryDate,
      remind_days_before: Math.max(0, Number(remindDays) || 0),
      status: overrides?.status ?? status,
      notes: notes.trim() || null,
    };
    const res = isNew
      ? await supabase.from("renewal_reminders" as never).insert({ ...payload, user_id: user.id } as never)
      : await supabase.from("renewal_reminders" as never).update(payload as never).eq("id", id);
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(t("renewal_saved"));
    navigate({ to: "/renewals" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_renewal_confirm"))) return;
    const { error } = await supabase.from("renewal_reminders" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("renewal_deleted"));
    navigate({ to: "/renewals" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const inputCls = "w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary";
  const labelCls = "text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1";

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/renewals" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_renewal" : "edit_renewal")}</h1>
        {!isNew && (
          <button onClick={remove} className="ml-auto p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_client")}</p>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_reminder_type")}</p>
        <div className="grid grid-cols-3 gap-2">
          {(["insurance", "tenancy", "others"] as ReminderType[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setReminderType(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${reminderType === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {t(v === "tenancy" ? "rr_type_tenancy" : v === "others" ? "rr_type_others" : "rr_type_insurance")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_policy_number")}</p>
        <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_expiry_date")}</p>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_remind_days_before")}</p>
        <input type="number" min={0} value={remindDays} onChange={(e) => setRemindDays(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_status")}</p>
        <div className="grid grid-cols-3 gap-2">
          {(["active", "renewed", "expired"] as Status[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${status === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {t(v === "renewed" ? "rr_status_renewed" : v === "expired" ? "rr_status_expired" : "rr_status_active")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("notes")}</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      {status !== "renewed" && (
        <button
          onClick={() => { setStatus("renewed"); save({ status: "renewed" }); }}
          className="w-full py-2.5 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold active:scale-[0.99] transition-transform"
        >
          ✓ {t("mark_renewed")}
        </button>
      )}

      <button
        onClick={() => save()}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}