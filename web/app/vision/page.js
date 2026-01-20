'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Vision from '@/components/Vision';
import SubNav from '@/components/SubNav';
import SubPageHero from '@/components/SubPageHero';

export default function VisionPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="경영이념"
                subtitle="이엘에스솔루션이 추구하는 핵심 가치와 미래상"
                bgImage="/images/hero_cy.png"
            />
            <SubNav />
            <main>
                <Vision />
            </main>
            <Footer />
        </>
    );
}
