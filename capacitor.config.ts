import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Bossify Android app.
 *
 * Strategy: offline Play Store build. The TanStack Start client bundle is
 * generated into `dist/client`, then Capacitor copies that into the APK/AAB.
 * Do not set `server.url` here — that turns the app into a remote WebView.
 */
const config: CapacitorConfig = {
  appId: 'com.zhstudio.bossify',
  appName: 'Bossify',
  webDir: 'dist/client',
  backgroundColor: '#F4F3F8',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#F4F3F8',
  },
  plugins: {
    // Route window.fetch through native HTTP on Android/iOS.
    // Fixes "Failed to fetch" when the WebView blocks cross-origin calls
    // (e.g. admin API on bossify-malaysia.lovable.app from the APK shell).
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#F4F3F8',
    },
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: '#F4F3F8',
      showSpinner: false,
    },
  },
};

export default config;