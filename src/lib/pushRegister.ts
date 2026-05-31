/**
 * Registers the Android device with FCM (via Capacitor Push Notifications)
 * and stores the resulting token in `device_tokens`.
 * Safe no-op on web / preview.
 */
import { registerDeviceForPush } from "@/lib/sendPush";
import { notify } from "@/lib/notifications";
import { saveDeviceSessionPush } from "@/lib/deviceSession";

let currentUserId: string | null = null;
let listenersAdded = false;
let registrationPromise: Promise<boolean> | null = null;
let resolveRegistration: ((ok: boolean) => void) | null = null;
let lastRegisteredUserId: string | null = null;
let lastRegisteredToken: string | null = null;

export async function registerPushForUser(userId: string, options: { force?: boolean } = {}): Promise<boolean> {
  currentUserId = userId;
  if (!options.force && lastRegisteredUserId === userId && lastRegisteredToken) return true;
  if (typeof window === "undefined") return false;
  if (registrationPromise) return registrationPromise;

  registrationPromise = withTimeout(registerPushForUserOnce(), 15000, false).finally(() => {
    registrationPromise = null;
    resolveRegistration = null;
  });
  return registrationPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => window.clearTimeout(timer));
  });
}

async function registerPushForUserOnce(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { PushNotifications } = await import("@capacitor/push-notifications");

    if (!listenersAdded) {
      await PushNotifications.addListener("registration", async (token) => {
        try {
          if (!currentUserId) throw new Error("Missing signed-in user");
          const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
          const res = await registerDeviceForPush({
            userId: currentUserId,
            token: token.value,
            platform,
          });
          if (res.error) throw res.error;
          // Also store the FCM token on the device_sessions row so the
          // edge function can dispatch by device. Use the real device
          // model + native platform rather than the WebView UA string.
          let deviceName: string | undefined;
          try {
            const { Device } = await import("@capacitor/device");
            const info = await Device.getInfo();
            deviceName = [info.manufacturer, info.model].filter(Boolean).join(" ").trim() || info.name || undefined;
          } catch {
            deviceName = undefined;
          }
          await saveDeviceSessionPush({
            userId: currentUserId,
            fcmToken: token.value,
            deviceName,
            deviceType: platform,
          }).catch(() => null);
          lastRegisteredUserId = currentUserId;
          lastRegisteredToken = token.value;
          resolveRegistration?.(true);
        } catch (e) {
          console.warn("device token registration failed", e);
          resolveRegistration?.(false);
        }
      });

      await PushNotifications.addListener("registrationError", (err) => {
        console.warn("FCM registration error", err);
        resolveRegistration?.(false);
      });

      await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        notify(notification.title || "Bossify", notification.body || "", notification.data).catch(
          () => {},
        );
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
      window.setTimeout(() => resolve(lastRegisteredUserId === currentUserId && !!lastRegisteredToken), 12000);
    });

    PushNotifications.register().catch((e) => {
      console.warn("FCM register call failed", e);
      resolveRegistration?.(false);
    });
    return await result;
  } catch (e) {
    console.warn("registerPushForUser failed", e);
    return false;
  }
}
