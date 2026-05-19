import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

const PAYMENT_TYPES = ["DuitNow", "Bank Transfer", "TNG eWallet", "ShopeePay", "Other"];

type Method = { type: string; number: string; name: string; bank: string; qr_url: string };
const empty: Method = { type: "", number: "", name: "", bank: "", qr_url: "" };

function hasMethod(m: Method) {
  return !!(m.type || m.number || m.name || m.bank || m.qr_url);
}

// Returns translation key of error, or "" if valid / empty
function validateNumber(type: string, raw: string): string {
  const v = (raw || "").replace(/[\s-]/g, "");
  if (!v) return "";
  const isPhone = /^(01\d{8,9})$/.test(v); // Malaysian mobile: 01X + 8-9 digits
  const isIC = /^\d{12}$/.test(v);
  switch (type) {
    case "DuitNow":
      // DuitNow accepts phone or IC (or business reg)
      if (!isPhone && !isIC) return "pay_invalid_duitnow";
      return "";
    case "TNG eWallet":
    case "ShopeePay":
      if (!isPhone) return "pay_invalid_phone";
      return "";
    case "Bank Transfer":
      if (!/^\d{6,20}$/.test(v)) return "pay_invalid_account";
      return "";
    default:
      return "";
  }
}

export default function PaymentDetailsSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [m1, setM1] = useState<Method>(empty);
  const [m2, setM2] = useState<Method>(empty);
  const [show2, setShow2] = useState(false);
  const [editingSlot, setEditingSlot] = useState<1 | 2 | null>(1);
  const [menuSlot, setMenuSlot] = useState<1 | 2 | null>(null);
  const [deleteSlot, setDeleteSlot] = useState<1 | 2 | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<1 | 2 | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_bank,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_bank,payment_method_2_qr_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        const next1 = { type: d.payment_method_1_type ?? "", number: d.payment_method_1_number ?? "", name: d.payment_method_1_name ?? "", bank: d.payment_method_1_bank ?? "", qr_url: d.payment_method_1_qr_url ?? "" };
        const next2 = { type: d.payment_method_2_type ?? "", number: d.payment_method_2_number ?? "", name: d.payment_method_2_name ?? "", bank: d.payment_method_2_bank ?? "", qr_url: d.payment_method_2_qr_url ?? "" };
        setM1(next1);
        setM2(next2);
        setShow2(hasMethod(next2));
        setEditingSlot(hasMethod(next1) || hasMethod(next2) ? null : 1);
      }
    })();
  }, [user]);

  const persist = async (nextM1 = m1, nextM2 = m2, nextShow2 = show2) => {
    if (!user) return false;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      payment_method_1_type: nextM1.type || null,
      payment_method_1_number: nextM1.number || null,
      payment_method_1_name: nextM1.name || null,
      payment_method_1_bank: nextM1.bank || null,
      payment_method_1_qr_url: nextM1.qr_url || null,
      payment_method_2_type: nextShow2 ? (nextM2.type || null) : null,
      payment_method_2_number: nextShow2 ? (nextM2.number || null) : null,
      payment_method_2_name: nextShow2 ? (nextM2.name || null) : null,
      payment_method_2_bank: nextShow2 ? (nextM2.bank || null) : null,
      payment_method_2_qr_url: nextShow2 ? (nextM2.qr_url || null) : null,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  };

  const save = async () => {
    const activeM = editingSlot === 2 ? m2 : m1;
    const err = validateNumber(activeM.type, activeM.number);
    if (err) {
      toast.error(t(err as any));
      return;
    }
    const ok = await persist();
    if (!ok) return;
    const nextShow2 = hasMethod(m2);
    setShow2(nextShow2);
    setEditingSlot(hasMethod(m1) || nextShow2 ? null : 1);
    toast.success(t("pay_saved"));
  };

  const startAdd = () => {
    setShow2(true);
    setM2(empty);
    setEditingSlot(2);
    setMenuSlot(null);
  };

  const confirmDelete = async () => {
    if (!deleteSlot) return;
    const nextM1 = deleteSlot === 1 && hasMethod(m2) ? m2 : deleteSlot === 1 ? empty : m1;
    const nextM2 = deleteSlot === 1 ? empty : empty;
    const nextShow2 = false;
    const ok = await persist(nextM1, nextM2, nextShow2);
    if (!ok) return;
    setM1(nextM1);
    setM2(nextM2);
    setShow2(nextShow2);
    setEditingSlot(hasMethod(nextM1) ? null : 1);
    setMenuSlot(null);
    setDeleteSlot(null);
    toast.success(t("payment_deleted"));
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
    const next = { ...m, qr_url: url };
    set(next);
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

  const renderForm = (slot: 1 | 2, label: string, m: Method, set: (m: Method) => void) => {
    const numberError = validateNumber(m.type, m.number);
    return (
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
        inputMode={m.type === "Bank Transfer" ? "numeric" : "tel"}
        className={`w-full rounded-2xl bg-card border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 ${numberError ? "border-destructive" : "border-border/60"}`}
      />
      {numberError ? (
        <p className="text-[11px] text-destructive px-1">{t(numberError as any)}</p>
      ) : null}
      <input
        value={m.name}
        onChange={(e) => set({ ...m, name: e.target.value })}
        placeholder={t("pay_account_name")}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70"
      />
      {m.type === "Bank Transfer" ? (
        <input
          value={m.bank}
          onChange={(e) => set({ ...m, bank: e.target.value })}
          placeholder={t("pay_bank_name")}
          className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70"
        />
      ) : null}
      <QrUploader
        value={m.qr_url}
        uploading={uploading === slot}
        onPick={(file) => uploadQr(slot, file, m, set)}
        onRemove={() => removeQr(slot, m, set)}
        t={t}
      />
      <div className="flex gap-2 pt-2">
        {(hasMethod(m1) || hasMethod(m2)) && (
          <button
            type="button"
            onClick={() => {
              if (slot === 2 && !hasMethod(m)) setShow2(false);
              setEditingSlot(null);
            }}
            className="flex-1 py-3 rounded-2xl bg-muted text-muted-foreground font-bold text-sm"
          >
            {t("cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !!numberError}
          className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm disabled:opacity-60"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
    );
  };

  const renderCard = (slot: 1 | 2, m: Method) => {
    if (!hasMethod(m)) return null;
    return (
      <div className="relative rounded-2xl border border-border/60 bg-background/40 p-3 flex gap-3">
        {m.qr_url ? <img src={m.qr_url} alt="QR" className="h-16 w-16 rounded-xl object-cover border border-border/60 shrink-0" /> : <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">💳</div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{m.type || t("pay_method")}</p>
          {m.number ? <p className="text-sm text-foreground mt-1 break-all">{m.number}</p> : null}
          {m.bank ? <p className="text-xs text-muted-foreground mt-1 truncate">🏦 {m.bank}</p> : null}
          {m.name ? <p className="text-xs text-muted-foreground mt-1 truncate">{m.name}</p> : null}
          {m.qr_url ? <p className="text-[10px] text-primary font-semibold mt-1">{t("qr_uploaded")}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setMenuSlot(menuSlot === slot ? null : slot)}
          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted"
          aria-label={t("payment_actions")}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuSlot === slot && (
          <div className="absolute right-3 top-11 z-10 w-40 rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
            <button
              type="button"
              onClick={() => { setEditingSlot(slot); setMenuSlot(null); }}
              className="w-full px-3 py-2.5 text-left text-sm font-medium flex items-center gap-2 active:bg-muted"
            >
              <Pencil className="h-4 w-4" /> {t("edit_payment")}
            </button>
            <button
              type="button"
              onClick={() => { setDeleteSlot(slot); setMenuSlot(null); }}
              className="w-full px-3 py-2.5 text-left text-sm font-medium text-destructive flex items-center gap-2 active:bg-muted"
            >
              <Trash2 className="h-4 w-4" /> {t("delete_payment")}
            </button>
          </div>
        )}
      </div>
    );
  };

  const hasAnyMethod = hasMethod(m1) || hasMethod(m2);

  return (
    <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">💳 {t("pay_details")}</h2>

      {editingSlot === 1 ? renderForm(1, `${t("pay_method")} 1`, m1, setM1) : null}
      {editingSlot === 2 ? renderForm(2, `${t("pay_method")} 2`, m2, setM2) : null}

      {!editingSlot && (
        <div className="space-y-3">
          {renderCard(1, m1)}
          {show2 ? renderCard(2, m2) : null}
          {!hasAnyMethod ? <p className="text-sm text-muted-foreground">{t("no_payment_methods")}</p> : null}
          {!show2 ? (
            <button
              type="button"
              onClick={hasMethod(m1) ? startAdd : () => setEditingSlot(1)}
              className="w-full py-2.5 rounded-2xl border border-dashed border-border text-xs font-semibold text-muted-foreground"
            >
              + {t("pay_add_method")}
            </button>
          ) : null}
        </div>
      )}

      {deleteSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm" onClick={() => setDeleteSlot(null)}>
          <div className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 space-y-4 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">{t("delete_payment")}</h3>
              <p className="text-sm text-muted-foreground">{t("delete_payment_confirm")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteSlot(null)} className="py-3 rounded-2xl bg-muted font-semibold text-sm">{t("cancel")}</button>
              <button type="button" onClick={confirmDelete} disabled={saving} className="py-3 rounded-2xl bg-destructive text-destructive-foreground font-semibold text-sm disabled:opacity-60">{saving ? t("saving") : t("delete")}</button>
            </div>
          </div>
        </div>
      )}
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
