import { supabase } from "@/integrations/supabase/client";
import { firebaseConfig, VAPID_PUBLIC_KEY, isFirebaseConfigured } from "./firebaseConfig";
import { registerDeviceForPush } from "./sendPush";

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

export async function registerWebPush(userId: string): Promise<boolean> {
  try {
    if (!isWebPushSupported()) {
      console.info("[webPush] not supported in this browser");
      return false;
    }
    if (!isFirebaseConfigured()) {
      console.warn(
        "[webPush] Firebase not configured — edit src/lib/firebaseConfig.ts with your Firebase Web App config + VAPID key",
      );
      return false;
    }

    // Lazy-load Firebase SDK so it never runs during SSR
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken, onMessage, isSupported } = await import(
      "firebase/messaging"
    );

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      console.info("[webPush] firebase/messaging not supported here");
      return false;
    }

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

    // Register the service worker explicitly so we know its scope
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });

    // Ask permission if not already granted
    const perm =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (perm !== "granted") {
      console.info("[webPush] permission not granted:", perm);
      return false;
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: reg,
    });

    if (!token) {
      console.warn("[webPush] no FCM token returned");
      return false;
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
    const res = await registerDeviceForPush({
      userId,
      token,
      platform: "web",
    });
    if (res.error) {
      console.warn("[webPush] registerDeviceForPush failed", res.error);
      return false;
    }

    try {
      localStorage.setItem("bossify_notif_granted", "1");
    } catch {}
    return true;
  } catch (e) {
    console.warn("[webPush] register failed", e);
    return false;
  }
}

// Keep supabase import non-tree-shaken to make sure the client module
// is loaded before we need its session for registerDeviceForPush.
void supabase;