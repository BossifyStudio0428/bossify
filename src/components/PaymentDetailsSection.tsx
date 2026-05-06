import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

const PAYMENT_TYPES = ["DuitNow", "Bank Transfer", "TNG eWallet", "ShopeePay", "Other"];

type Method = { type: string; number: string; name: string };
const empty: Method = { type: "", number: "", name: "" };

export default function PaymentDetailsSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [m1, setM1] = useState<Method>(empty);
  const [m2, setM2] = useState<Method>(empty);
  const [show2, setShow2] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_2_type,payment_method_2_number,payment_method_2_name")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setM1({ type: data.payment_method_1_type ?? "", number: data.payment_method_1_number ?? "", name: data.payment_method_1_name ?? "" });
        const has2 = !!(data.payment_method_2_type || data.payment_method_2_number);
        setShow2(has2);
        setM2({ type: data.payment_method_2_type ?? "", number: data.payment_method_2_number ?? "", name: data.payment_method_2_name ?? "" });
      }
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      payment_method_1_type: m1.type || null,
      payment_method_1_number: m1.number || null,
      payment_method_1_name: m1.name || null,
      payment_method_2_type: show2 ? (m2.type || null) : null,
      payment_method_2_number: show2 ? (m2.number || null) : null,
      payment_method_2_name: show2 ? (m2.name || null) : null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("pay_saved"));
  };

  const renderMethod = (label: string, m: Method, set: (m: Method) => void) => (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</p>
      <select
        value={m.type}
        onChange={(e) => set({ ...m, type: e.target.value })}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground"
      >
        <option value="">— {t("pay_method")} —</option>
        {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input
        value={m.number}
        onChange={(e) => set({ ...m, number: e.target.value })}
        placeholder={t("pay_account_no")}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70"
      />
      <input
        value={m.name}
        onChange={(e) => set({ ...m, name: e.target.value })}
        placeholder={t("pay_account_name")}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70"
      />
    </div>
  );

  return (
    <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">💳 {t("pay_details")}</h2>
      {renderMethod(`${t("pay_method")} 1`, m1, setM1)}
      {show2 ? (
        renderMethod(`${t("pay_method")} 2`, m2, setM2)
      ) : (
        <button
          type="button"
          onClick={() => setShow2(true)}
          className="w-full py-2.5 rounded-2xl border border-dashed border-border text-xs font-semibold text-muted-foreground"
        >
          + {t("pay_add_method")}
        </button>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm disabled:opacity-60"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </section>
  );
}
