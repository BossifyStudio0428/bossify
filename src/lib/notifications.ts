import { supabase } from "@/integrations/supabase/client";

const PERM_ASKED_KEY = "bossify_notif_asked";
const PERM_GRANTED_KEY = "bossify_notif_granted";
const REMINDER_SCHEDULED_KEY = "bossify_reminder_scheduled";

export function hasAskedNotifPermission(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(PERM_ASKED_KEY) === "1";
}
export function markNotifAsked() {
  try {
    localStorage.setItem(PERM_ASKED_KEY, "1");
  } catch {}
}
export function isNotifGranted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PERM_GRANTED_KEY) === "1";
}

/**
 * Opens the OS-level app notification settings page for Bossify so the user
 * can flip the system toggle (channels, sounds, allow / block). On web this
 * falls back to the browser permission prompt — there is no equivalent OS
 * page in a browser.
 */
export async function openAppNotificationSettings(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let isNative = false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    isNative = Capacitor.isNativePlatform();
  } catch {}
  if (isNative) {
    try {
      const mod: any = await import(/* @vite-ignore */ "capacitor-native-settings");
      const platform = (await import("@capacitor/core")).Capacitor.getPlatform();
      if (platform === "ios") {
        await mod.NativeSettings.openIOS({ option: mod.IOSSettings.App });
      } else {
        await mod.NativeSettings.openAndroid({ option: mod.AndroidSettings.AppNotification });
      }
      return true;
    } catch (e) {
      console.warn("openAppNotificationSettings failed", e);
      try {
        const { App } = await import("@capacitor/app");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (App as any).openSettings?.();
      } catch {}
      return false;
    }
  }
  // Web fallback — there is no system app settings page in a browser.
  if ("Notification" in window) {
    try {
      const res = await Notification.requestPermission();
      const ok = res === "granted";
      if (ok) localStorage.setItem(PERM_GRANTED_KEY, "1");
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

async function getPlugin() {
  // The Capacitor LocalNotifications web proxy is a thenable that throws
  // "not implemented on web" the moment an async return tries to unwrap it.
  // Skip the import entirely outside of native platforms.
  if (typeof window !== "undefined") {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return null;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return LocalNotifications;
  } catch {
    return null;
  }
}

export async function requestNotifPermission(): Promise<boolean> {
  markNotifAsked();
  const plugin = await getPlugin();
  if (!plugin) {
    // Web fallback
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const res = await Notification.requestPermission();
        const ok = res === "granted";
        if (ok) localStorage.setItem(PERM_GRANTED_KEY, "1");
        return ok;
      } catch {
        return false;
      }
    }
    return false;
  }
  try {
    // Check current state first — if previously denied, the native prompt
    // will NOT re-appear. In that case open the system app settings so the
    // user can flip the OS-level toggle themselves.
    let current: { display?: string } = {};
    try {
      current = await plugin.checkPermissions();
    } catch {}
    let res = current;
    if (current.display !== "granted") {
      try {
        res = await plugin.requestPermissions();
      } catch {}
    }
    const ok = res.display === "granted";
    if (ok) {
      try {
        localStorage.setItem(PERM_GRANTED_KEY, "1");
      } catch {}
      await schedulePaymentReminder();
      return true;
    }
    if (res.display === "denied") {
      // Permission permanently denied — bounce to the app's native
      // notification settings page so the user can toggle it.
      try {
        const mod: any = await import(/* @vite-ignore */ "capacitor-native-settings");
        await mod.NativeSettings.openAndroid({ option: mod.AndroidSettings.AppNotification });
      } catch {
        try {
          const { App } = await import("@capacitor/app");
          // Fallback: best-effort open app info
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (App as any).openSettings?.();
        } catch {}
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string, extra?: Record<string, unknown>) {
  const plugin = await getPlugin();
  if (plugin) {
    try {
      const current = (await plugin.checkPermissions().catch(() => ({}))) as { display?: string };
      if (current.display !== "granted") {
        const requested = (await plugin.requestPermissions().catch(() => ({}))) as {
          display?: string;
        };
        if (requested.display !== "granted") return;
      }
      await plugin.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title,
            body,
            extra,
          },
        ],
      });
      return;
    } catch (e) {
      console.warn("notify failed", e);
    }
  }
  // Web fallback
  if (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(title, { body });
    } catch {}
  }
}

const REMINDER_ID = 9001;
export async function schedulePaymentReminder() {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    // Cancel existing first
    await plugin.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
    // Schedule daily 9am check trigger; the actual filter happens in handler below.
    await plugin.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: "Bossify",
          body: "Checking your unpaid orders...",
          schedule: { on: { hour: 9, minute: 0 }, allowWhileIdle: true, repeats: true },
          extra: { kind: "daily_unpaid_check" },
        },
      ],
    });
    try {
      localStorage.setItem(REMINDER_SCHEDULED_KEY, "1");
    } catch {}
  } catch (e) {
    console.warn("schedule reminder failed", e);
  }
}

/** Run an in-app check for overdue unpaid orders and notify if any. */
export async function runOverdueCheck(userId: string, t: (k: any) => string) {
  if (!isNotifGranted()) return;
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "Unpaid")
    .lte("created_at", cutoff);
  if (error || !data || data.length === 0) return;
  await notify("Payment Reminder ⚠️", `${t("you_have")} ${data.length} ${t("payment_overdue")}`, {
    route: "/orders",
    filter: "Unpaid",
  });
}
