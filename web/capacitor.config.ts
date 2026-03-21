import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elssolution.driver',
  appName: 'ELS-운송관리',
  webDir: 'out',
  // 로컬 파일에서 앱 로딩 (원격 서버 의존 제거)
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
