/**
 * Registers the Android device with FCM (via Capacitor Push Notifications)
 * and stores the resulting token in `device_tokens`.
 * Safe no-op on web / preview.
 */
import { registerDeviceForPush } from "@/lib/sendPush";

let registered = false;

export async function registerPushForUser(userId: string) {
  if (registered) return;
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return;
    }

    PushNotifications.addListener("registration", async (token) => {
      try {
        const res = await registerDeviceForPush({ userId, token: token.value, platform: "android" });
        if (res.error) console.warn("device token registration failed", res.error);
      } catch (e) {
        console.warn("device token registration failed", e);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("FCM registration error", err);
    });

    await PushNotifications.register();
    registered = true;
  } catch (e) {
    console.warn("registerPushForUser failed", e);
  }
}