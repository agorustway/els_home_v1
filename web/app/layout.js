import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "ELS SOLUTION",
  description: "Total Logistics Solution Provider",
  referrer: 'origin-when-cross-origin',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png', // 브라우저 탭 아이콘 (파비콘) 유지
    shortcut: '/favicon.png',
    apple: '/icon.jpg', // iOS 바탕화면 아이콘
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ELS SOLUTION',
    startupImage: [
      '/splash.jpg'
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { Suspense } from 'react';
import ActivityLogger from "@/components/ActivityLogger";
import SiteLayout from "@/components/SiteLayout";
import SplashScreen from "@/components/SplashScreen";

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <SplashScreen />
        <Suspense fallback={null}>
          <ActivityLogger />
        </Suspense>
        <SiteLayout>{children}</SiteLayout>
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('ServiceWorker registration successful');
                }, function(err) {
                  console.log('ServiceWorker registration failed: ', err);
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
