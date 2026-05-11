import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { markPaymentSetupDone } from "@/lib/paymentSetup";

export const Route = createFileRoute("/payment-setup")({ component: PaymentSetupPage });

const PAYMENT_TYPES = ["DuitNow", "Bank Transfer", "TNG eWallet", "ShopeePay", "Other"];

function PaymentSetupPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [type, setType] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  const finish = (saved: boolean) => {
    if (user) markPaymentSetupDone(user.id);
    if (saved) toast.success(t("pay_saved"));
    navigate({ to: "/", replace: true });
  };

  const handleSave = async () => {
    if (!user) return;
    if (!type && !number && !name && !qrUrl) {
      // nothing entered → treat as skip
      finish(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      payment_method_1_type: type || null,
      payment_method_1_number: number || null,
      payment_method_1_name: name || null,
      payment_method_1_qr_url: qrUrl || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    finish(true);
  };

  const uploadQr = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("photo_max_5mb"));
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/qr-1-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("payment-qr").upload(path, file, { upsert: true });
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from("payment-qr").getPublicUrl(path);
    setQrUrl(pub.publicUrl);
    setUploading(false);
    toast.success(t("qr_uploaded"));
  };

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="w-full max-w-[420px] min-h-screen flex flex-col px-5 pt-10 pb-6">
        <div className="flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-[var(--shadow-soft)]">
            <CreditCard className="h-10 w-10" strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-[20px] font-bold text-foreground">
            {t("setup_payment_title")}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed px-2">
            {t("setup_payment_subtitle")}
          </p>
        </div>

        <div className="mt-7 space-y-2.5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3.5 text-sm text-foreground"
          >
            <option value="">— {t("pay_method")} —</option>
            {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={t("pay_account_no")}
            className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("pay_account_name")}
            className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/70"
          />
          <div className="flex items-center gap-3 pt-1">
            {qrUrl ? (
              <img src={qrUrl} alt="QR" className="h-16 w-16 rounded-xl object-cover border border-border/60" />
            ) : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 rounded-xl bg-card border border-border/60 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              📷 {uploading ? t("uploading_qr") : t("upload_qr")}
            </button>
            {qrUrl && (
              <button
                type="button"
                onClick={() => setQrUrl("")}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-destructive"
              >
                {t("remove_qr")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadQr(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="flex-1" />

        <div className="space-y-2 pt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
          >
            {saving ? t("saving") : t("setup_and_continue")}
          </button>
          <button
            type="button"
            onClick={() => finish(false)}
            className="w-full py-3 text-sm font-semibold text-muted-foreground"
          >
            {t("skip_for_now")}
          </button>
        </div>
      </div>
    </div>
  );
}
