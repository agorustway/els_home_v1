'use client';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from './employees.module.css';
import { motion } from 'framer-motion';

export default function EmployeesPortal() {
    return (
        <>
            <Header />
            <div className={styles.page}>
                <main>
                    {/* Hero Section */}
                    <section className={styles.hero}>
                        <div className="container">
                            <motion.span
                                className={styles.tag}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                EMPLOYEES ONLY
                            </motion.span>
                            <motion.h1
                                className={styles.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                임직원 전용 포털
                            </motion.h1>
                            <motion.p
                                className={styles.desc}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                업무 효율을 높이는 스마트한 솔루션.<br />
                                사내 시스템과 지점별 서비스에 빠르게 접속하세요.
                            </motion.p>
                        </div>
                    </section>

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
                                    href="/admin"
                                    className={styles.card}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.1 }}
                                >
                                    <div className={styles.cardIcon}>🛡️</div>
                                    <h3 className={styles.cardTitle}>관리자 대시보드</h3>
                                    <p className={styles.cardDesc}>인사 정보 관리, 공지사항 등록 및 시스템 설정을 수행합니다.</p>
                                    <div className={styles.arrow}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                                    </div>
                                </motion.a>

                                <motion.a
                                    href="https://elssolution.synology.me"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.card}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className={styles.cardIcon}>💾</div>
                                    <h3 className={styles.cardTitle}>NAS 시스템</h3>
                                    <p className={styles.cardDesc}>사내 파일 공유, 데이터 아카이빙 및 대용량 자료 전송을 위한 서버입니다.</p>
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
                                    { name: '중부지점', eng: 'Jungbu', link: '/employees/branches/jungbu' },
                                    { name: '당진지점', eng: 'Dangjin', link: '/employees/branches/dangjin' },
                                    { name: '예산지점', eng: 'Yesan', link: '/employees/branches/yesan' }
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
                </main>
                <Footer />
            </div>
        </>
    );
}
