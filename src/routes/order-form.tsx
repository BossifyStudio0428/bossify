import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { pofSectionTitleKey, pofSectionSubKey, pofDescKey, pofWaShareKey, type BizType } from "@/lib/businessType";
import { getPublicOrigin } from "@/lib/publicUrl";
import { stripEmoji } from "@/lib/wa";

export const Route = createFileRoute("/order-form")({ component: OrderFormPage });

function OrderFormPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [allowCod, setAllowCod] = useState<boolean>(true);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("order_form_code,order_form_enabled,business_type,allow_cod" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      let existing = ((data as any)?.order_form_code as string) ?? null;
      setEnabled(((data as any)?.order_form_enabled as boolean) ?? true);
      setAllowCod(((data as any)?.allow_cod as boolean) ?? true);
      setBusinessType(((data as any)?.business_type as string) ?? null);

      // Auto-generate a code if missing so the public link never 404s.
      if (!existing) {
        const fresh = Math.random().toString(16).slice(2, 10);
        const { error: upErr } = await supabase
          .from("profiles")
          .update({ order_form_code: fresh, order_form_enabled: true } as any)
          .eq("id", user.id);
        if (!upErr) {
          existing = fresh;
          setEnabled(true);
        }
      }
      if (cancelled) return;
      setCode(existing);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const link = code ? `${getPublicOrigin()}/order/${code}` : "";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`;

  return (
    <div className="px-5 pt-10 pb-10 space-y-5 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/profile" })}
          className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">🔗 {t(pofSectionTitleKey(businessType as BizType | null))}</h1>
          <p className="text-[11px] text-muted-foreground">{t(pofSectionSubKey(businessType as BizType | null))}</p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("loading")}</p>
      ) : !code ? (
        <div className="rounded-2xl bg-card border border-border/60 p-6 text-center text-sm text-muted-foreground">
          {t("pof_not_found_sub")}
        </div>
      ) : (
        <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-muted/40 border border-border/60 px-3 py-2">
            <span className="text-xs font-medium">
              {enabled ? t("pof_enabled") : t("pof_disabled")}
            </span>
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                const next = !enabled;
                setEnabled(next);
                const { error } = await supabase
                  .from("profiles")
                  .update({ order_form_enabled: next } as any)
                  .eq("id", user.id);
                if (error) {
                  setEnabled(!next);
                  toast.error(error.message);
                }
              }}
              role="switch"
              aria-checked={enabled}
              className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`}
              />
            </button>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-[11px] font-mono text-foreground break-all">
            {link}
          </div>
          {(businessType === "retail" || businessType === "fnb") && (
            <div className="flex items-center justify-between rounded-xl bg-muted/40 border border-border/60 px-3 py-2">
              <div className="min-w-0 pr-3">
                <p className="text-xs font-medium">💵 {t("allow_cod_label")}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("allow_cod_sub")}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!user) return;
                  const next = !allowCod;
                  setAllowCod(next);
                  const { error } = await supabase
                    .from("profiles")
                    .update({ allow_cod: next } as any)
                    .eq("id", user.id);
                  if (error) {
                    setAllowCod(!next);
                    toast.error(error.message);
                  }
                }}
                role="switch"
                aria-checked={allowCod}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${allowCod ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${allowCod ? "translate-x-5" : ""}`}
                />
              </button>
            </div>
          )}
          <p className="text-[12px] italic text-[#888] leading-relaxed">
            {t(pofDescKey(businessType as BizType | null))}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(link);
                toast.success(t("pof_link_copied"));
              }}
              className="py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95"
            >
              📋 {t("pof_copy_link")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(stripEmoji(t(pofWaShareKey(businessType as BizType | null)).replace("{link}", link)))}`}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold text-center active:scale-95"
            >
              💬 {t("pof_share_wa")}
            </a>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="py-2.5 rounded-xl bg-card border border-border/60 text-xs font-semibold active:scale-95"
            >
              📱 {t("pof_qr_code")}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="py-2.5 rounded-xl bg-card border border-border/60 text-xs font-semibold text-center active:scale-95"
            >
              👁 {t("pof_view_form")}
            </a>
          </div>
          {qrOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setQrOpen(false)}>
              <div className="bg-card rounded-3xl p-6 text-center max-w-xs" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-semibold mb-3">{t("pof_qr_title")}</p>
                <img src={qrUrl} alt="QR" className="mx-auto h-60 w-60 rounded-xl" />
                <p className="text-[10px] text-muted-foreground mt-3 break-all">{link}</p>
                <button onClick={() => setQrOpen(false)} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">{t("pof_close")}</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}