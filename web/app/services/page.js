'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Business from '@/components/Business';
import SubPageHero from '@/components/SubPageHero';

export default function ServicesPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="Service"
                subtitle="고객의 가치를 최우선으로 하는 맞춤형 물류 및 제조 서비스"
                bgImage="/images/hero_cy.png"
            />
            <main>
                <Business />
            </main>
            <Footer />
        </>
    );
}
