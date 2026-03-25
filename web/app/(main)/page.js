'use client';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useRouter } from 'next/navigation';
import Hero from '@/components/Hero';
import Intro from '@/components/Intro';
import History from '@/components/History';
import Organization from '@/components/Organization';
import Vision from '@/components/Vision';
import ESG from '@/components/ESG';
import Dashboard from '@/components/Dashboard';
import WebzineSection from '@/components/WebzineSection';
import Network from '@/components/Network';
import Business from '@/components/Business';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // 📱 모바일 앱(네이티브) 환경에서는 운전원 앱으로 즉시 리다이렉트
    if (Capacitor.isNativePlatform()) {
      router.replace('/driver-app');
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    });

    const sections = document.querySelectorAll('.animate-section');
    sections.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <Hero />
      <div className="animate-section"><Intro /></div>
      <div className="animate-section"><Business /></div>
      <div className="animate-section"><Vision /></div>
      <div className="animate-section"><ESG /></div>
      <div className="animate-section" style={{ background: '#f8fbff' }}><Organization /></div>
      <div className="animate-section"><History /></div>
      <div className="animate-section"><Dashboard /></div>
      <div className="animate-section"><WebzineSection /></div>
      <div className="animate-section"><Network /></div>
    </main>
  );
}
