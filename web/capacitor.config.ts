import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elssolution.driver',
  appName: 'ELS차량용',
  webDir: 'driver-src',
  server: {
    androidScheme: 'https',
    hostname: 'www.elssolution.com',
    cleartext: true
  },
  android: {
    useLegacyBridge: true,  // BackgroundGeolocation 플러그인 필수 — 5분 후 백그라운드 중단 방지
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
