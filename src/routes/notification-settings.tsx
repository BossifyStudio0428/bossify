import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Settings, Bell, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { isNotifGranted, openAppNotificationSettings, notify } from "@/lib/notifications";
import { sendPushToSelf } from "@/lib/sendPush";
import { registerPushForUser } from "@/lib/pushRegister";
import { registerWebPush, isWebPushSupported } from "@/lib/webPush";
import { loadPrefs } from "@/lib/notifPrefs";
import { savePrefs, DEFAULT_PREFS, type NotifPrefs } from "@/lib/notifPrefs";
import { rescheduleAll } from "@/lib/notifSchedule";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/notification-settings")({ component: NotifSettingsPage });

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => window.clearTimeout(timer));
  });
}

function NotifSettingsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [granted, setGranted] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sending, setSending] = useState(false);
  const [webPermission, setWebPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);

  const togglePref = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user) return;
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      await savePrefs(user.id, { [key]: value } as Partial<NotifPrefs>);
      await rescheduleAll(user.id).catch(() => undefined);
    } catch {
      // revert
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error(t("notif_send_failed") + "save");
    }
  };

  // Re-check native notification permission status (e.g. after returning from
  // the system settings page). Updates local `granted` state + localStorage
  // so the warning banner disappears / re-appears correctly.
  const recheckNativePermission = async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.checkPermissions().catch(() => ({ display: "denied" as const }));
      const ok = res.display === "granted";
      try {
        if (ok) localStorage.setItem("bossify_notif_granted", "1");
        else localStorage.removeItem("bossify_notif_granted");
      } catch {}
      setGranted(ok);
      if (ok && user) {
        registerPushForUser(user.id, { force: true }).catch(() => {});
      }
    } catch {}
  };

  const registerCurrentDevice = async () => {
    if (!user) return { ok: false, native: false, reason: "Not signed in" };
    let isNative = false;
    try {
      const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
      if (w.Capacitor?.isNativePlatform?.()) isNative = true;
    } catch {}
    if (!isNative) {
      try {
        const { Capacitor } = await import("@capacitor/core");
        isNative = Capacitor.isNativePlatform();
      } catch {}
    }

    if (isNative) {
      const ok = await registerPushForUser(user.id, { force: true });
      if (ok) {
        await loadPrefs(user.id).catch(() => undefined);
        await rescheduleAll(user.id).catch(() => undefined);
      }
      return { ok, native: true, reason: ok ? "" : "Android push registration failed" };
    }

    if (!isWebPushSupported()) {
      const permissionOnly = await openAppNotificationSettings();
      return {
        ok: permissionOnly,
        native: false,
        reason: permissionOnly ? "" : "Browser does not support push",
      };
    }
    const result = await registerWebPush(user.id);
    return { ok: result.ok, native: false, reason: result.ok ? "" : (result.reason ?? "Could not enable web push") };
  };

  useEffect(() => {
    if (!user) return;
    setGranted(isNotifGranted());
    // Fire-and-forget device registration so the button doesn't have to wait.
    registerPushForUser(user.id, { force: true }).catch(() => {});

    // Detect native vs web
    let native = false;
    try {
      const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
      if (w.Capacitor?.isNativePlatform?.()) native = true;
    } catch {}
    setIsNativeApp(native);

    // Native: re-check permission on mount and whenever app returns from
    // background (user may have toggled the system notification setting).
    if (native) {
      recheckNativePermission();
      let cleanup: (() => void) | null = null;
      import("@capacitor/app")
        .then(({ App }) => {
          const handle = App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) recheckNativePermission();
          });
          cleanup = () => {
            // handle is a Promise<PluginListenerHandle> in v8
            Promise.resolve(handle).then((h) => h.remove()).catch(() => {});
          };
        })
        .catch(() => {});
      return () => {
        if (cleanup) cleanup();
      };
    }

    // Web flow: auto-prompt for permission when 'default'
    if (!native && typeof window !== "undefined" && isWebPushSupported() && typeof Notification !== "undefined") {
      const perm = Notification.permission;
      setWebPermission(perm);
      if (perm === "granted") {
        registerWebPush(user.id).catch(() => {});
      } else if (perm === "default") {
        // Auto-trigger browser permission popup
        Notification.requestPermission()
          .then(async (result) => {
            setWebPermission(result);
            if (result === "granted") {
              await registerWebPush(user.id).catch(() => {});
              setGranted(true);
            }
          })
          .catch(() => {});
      }
    }

    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));

    // Load prefs for the toggles
    loadPrefs(user.id).then(setPrefs).catch(() => setPrefs(DEFAULT_PREFS));
  }, [user]);

  const openSysSettings = async () => {
    if (!user) return;

    // Detect platform
    let isNative = false;
    try {
      const { Capacitor } = await import("@capacitor/core");
      isNative = Capacitor.isNativePlatform();
    } catch {}

    if (isNative) {
      // Step 1: try the in-app permission prompt first. If notifications were
      // never asked or the OS still allows a prompt, this is the friendliest
      // path and avoids bouncing the user out of the app.
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const current = await LocalNotifications.checkPermissions().catch(() => ({ display: "denied" as const }));
        if (current.display !== "granted" && current.display !== "denied") {
          const res = await LocalNotifications.requestPermissions().catch(() => ({ display: "denied" as const }));
          if (res.display === "granted") {
            await recheckNativePermission();
            registerPushForUser(user.id, { force: true }).catch(() => {});
            toast.success(t("notif_sent_check"));
            return;
          }
        }
      } catch {}

      // Step 2: permission is denied or otherwise unavailable — bounce the
      // user to the OS app-notification settings page for Bossify.
      await openAppNotificationSettings();
      // Status will be re-checked automatically by the appStateChange
      // listener when the user returns to the app.
      return;
    }

    // Web browser: trigger the browser permission popup and register web push.
    try {
      if (typeof Notification === "undefined") {
        toast.error(t("notif_send_failed") + "unsupported");
        return;
      }
      const perm = await Notification.requestPermission();
      setWebPermission(perm);
      if (perm === "granted") {
        if (isWebPushSupported()) {
          await registerWebPush(user.id).catch(() => {});
        }
        try { localStorage.setItem("bossify_notif_granted", "1"); } catch {}
        setGranted(true);
        toast.success(t("notif_sent_check"));
      } else {
        toast.error(t("notif_send_failed") + perm);
      }
    } catch (e) {
      toast.error(t("notif_send_failed") + (e as Error).message);
    }
  };

  const sendTest = async () => {
    if (!user || sending) return;
    setSending(true);
    const failSafeTimer = window.setTimeout(() => setSending(false), 15000);
    const title = t("notif_test_title");
    const body = t("notif_test_body");
    try {
      const registration = await registerCurrentDevice();
      if (!registration.ok) {
        throw new Error(registration.reason || "Could not register this device for push");
      }
      const res: any = await withTimeout(
        sendPushToSelf({ kind: "custom", title, body }),
        12000,
        { data: null, error: new Error("Request timed out") },
      );
      if (res?.error) throw res.error;
      let sent = res?.data?.sent ?? res?.sent ?? null;
      // Always fire a local notification so the user actually sees something
      // in the notification bar, even if the FCM token in device_tokens is
      // stale or routed to another device (e.g. a previously-registered
      // browser session). Awaited so it completes before we toast success.
      await notify(title, body).catch(() => undefined);
      if (sent === 0) {
        // No device registered yet — auto-register this device and retry once.
        let registered = false;
        try {
          const { Capacitor } = await import("@capacitor/core");
          if (Capacitor.isNativePlatform()) {
            registered = await registerPushForUser(user.id, { force: true });
          } else if (isWebPushSupported()) {
            const r = await registerWebPush(user.id);
            registered = r.ok;
          }
        } catch {}
        if (registered) {
          const retry: any = await withTimeout(
            sendPushToSelf({ kind: "custom", title, body }),
            12000,
            { data: null, error: new Error("Request timed out") },
          );
          sent = retry?.data?.sent ?? retry?.sent ?? 0;
        }
        if (!sent) {
          toast.warning(t("notif_no_device"));
        } else {
          toast.success(t("notif_sent_to").replace("{n}", String(sent)));
        }
      } else if (typeof sent === "number") {
        toast.success(t("notif_sent_to").replace("{n}", String(sent)));
      } else {
        toast.success(t("notif_sent_check"));
      }
    } catch (e) {
      toast.error(t("notif_send_failed") + (e as Error).message);
    } finally {
      window.clearTimeout(failSafeTimer);
      setSending(false);
    }
  };

  const { type: bizType } = useBusinessType();

  const newItem = (() => {
    switch (bizType) {
      case "education":
        return { icon: "🎓", labelKey: "notif_setting_new_case" as const, descKey: "notif_setting_new_case_desc" as const };
      case "beauty":
        return { icon: "💄", labelKey: "notif_setting_new_appointment" as const, descKey: "notif_setting_new_appointment_desc" as const };
      case "property":
        return { icon: "🏠", labelKey: "notif_setting_new_lead" as const, descKey: "notif_setting_new_lead_desc" as const };
      case "freelance":
        return { icon: "💼", labelKey: "notif_setting_new_project" as const, descKey: "notif_setting_new_project_desc" as const };
      default:
        return { icon: "🛍", labelKey: "notif_setting_new_order" as const, descKey: "notif_setting_new_order_desc" as const };
    }
  })();

  const unpaidDescKey = (() => {
    switch (bizType) {
      case "education": return "notif_setting_unpaid_desc_education";
      case "beauty": return "notif_setting_unpaid_desc_beauty";
      case "property": return "notif_setting_unpaid_desc_property";
      case "freelance": return "notif_setting_unpaid_desc_freelance";
      default: return "notif_setting_unpaid_desc";
    }
  })();

  const morningDescKey = (() => {
    switch (bizType) {
      case "education": return "notif_setting_morning_desc_education";
      case "beauty": return "notif_setting_morning_desc_beauty";
      case "property": return "notif_setting_morning_desc_property";
      case "freelance": return "notif_setting_morning_desc_freelance";
      default: return "notif_setting_morning_desc";
    }
  })();

  const eveningDescKey = (() => {
    switch (bizType) {
      case "education": return "notif_setting_evening_desc_education";
      case "beauty": return "notif_setting_evening_desc_beauty";
      case "property": return "notif_setting_evening_desc_property";
      case "freelance": return "notif_setting_evening_desc_freelance";
      default: return "notif_setting_evening_desc";
    }
  })();

  const isRetailFnb = bizType === "retail" || bizType === "fnb";

  const items: { icon: string; label: string; desc: string }[] = [
    { icon: newItem.icon, label: t(newItem.labelKey as any), desc: t(newItem.descKey as any) },
  ];

  if (bizType === "property") {
    items.push(
      { icon: "📅", label: t("notif_setting_followup" as any), desc: t("notif_setting_followup_desc" as any) },
      { icon: "💰", label: t("notif_setting_unpaid"), desc: t(unpaidDescKey as any) },
    );
  } else {
    items.push(
      { icon: "💰", label: t("notif_setting_unpaid"), desc: t(unpaidDescKey as any) },
    );
    if (!isRetailFnb) {
      items.push(
        { icon: "📅", label: t("notif_setting_followup" as any), desc: t("notif_setting_followup_desc" as any) },
      );
    }
  }

  if (isRetailFnb) {
    items.push(
      { icon: "📦", label: t("notif_setting_inventory"), desc: t("notif_setting_inventory_desc") },
    );
  }

  items.push(
    { icon: "🌅", label: t("notif_setting_morning"), desc: t(morningDescKey as any) },
    { icon: "🌙", label: t("notif_setting_evening"), desc: t(eveningDescKey as any) },
    { icon: "🎯", label: t("notif_setting_milestone"), desc: t("notif_setting_milestone_desc") },
  );

  return (
    <div className="px-5 pt-10 pb-6 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{t("notification_settings")}</h1>
      </header>

      {!isNativeApp && webPermission === "granted" && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 flex items-center gap-2">
          <span className="text-emerald-600 text-lg">✓</span>
          <p className="text-sm font-semibold text-emerald-900">{t("notif_web_enabled" as any)}</p>
        </div>
      )}

      {!isNativeApp && webPermission === "denied" && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">{t("notif_web_blocked" as any)}</p>
        </div>
      )}

      {(isNativeApp || webPermission === "unsupported") && !granted && (
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

      <button
        onClick={sendTest}
        disabled={sending}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center gap-2 text-sm font-semibold active:scale-[.99] disabled:opacity-60"
      >
        <Bell className="h-4 w-4" /> {sending ? t("notif_test_sending") : t("notif_test_push")}
      </button>
    </div>
  );
}
