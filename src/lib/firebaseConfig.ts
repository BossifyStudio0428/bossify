// Firebase Web App config — these values are PUBLIC and safe to commit.
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app
//
// Get the VAPID public key from:
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};

// VAPID public key for Web Push
export const VAPID_PUBLIC_KEY = "REPLACE_WITH_VAPID_PUBLIC_KEY";

export const isFirebaseConfigured = () =>
  !firebaseConfig.apiKey.startsWith("REPLACE_") &&
  !VAPID_PUBLIC_KEY.startsWith("REPLACE_");