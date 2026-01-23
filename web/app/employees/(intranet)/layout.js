import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import IntranetSubNav from '@/components/IntranetSubNav';
import layoutStyles from './intranet.module.css';

export default function EmployeeLayout({ children }) {
    return (
        <>
            <Header />
            <SubPageHero
                title="Intranet"
                subtitle="자유로운 정보 공유와 효율적인 업무 협업을 위한 사내 인트라넷입니다."
                bgImage="/images/hero_cy.png"
            />
            <IntranetSubNav />
            <main className={layoutStyles.mainContent}>
                {children}
            </main>
            <Footer />
        </>
    );
}
