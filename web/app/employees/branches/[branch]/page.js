'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import IntranetSubNav from '@/components/IntranetSubNav';
import styles from '../../employees.module.css'; // Reuse existing styles for consistency
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import AsanMealGame from '@/components/AsanMealGame';

export default function BranchPage({ params }) {
    const routeParams = useParams();
    const branch = routeParams?.branch || params?.branch;

    const branchName = {
        asan: '아산지점',
        jungbu: '중부지점',
        dangjin: '당진지점',
        yesan: '예산지점',
        headquarters: '서울본사'
    }[branch] || '지점';

    return (
        <>
            <Header />
            <SubPageHero
                title="Branch"
                subtitle={`${branchName} 임직원을 위한 전용 인트라넷 공간입니다.`}
                bgImage="/images/hero_cy.png"
            />
            <IntranetSubNav />
            <main className={styles.branchMain}>
                <div className={styles.page}>
                    <div className="container">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={styles.branchContent}
                        >
                            <span className={styles.branchTag}>Branch Operations</span>
                            <h1 className={styles.branchTitle}>{branchName} 임직원 공간</h1>
                            <p className={styles.branchDesc}>해당 지점 임직원을 위한 전용 공간입니다.<br />현재 페이지 준비 중입니다. 잠시만 기다려 주세요.</p>

                            {branch === 'asan' && (
                                <div className={styles.gameWrapper}>
                                    <h3 className={styles.gameTitle}>🍱 아산지점 오늘의 식단게임</h3>
                                    <AsanMealGame />
                                </div>
                            )}
                            <div className={styles.branchDivider} />
                        </motion.div>
                    </div>
                </div>
            </main>
            <Footer />
        </>
    );
}
