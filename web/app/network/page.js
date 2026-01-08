'use client';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import Network from '../../components/Network';
import SubPageHero from '../../components/SubPageHero';

export default function NetworkPage() {
    return (
        <>
            <Header />
            <SubPageHero
                title="네트워크"
                subtitle="전국 주요 거점을 잇는 이엘에스솔루션의 인프라"
                bgImage="/images/hero_cy.png"
            />
            <main>
                <Network />
            </main>
            <Footer />
        </>
    );
}
