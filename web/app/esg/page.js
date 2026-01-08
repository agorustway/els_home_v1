'use client';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import ESG from '../../components/ESG';
import SubNav from '../../components/SubNav';
import SubPageHero from '../../components/SubPageHero';

export default function ESGPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="ESG"
                subtitle="지속가능한 물류의 미래를 위한 약속"
                bgImage="/images/container_logistics.png"
            />
            <SubNav />
            <main>
                <ESG />
            </main>
            <Footer />
        </>
    );
}
