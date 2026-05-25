// Firebase Web App config — these values are PUBLIC and safe to commit.
// Get them from: Firebase Console → Project Settings → General → Your apps → Web app
//
// Get the VAPID public key from:
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair

export const firebaseConfig = {
  apiKey: "AIzaSyAGuMUIs5vybX0k_VsiQYs7-k2MtVFe63M",
  authDomain: "bossify-9e5db.firebaseapp.com",
  projectId: "bossify-9e5db",
  storageBucket: "bossify-9e5db.firebasestorage.app",
  messagingSenderId: "658401705186",
  appId: "1:658401705186:web:44c65389f16913fd2ab2bb",
};

// VAPID public key for Web Push
export const VAPID_PUBLIC_KEY =
  "BKQZ_4h1ZuRGfPm588HTiA3BndUEVT8YGVQCGrRax86EkJqxM_RlyFt2v6ZYSCj1py1Pxp-dGbm9ZigSK9x8JJ4";

export const isFirebaseConfigured = () =>
  !firebaseConfig.apiKey.startsWith("REPLACE_") &&
  !VAPID_PUBLIC_KEY.startsWith("REPLACE_");