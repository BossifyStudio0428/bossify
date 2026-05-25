/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker for Web Push.
// Runs in the background — fires push notifications even when the
// Bossify tab is closed.
//
// IMPORTANT: This file runs in a separate worker context with no access
// to your app bundle. The Firebase Web config below MUST be kept in sync
// with src/lib/firebaseConfig.ts.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
});

const messaging = firebase.messaging();

// Background message handler — fired when the tab is hidden/closed.
// FCM auto-shows the notification block, so we only customize click
// behavior here.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Bossify";
  const body = (payload.notification && payload.notification.body) || "";
  const link = (payload.data && payload.data.link) || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { link },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const client of all) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(link);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});