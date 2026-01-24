import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "ELS SOLUTION",
  description: "Total Logistics Solution Provider",
  referrer: 'origin-when-cross-origin',
  icons: {
    icon: '/images/logo_shot.png',
    shortcut: '/images/logo_shot.png',
    apple: '/images/logo_shot.png',
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

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <Suspense fallback={null}>
          <ActivityLogger />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
