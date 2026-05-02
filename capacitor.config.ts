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