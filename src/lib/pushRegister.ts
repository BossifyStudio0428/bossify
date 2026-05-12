/**
 * Registers the Android device with FCM (via Capacitor Push Notifications)
 * and stores the resulting token in `device_tokens`.
 * Safe no-op on web / preview.
 */
import { registerDeviceForPush } from "@/lib/sendPush";
import { notify } from "@/lib/notifications";

let currentUserId: string | null = null;
let listenersAdded = false;
let tokenRegistered = false;
let registrationPromise: Promise<boolean> | null = null;
let resolveRegistration: ((ok: boolean) => void) | null = null;

export async function registerPushForUser(userId: string): Promise<boolean> {
  currentUserId = userId;
  if (tokenRegistered) return true;
  if (typeof window === "undefined") return;
  if (registrationPromise) return registrationPromise;

  registrationPromise = registerPushForUserOnce().finally(() => {
    if (!tokenRegistered) registrationPromise = null;
    resolveRegistration = null;
  });
  return registrationPromise;
}

async function registerPushForUserOnce(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { PushNotifications } = await import("@capacitor/push-notifications");

    if (!listenersAdded) {
      PushNotifications.addListener("registration", async (token) => {
        try {
          if (!currentUserId) throw new Error("Missing signed-in user");
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          const res = await registerDeviceForPush({ userId: currentUserId, token: token.value, platform });
          if (res.error) throw res.error;
          tokenRegistered = true;
          resolveRegistration?.(true);
        } catch (e) {
          tokenRegistered = false;
          console.warn("device token registration failed", e);
          resolveRegistration?.(false);
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        tokenRegistered = false;
        console.warn("FCM registration error", err);
        resolveRegistration?.(false);
      });

      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        notify(notification.title || "Bossify", notification.body || "", notification.data).catch(() => {});
      });

      listenersAdded = true;
    }

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return false;
    }

    const result = new Promise<boolean>((resolve) => {
      resolveRegistration = resolve;
      window.setTimeout(() => resolve(tokenRegistered), 8000);
    });

    await PushNotifications.register();
    return await result;
  } catch (e) {
    console.warn("registerPushForUser failed", e);
    return false;
  }
}