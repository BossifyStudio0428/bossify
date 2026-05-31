import { supabase } from "@/integrations/supabase/client";
import { firebaseConfig, VAPID_PUBLIC_KEY, isFirebaseConfigured } from "./firebaseConfig";
import { registerDeviceForPush } from "./sendPush";
import { saveDeviceSessionPush } from "./deviceSession";

/**
 * Web Push (FCM Web) registration.
 *
 * Flow:
 *  1. Check browser support (Notification API + Service Worker + Push API)
 *  2. Register firebase-messaging-sw.js
 *  3. Request Notification permission
 *  4. getToken(vapidKey) → FCM web token
 *  5. Store token in device_tokens with platform = 'web'
 */

export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export type WebPushResult = { ok: boolean; reason?: string };

export async function registerWebPush(userId: string): Promise<WebPushResult> {
  try {
    if (!isWebPushSupported()) {
      const reason = !("Notification" in (globalThis as any))
        ? "Browser has no Notification API"
        : !("serviceWorker" in navigator)
          ? "Service workers unavailable (private mode?)"
          : "Push API unavailable in this browser";
      console.info("[webPush] not supported:", reason);
      return { ok: false, reason };
    }
    if (!isFirebaseConfigured()) {
      return { ok: false, reason: "Firebase web config missing" };
    }

    // Lazy-load Firebase SDK so it never runs during SSR
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken, onMessage, isSupported } = await import(
      "firebase/messaging"
    );

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return { ok: false, reason: "Firebase messaging not supported in this WebView" };
    }

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    // Register the service worker explicitly so we know its scope
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
        scope: "/",
      });
      // Wait until the SW is actually ready — getToken() needs an active worker.
      await navigator.serviceWorker.ready;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: `Service worker registration failed: ${msg}` };
    }

    // Ask permission if not already granted
    const perm =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (perm !== "granted") {
      return {
        ok: false,
        reason:
          perm === "denied"
            ? "Notifications blocked in browser settings"
            : "Notification permission not granted",
      };
    }

    const messaging = getMessaging(app);
    let token: string;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: reg,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: `FCM getToken failed: ${msg}` };
    }
    if (!token) {
      return { ok: false, reason: "FCM returned no token" };
    }

    // Foreground messages: SW only fires when tab is hidden/closed.
    // When the tab is focused, show the notification ourselves.
    onMessage(messaging, (payload) => {
      try {
        const title = payload.notification?.title || "Bossify";
        const body = payload.notification?.body || "";
        if (Notification.permission === "granted") {
          const n = new Notification(title, { body, icon: "/favicon.ico" });
          n.onclick = () => {
            const link =
              (payload.data as Record<string, string> | undefined)?.link || "/";
            window.focus();
            window.location.assign(link);
            n.close();
          };
        }
      } catch (e) {
        console.warn("[webPush] onMessage handler failed", e);
      }
    });

    // Persist as platform = 'web' in device_tokens
    const res = await registerDeviceForPush({ userId, token, platform: "web" });
    if (res.error) {
      return { ok: false, reason: `Save token failed: ${res.error.message}` };
    }

    // Also persist into device_sessions: fcm_token for web FCM, and the
    // raw PushSubscription JSON for VAPID web push fallback.
    let pushSubJson: unknown = null;
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) pushSubJson = sub.toJSON();
    } catch {
      // ignore
    }
    await saveDeviceSessionPush({
      userId,
      fcmToken: token,
      pushSubscription: pushSubJson,
    }).catch(() => null);

    try {
      localStorage.setItem("bossify_notif_granted", "1");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[webPush] register failed", e);
    return { ok: false, reason: msg };
  }
}

// Keep supabase import non-tree-shaken to make sure the client module
// is loaded before we need its session for registerDeviceForPush.
void supabase;