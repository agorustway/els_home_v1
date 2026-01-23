'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import IntranetSubNav from '@/components/IntranetSubNav';
import styles from './employees.module.css';
import { motion } from 'framer-motion';

export default function EmployeesPortal() {
    return (
        <>
            <Header />
            <SubPageHero
                title="Intranet"
                subtitle="업무 효율을 높이는 스마트한 솔루션, ELS 인트라넷 포털입니다."
                bgImage="/images/hero_cy.png"
            />
            <IntranetSubNav />
            <div className={styles.layoutWrapper}>
                <main className={styles.mainContent}>
                    <div className={styles.page}>
                        {/* Portal Links */}
                        <section className={styles.portalSection}>
                            <div className="container">
                                <motion.div
                                    className={styles.sectionLabel}
                                    initial={{ opacity: 0, x: -20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                >
                                    주요 시스템
                                </motion.div>

                                <div className={styles.gridContainer}>
                                    <motion.a
                                        href="/employees/archive"
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <div className={styles.cardIcon}>📂</div>
                                        <h3 className={styles.cardTitle}>자료실 (NAS)</h3>
                                        <p className={styles.cardDesc}>사내 파일 공유, 데이터 아카이빙 및 대용량 자료 전송을 위한 서버입니다.</p>
                                        <div className={styles.arrow}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                        </div>
                                    </motion.a>

                                    <motion.a
                                        href="/employees/board/free"
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <div className={styles.cardIcon}>💬</div>
                                        <h3 className={styles.cardTitle}>자유게시판</h3>
                                        <p className={styles.cardDesc}>임직원 간의 자유로운 소통과 정보를 교환하는 공간입니다.</p>
                                        <div className={styles.arrow}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                        </div>
                                    </motion.a>

                                    <motion.a
                                        href="/employees/webzine"
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.35 }}
                                    >
                                        <div className={styles.cardIcon}>📰</div>
                                        <h3 className={styles.cardTitle}>웹진 (블로그)</h3>
                                        <p className={styles.cardDesc}>사내 소식, 행사, 인터뷰 등 다양한 이야기를 공유합니다.</p>
                                        <div className={styles.arrow}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                        </div>
                                    </motion.a>

                                    <motion.a
                                        href="/employees/reports"
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.4 }}
                                    >
                                        <div className={styles.cardIcon}>📊</div>
                                        <h3 className={styles.cardTitle}>업무보고 시스템</h3>
                                        <p className={styles.cardDesc}>지점별 일일 업무 보고 및 통합 실적 관리를 수행합니다.</p>
                                        <div className={styles.arrow}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                        </div>
                                    </motion.a>
                                </div>

                                <motion.div
                                    className={styles.sectionLabel}
                                    initial={{ opacity: 0, x: -20 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.3 }}
                                    style={{ marginTop: '60px' }}
                                >
                                    지점별 서비스
                                </motion.div>

                                <div className={styles.branchGrid}>
                                    {[
                                        { name: '아산지점', eng: 'Asan', link: '/employees/branches/asan' },
                                        { name: '아산CY', eng: 'Asan CY', link: '/employees/branches/asan_cy' },
                                        { name: '중부지점', eng: 'Jungbu', link: '/employees/branches/jungbu' },
                                        { name: '당진지점', eng: 'Dangjin', link: '/employees/branches/dangjin' },
                                        { name: '예산지점', eng: 'Yesan', link: '/employees/branches/yesan' },
                                        { name: '서산지점', eng: 'Seosan', link: '/employees/branches/seosan' },
                                        { name: '연천지점', eng: 'Yeoncheon', link: '/employees/branches/yeoncheon' },
                                        { name: '울산지점', eng: 'Ulsan', link: '/employees/branches/ulsan' },
                                        { name: '임고지점', eng: 'Imgo', link: '/employees/branches/imgo' },
                                        { name: '벌크사업부', eng: 'Bulk', link: '/employees/branches/bulk' }
                                    ].map((branch, i) => (
                                        <motion.a
                                            key={branch.eng}
                                            href={branch.link}
                                            className={styles.branchCard}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.4 + (i * 0.1) }}
                                        >
                                            <span className={styles.branchName}>{branch.name}</span>
                                            <span className={styles.branchEng}>{branch.eng}</span>
                                        </motion.a>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
            <Footer />
        </>
    );
}
