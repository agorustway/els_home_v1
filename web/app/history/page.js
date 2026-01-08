'use client';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import History from '../../components/History';
import SubNav from '../../components/SubNav';
import SubPageHero from '../../components/SubPageHero';

export default function HistoryPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="연혁"
                subtitle="끊임없는 변화와 성장의 발걸음"
                bgImage="/images/hero_logistics.png"
            />
            <SubNav />
            <main>
                <History />
            </main>
            <Footer />
        </>
    );
}
