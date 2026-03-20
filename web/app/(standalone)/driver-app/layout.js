import React from 'react';

export const metadata = {
  title: 'ELS 운전원 전용 앱',
  description: 'ELS 차량 위치 관제 및 운송 현황 관리 시스템',
  manifest: '/manifest_driver.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ELS 운송관리',
  },
  icons: {
    icon: '/driver_icon.png',
    apple: '/driver_icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 0,
  viewportFit: 'cover',
  themeColor: '#1e293b',
};

export default function DriverAppLayout({ children }) {
  return (
    <div id="driver-app-root">
      {children}
    </div>
  );
}
