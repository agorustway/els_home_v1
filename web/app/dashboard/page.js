'use client';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Dashboard from '../../components/Dashboard';
import SubPageHero from '../../components/SubPageHero';

export default function DashboardPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="라이브 대시보드"
                subtitle="실시간 물류 현황 및 지표 데이터"
                bgImage="/images/hero_logistics.png"
            />
            <main>
                <Dashboard />
            </main>
            <Footer />
        </>
    );
}
