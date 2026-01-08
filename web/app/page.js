'use client';
import { useEffect } from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Intro from '../components/Intro';
import History from '../components/History';
import Organization from '../components/Organization';
import Vision from '../components/Vision';
import ESG from '../components/ESG';
import Dashboard from '../components/Dashboard';
import Network from '../components/Network';
import Business from '../components/Business';
import Footer from '../components/Footer';

export default function Home() {
  useEffect(() => {
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
    <>
      <Header />
      <main>
        <Hero />
        <div className="animate-section"><Intro /></div>
        <div className="animate-section"><Business /></div>
        <div className="animate-section"><Vision /></div>
        <div className="animate-section"><ESG /></div>
        <div className="animate-section" style={{ background: '#f8fbff' }}><Organization /></div>
        <div className="animate-section"><History /></div>
        <div className="animate-section"><Dashboard /></div>
        <div className="animate-section"><Network /></div>
      </main>
      <Footer />
    </>
  );
}
