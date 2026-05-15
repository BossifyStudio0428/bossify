import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Settings, Bell, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { isNotifGranted, openAppNotificationSettings, notify } from "@/lib/notifications";
import { sendPushToSelf } from "@/lib/sendPush";
import { registerPushForUser } from "@/lib/pushRegister";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notification-settings")({ component: NotifSettingsPage });

function NotifSettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [granted, setGranted] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    setGranted(isNotifGranted());
    // Fire-and-forget device registration so the button doesn't have to wait.
    registerPushForUser(user.id).catch(() => {});
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));
  }, [user]);

  const openSysSettings = async () => {
    const ok = await openAppNotificationSettings();
    setGranted(ok || isNotifGranted());
  };

  const sendTest = async () => {
    if (!user) return;
    setSending(true);
    const title = t("notif_test_title");
    const body = t("notif_test_body");
    try {
      const res: any = await Promise.race([
        sendPushToSelf({ kind: "custom", title, body }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ error: new Error("Request timed out") }), 12000),
        ),
      ]);
      if (res?.error) throw res.error;
      const sent = res?.data?.sent ?? res?.sent ?? null;
      await notify(title, body);
      if (sent === 0) {
        toast.warning(t("notif_no_device"));
      } else if (typeof sent === "number") {
        toast.success(t("notif_sent_to").replace("{n}", String(sent)));
      } else {
        toast.success(t("notif_sent_check"));
      }
    } catch (e) {
      toast.error(t("notif_send_failed") + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const items: { icon: string; label: string; desc: string }[] = [
    { icon: "🛍", label: t("notif_setting_new_order"), desc: t("notif_setting_new_order_desc") },
    { icon: "💰", label: t("notif_setting_unpaid"), desc: t("notif_setting_unpaid_desc") },
    { icon: "📦", label: t("notif_setting_inventory"), desc: t("notif_setting_inventory_desc") },
    { icon: "🌅", label: t("notif_setting_morning"), desc: t("notif_setting_morning_desc") },
    { icon: "🌙", label: t("notif_setting_evening"), desc: t("notif_setting_evening_desc") },
    { icon: "🎯", label: t("notif_setting_milestone"), desc: t("notif_setting_milestone_desc") },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{t("notification_settings")}</h1>
      </header>

      {!granted && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{t("notif_perm_off_title")}</p>
          <p className="text-xs text-amber-800 mt-1">{t("notif_perm_off_desc")}</p>
          <button
            onClick={openSysSettings}
            className="mt-3 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[.98]"
          >
            {t("allow_notifications")}
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3">
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{t("notif_info_banner")}</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/40">
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-3 p-4">
            <span className="text-2xl">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{it.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{it.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openSysSettings}
        className="w-full h-12 rounded-2xl border border-border/60 bg-card flex items-center justify-center gap-2 text-sm font-semibold active:scale-[.99]"
      >
        <Settings className="h-4 w-4" /> {t("open_system_settings")}
      </button>

      {isAdmin && (
        <button
          onClick={sendTest}
          disabled={sending}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center gap-2 text-sm font-semibold active:scale-[.99] disabled:opacity-60"
        >
          <Bell className="h-4 w-4" /> {sending ? t("notif_test_sending") : t("notif_test_push")}
        </button>
      )}
    </div>
  );
}
