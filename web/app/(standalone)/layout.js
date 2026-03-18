import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'ELS 운전원 전용',
  description: 'ELS Driver Tracking Standalone App',
  manifest: '/manifest_driver.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ELS 운전원',
  },
  icons: {
    icon: '/favicon.png',
    apple: 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png',
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
        <div id="standalone-root" style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#f8fafc' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
