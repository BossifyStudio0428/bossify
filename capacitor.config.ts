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
  appId: 'com.bossify.app',
  appName: 'Bossify',
  webDir: 'dist',
  server: {
    url: 'https://bossify-malaysia.lovable.app',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#6B46C1',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;