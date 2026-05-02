import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Bossify Android app.
 *
 * Strategy: the app is a thin native shell that loads the published
 * Lovable site directly. This means any change pushed in Lovable shows
 * up in the installed Android app immediately — no rebuild / re-upload
 * to Play Console needed for content updates.
 *
 * If you ever want a fully offline app, remove the `server.url` block
 * and switch to a static SPA build copied into `dist/`.
 */
const config: CapacitorConfig = {
  appId: 'com.zhstudio.bossify',
  appName: 'Bossify',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  // Lock app to portrait orientation only.
  // Note: Capacitor honors this on iOS automatically, but on Android the
  // authoritative setting lives in AndroidManifest.xml — see ANDROID_BUILD.md.
  // @ts-ignore - `orientation` is a valid runtime hint Capacitor reads.
  orientation: 'portrait',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    SplashScreen: {
      launchShowDuration: 3500,
      launchAutoHide: false,
      backgroundColor: '#F4F3F8',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;