import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Bossify Android app.
 *
 * Strategy: the app is a thin native shell that loads the published
 * Lovable site directly. Without `server.url`, Capacitor tries to boot
 * local TanStack Start build files from `dist/`, which is what caused
 * the downloaded APK to open to a black screen.
 *
 * If you ever want a fully offline app, remove the `server.url` block
 * and switch to a static SPA build copied into `dist/`.
 */
const config: CapacitorConfig = {
  appId: 'com.zhstudio.bossify',
  appName: 'Bossify',
  webDir: 'dist',
  backgroundColor: '#F4F3F8',
  server: {
    url: 'https://bossify-malaysia.lovable.app',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['bossify-malaysia.lovable.app'],
  },
  android: {
    backgroundColor: '#F4F3F8',
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
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#F4F3F8',
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