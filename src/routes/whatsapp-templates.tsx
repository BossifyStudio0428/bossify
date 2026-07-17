import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import {
  DEFAULT_ORDER_TPL,
  DEFAULT_REMINDER_TPL,
  getOrderTemplate,
  getReminderTemplate,
  isBuiltInOrderTpl,
  isBuiltInReminderTpl,
} from "@/lib/wa";

export const Route = createFileRoute("/whatsapp-templates")({ component: WhatsAppTemplatesPage });

function WhatsAppTemplatesPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const { type: bizType } = useBusinessType();

  const defaultOrderTpl = getOrderTemplate(lang, bizType);
  const defaultReminderTpl = getReminderTemplate(lang, bizType);

  const [orderTpl, setOrderTpl] = useState<string>(DEFAULT_ORDER_TPL);
  const [reminderTpl, setReminderTpl] = useState<string>(DEFAULT_REMINDER_TPL);
  const [orderCustom, setOrderCustom] = useState(false);
  const [reminderCustom, setReminderCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  const varsHelp = (() => {
    const base = "[customer_name] [code] [product] [amount]";
    const status = " [status]";
    const qty = " [quantity]";
    const tail = " [notes] [days_ago]";
    const list =
      bizType === "property"
        ? `${base}${tail}`
        : bizType === "retail" || bizType === "fnb" || !bizType
          ? `${base}${qty}${status}${tail}`
          : `${base}${status}${tail}`;
    const prefix = lang === "ms" ? "Pemboleh ubah: " : lang === "zh" ? "变量：" : "Variables: ";
    return `${prefix}${list}`;
  })();

  useEffect(() => {
    if (!hasFullAccess) {
      showUpgrade(t("wa_template"));
      navigate({ to: "/more", replace: true });
    }
  }, [hasFullAccess, showUpgrade, t, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("wa_order_template,wa_reminder_template")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const savedOrder = pref?.wa_order_template ?? null;
      const savedReminder = pref?.wa_reminder_template ?? null;
      if (savedOrder && !isBuiltInOrderTpl(savedOrder)) {
        setOrderTpl(savedOrder);
        setOrderCustom(true);
      } else {
        setOrderTpl(defaultOrderTpl);
        setOrderCustom(false);
      }
      if (savedReminder && !isBuiltInReminderTpl(savedReminder)) {
        setReminderTpl(savedReminder);
        setReminderCustom(true);
      } else {
        setReminderTpl(defaultReminderTpl);
        setReminderCustom(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, defaultOrderTpl, defaultReminderTpl]);

  useEffect(() => {
    if (!orderCustom) setOrderTpl(defaultOrderTpl);
    if (!reminderCustom) setReminderTpl(defaultReminderTpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizType, lang]);

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        wa_order_template: orderTpl,
        wa_reminder_template: reminderTpl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("template_saved"));
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/more" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("wa_template")}</h1>
      </header>

      <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-4">
        <div>
          <label className="text-[11px] uppercase font-semibold text-muted-foreground">
            {t("order_template")}
          </label>
          <textarea
            value={orderTpl}
            onChange={(e) => { setOrderTpl(e.target.value); setOrderCustom(true); }}
            rows={7}
            className="mt-1 w-full rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-xs font-mono"
          />
          <button
            onClick={() => { setOrderTpl(defaultOrderTpl); setOrderCustom(false); }}
            className="text-[11px] text-primary mt-1"
          >
            {t("reset_default")}
          </button>
        </div>
        <div>
          <label className="text-[11px] uppercase font-semibold text-muted-foreground">
            {t("reminder_template")}
          </label>
          <textarea
            value={reminderTpl}
            onChange={(e) => { setReminderTpl(e.target.value); setReminderCustom(true); }}
            rows={7}
            className="mt-1 w-full rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-xs font-mono"
          />
          <button
            onClick={() => { setReminderTpl(defaultReminderTpl); setReminderCustom(false); }}
            className="text-[11px] text-primary mt-1"
          >
            {t("reset_default")}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">{varsHelp}</p>
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
        >
          {saving ? "…" : t("save")}
        </button>
      </div>
    </div>
  );
}