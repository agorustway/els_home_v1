'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Organization from '@/components/Organization';
import SubNav from '@/components/SubNav';
import SubPageHero from '@/components/SubPageHero';

export default function TeamPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="조직도"
                subtitle="효율적인 의사결정과 전문성을 갖춘 조직 구성"
                bgImage="/images/steel_logistics.png"
            />
            <SubNav />
            <main>
                <Organization />
            </main>
            <Footer />
        </>
    );
}
