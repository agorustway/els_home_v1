'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Intro from '@/components/Intro';
import SubNav from '@/components/SubNav';
import SubPageHero from '@/components/SubPageHero';

export default function IntroPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="회사소개"
                subtitle="고객공감 서비스를 실현하는 운송 및 제조 서비스 전문 기업"
                bgImage="/images/office_intro.png"
            />
            <SubNav />
            <main>
                <Intro />
            </main>
            <Footer />
        </>
    );
}
