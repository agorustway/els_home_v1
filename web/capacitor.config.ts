import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elssolution.driver',
  appName: 'ELS차량용',
  webDir: 'driver-src',
  server: {
    androidScheme: 'https',
    hostname: 'www.nollae.com',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#111111",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      spinnerColor: "#3fb950",
      splashFullScreen: true,
      splashImmersive: true,
    }
  }
};

export default config;
