import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Settings, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type NotifPrefs } from "@/lib/notifPrefs";
import { rescheduleAll } from "@/lib/notifSchedule";
import { isNotifGranted, requestNotifPermission } from "@/lib/notifications";
import { sendPushToSelf } from "@/lib/sendPush";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notification-settings")({ component: NotifSettingsPage });

function NotifSettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [granted, setGranted] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;
    loadPrefs(user.id).then(setPrefs);
    setGranted(isNotifGranted());
  }, [user]);

  const update = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePrefs(user.id, { [key]: value });
    await rescheduleAll(user.id);
    toast.success(value ? t("notif_enabled") : t("notif_disabled"));
  };

  const askPermission = async () => {
    const ok = await requestNotifPermission();
    setGranted(ok);
    if (ok && user) await rescheduleAll(user.id);
  };

  const [sending, setSending] = useState(false);
  const sendTest = async () => {
    setSending(true);
    try {
      await sendPushToSelf({
        kind: "custom",
        title: "Bossify 测试推送 🎉",
        body: "如果你看到这条通知，推送已经 work 啦！",
      });
      toast.success("已发送，请查看手机通知栏");
    } catch (e) {
      toast.error("发送失败：" + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const items: { key: keyof NotifPrefs; icon: string; label: string; desc: string }[] = [
    { key: "notif_new_order", icon: "🛍", label: t("notif_setting_new_order"), desc: t("notif_setting_new_order_desc") },
    { key: "notif_unpaid", icon: "💰", label: t("notif_setting_unpaid"), desc: t("notif_setting_unpaid_desc") },
    { key: "notif_inventory", icon: "📦", label: t("notif_setting_inventory"), desc: t("notif_setting_inventory_desc") },
    { key: "notif_morning", icon: "🌅", label: t("notif_setting_morning"), desc: t("notif_setting_morning_desc") },
    { key: "notif_evening", icon: "🌙", label: t("notif_setting_evening"), desc: t("notif_setting_evening_desc") },
    { key: "notif_milestone", icon: "🎯", label: t("notif_setting_milestone"), desc: t("notif_setting_milestone_desc") },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold">{t("notification_settings")}</h1>
      </header>

      {!granted && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{t("notif_perm_off_title")}</p>
          <p className="text-xs text-amber-800 mt-1">{t("notif_perm_off_desc")}</p>
          <button onClick={askPermission} className="mt-3 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[.98]">
            {t("allow_notifications")}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/40">
        {items.map((it) => (
          <div key={it.key} className="flex items-start gap-3 p-4">
            <span className="text-2xl">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{it.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{it.desc}</p>
            </div>
            <Switch checked={prefs[it.key]} onCheckedChange={(v) => update(it.key, v)} />
          </div>
        ))}
      </div>

      <button
        onClick={askPermission}
        className="w-full h-12 rounded-2xl border border-border/60 bg-card flex items-center justify-center gap-2 text-sm font-semibold active:scale-[.99]"
      >
        <Settings className="h-4 w-4" /> {t("open_system_settings")}
      </button>

      <button
        onClick={sendTest}
        disabled={sending}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center gap-2 text-sm font-semibold active:scale-[.99] disabled:opacity-60"
      >
        <Bell className="h-4 w-4" /> {sending ? "发送中…" : "发送测试推送"}
      </button>
    </div>
  );
}