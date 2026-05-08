import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

const PAYMENT_TYPES = ["DuitNow", "Bank Transfer", "TNG eWallet", "ShopeePay", "Other"];

type Method = { type: string; number: string; name: string; qr_url: string };
const empty: Method = { type: "", number: "", name: "", qr_url: "" };

export default function PaymentDetailsSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [m1, setM1] = useState<Method>(empty);
  const [m2, setM2] = useState<Method>(empty);
  const [show2, setShow2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<1 | 2 | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_qr_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setM1({ type: data.payment_method_1_type ?? "", number: data.payment_method_1_number ?? "", name: data.payment_method_1_name ?? "", qr_url: data.payment_method_1_qr_url ?? "" });
        const has2 = !!(data.payment_method_2_type || data.payment_method_2_number || data.payment_method_2_qr_url);
        setShow2(has2);
        setM2({ type: data.payment_method_2_type ?? "", number: data.payment_method_2_number ?? "", name: data.payment_method_2_name ?? "", qr_url: data.payment_method_2_qr_url ?? "" });
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
      payment_method_1_qr_url: m1.qr_url || null,
      payment_method_2_type: show2 ? (m2.type || null) : null,
      payment_method_2_number: show2 ? (m2.number || null) : null,
      payment_method_2_name: show2 ? (m2.name || null) : null,
      payment_method_2_qr_url: show2 ? (m2.qr_url || null) : null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("pay_saved"));
  };

  const uploadQr = async (slot: 1 | 2, file: File, m: Method, set: (m: Method) => void) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t("photo_max_5mb")); return; }
    setUploading(slot);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/qr-${slot}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("payment-qr").upload(path, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploading(null); return; }
    const { data: pub } = supabase.storage.from("payment-qr").getPublicUrl(path);
    const url = pub.publicUrl;
    set({ ...m, qr_url: url });
    const col = slot === 1 ? "payment_method_1_qr_url" : "payment_method_2_qr_url";
    await supabase.from("profiles").update({ [col]: url }).eq("id", user.id);
    setUploading(null);
    toast.success(t("qr_uploaded"));
  };

  const removeQr = async (slot: 1 | 2, m: Method, set: (m: Method) => void) => {
    if (!user) return;
    set({ ...m, qr_url: "" });
    const col = slot === 1 ? "payment_method_1_qr_url" : "payment_method_2_qr_url";
    await supabase.from("profiles").update({ [col]: null }).eq("id", user.id);
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
      <QrUploader
        value={m.qr_url}
        uploading={uploading === (label.endsWith("1") ? 1 : 2)}
        onPick={(file) => uploadQr(label.endsWith("1") ? 1 : 2, file, m, set)}
        onRemove={() => removeQr(label.endsWith("1") ? 1 : 2, m, set)}
        t={t}
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

function QrUploader({
  value, uploading, onPick, onRemove, t,
}: {
  value: string;
  uploading: boolean;
  onPick: (f: File) => void;
  onRemove: () => void;
  t: (k: any) => string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative">
          <img src={value} alt="QR" className="h-16 w-16 rounded-xl object-cover border border-border/60" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="px-3 py-2 rounded-xl bg-card border border-border/60 text-xs font-semibold text-foreground disabled:opacity-60"
        >
          📷 {uploading ? t("uploading_qr") : t("upload_qr")}
        </button>
        {value ? (
          <button
            type="button"
            onClick={onRemove}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-destructive"
          >
            {t("remove_qr")}
          </button>
        ) : null}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
