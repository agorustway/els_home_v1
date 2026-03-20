import { Inter } from "next/font/google";
import { Suspense } from "react";
import BrowserGuard from "@/components/BrowserGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'ELS 차량용 운송관리',
  description: 'ELS Driver Tracking Standalone App',
  manifest: '/manifest_driver.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ELS 운송',
  },
  icons: {
    icon: '/driver_icon.png',
    apple: '/driver_icon.png',
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function StandaloneLayout({ children }) {
  return (
    <html lang="ko">
      <body className={inter.className} style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        <Suspense fallback={null}>
          <BrowserGuard />
        </Suspense>
        <div id="standalone-root" style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#f8fafc' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
