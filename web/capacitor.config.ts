import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elssolution.driver',
  appName: 'ELS-운송관리',
  webDir: 'out',
  server: {
    url: 'https://nollae.com/driver-app',
    cleartext: true
  }
};

export default config;
