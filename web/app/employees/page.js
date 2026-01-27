'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Link from 'next/link';
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
                                <div className={styles.sectionLabel}>주요 시스템</div>

                                <div className={styles.gridContainer}>
                                    {/* 1. 자료/소통 시스템 */}
                                    <Link href="/employees/archive" style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <motion.div
                                            className={styles.card}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                        >
                                            <div>
                                                <div className={styles.cardIcon}>📂</div>
                                                <h3 className={styles.cardTitle}>지식정보 자료실</h3>
                                                <p className={styles.cardDesc}>협업 문구, 매뉴얼, 사내 자료(NAS) 통합 관리 서버</p>
                                            </div>
                                            <div className={styles.cardLinks}>
                                                <div className={styles.cardLinkItem}>사내 자료실 바로가기 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg></div>
                                            </div>
                                        </motion.div>
                                    </Link>

                                    <motion.div
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <div>
                                            <div className={styles.cardIcon}>📊</div>
                                            <h3 className={styles.cardTitle}>통합 업무보고</h3>
                                            <p className={styles.cardDesc}>실적 보고 및 일일 업무 사항 묶음 관리</p>
                                        </div>
                                        <div className={styles.cardLinks}>
                                            {[
                                                { label: '📊 전체 업무현황', href: '/employees/reports' },
                                                { label: '📝 내 보고서 관리', href: '/employees/reports/my' },
                                                { label: '📅 일일 업무일지', href: '/employees/reports/daily' },
                                                { label: '📆 월간 실적보고', href: '/employees/reports/monthly' },
                                            ].map((link) => (
                                                <a key={link.label} href={link.href} className={styles.cardLinkItem}>
                                                    {link.label}
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
                                                </a>
                                            ))}
                                        </div>
                                    </motion.div>

                                    {/* 2. 지점별 서비스 (묶음) */}
                                    <motion.div
                                        className={styles.card}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <div>
                                            <div className={styles.cardIcon}>🏢</div>
                                            <h3 className={styles.cardTitle}>지점별 서비스</h3>
                                            <p className={styles.cardDesc}>전국 거점 및 지점별 전용 서비스 통합</p>
                                        </div>
                                        <div className={styles.cardLinks}>
                                            <div className={styles.groupLabel} style={{ marginTop: '0', fontSize: '0.75rem' }}>수도권/본사</div>
                                            <a href="/employees/branches/headquarters" className={styles.cardLinkItem}>
                                                🏢 서울본사 데스크
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
                                            </a>
                                            <div className={styles.groupLabel} style={{ marginTop: '10px', fontSize: '0.75rem' }}>충청권 지점</div>
                                            {[
                                                { name: '🚚 아산지점', href: '/employees/branches/asan' },
                                                { name: '🏭 중부지점', href: '/employees/branches/jungbu' },
                                                { name: '🏗️ 당진지점', href: '/employees/branches/dangjin' },
                                                { name: '🚛 예산지점', href: '/employees/branches/yesan' },
                                            ].map((link) => (
                                                <a key={link.name} href={link.href} className={styles.cardLinkItem}>
                                                    {link.name}
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
                                                </a>
                                            ))}
                                        </div>
                                    </motion.div>

                                    <Link href="/employees/board/free" style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <motion.div
                                            className={styles.card}
                                            initial={{ opacity: 0, y: 20 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.3 }}
                                        >
                                            <div>
                                                <div className={styles.cardIcon}>💬</div>
                                                <h3 className={styles.cardTitle}>소통 및 웹진</h3>
                                                <p className={styles.cardDesc}>자유게시판 및 사내 웹진 채널</p>
                                            </div>
                                            <div className={styles.cardLinks}>
                                                <Link href="/employees/board/free" className={styles.cardLinkItem}>💬 자유게시판 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg></Link>
                                                <Link href="/employees/webzine" className={styles.cardLinkItem}>📰 사내 웹진 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg></Link>
                                            </div>
                                        </motion.div>
                                    </Link>
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
