'use client';

import Link from 'next/link';
import styles from './employees.module.css';
import { motion } from 'framer-motion';

const Arrow = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;

export default function EmployeesPortal() {
    return (
        <div className={styles.layoutWrapper}>
            <div className={styles.page}>
                <section className={styles.portalSection}>
                    <header className={styles.portalHeader}>
                        <h1 className={styles.portalTitle}>인트라넷 홈</h1>
                        <p className={styles.portalSubtitle}>주요 서비스 바로가기</p>
                    </header>

                    <div className={styles.gridContainer}>
                        {/* 자동화시스템: 자료실 (NAS) */}
                        <Link href="/employees/archive" className={styles.cardWrap}>
                            <motion.div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgNas}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                                <h3 className={styles.cardTitle}>자료실 (NAS)</h3>
                                <p className={styles.cardDesc}>협업 문구, 매뉴얼, 사내 자료 통합 관리</p>
                                <span className={styles.cardCta}>자료실 바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>

                        {/* 자동화시스템: 컨테이너 이력조회 */}
                        <Link href="/employees/container-history" className={styles.cardWrap}>
                            <motion.div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgContainer}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
                                <h3 className={styles.cardTitle}>컨테이너 이력조회</h3>
                                <p className={styles.cardDesc}>ETRANS 연동 · 컨테이너 번호/엑셀 업로드 후 조회·엑셀 다운로드</p>
                                <span className={styles.cardCta}>이력조회 바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>

                        {/* 자동화시스템: 안전운임 조회 */}
                        <Link href="/employees/safe-freight" className={styles.cardWrap}>
                            <motion.div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgSafeFreight}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.075 }}>
                                <h3 className={styles.cardTitle}>안전운임 조회</h3>
                                <p className={styles.cardDesc}>화물자동차 안전운임 고시 · 구간별/거리별 운임 조회·엑셀 다운로드</p>
                                <span className={styles.cardCta}>안전운임 조회 <Arrow /></span>
                            </motion.div>
                        </Link>

                        {/* 자유게시판 */}
                        <Link href="/employees/board/free" className={styles.cardWrap}>
                            <motion.div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgBoard}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                                <h3 className={styles.cardTitle}>자유게시판</h3>
                                <p className={styles.cardDesc}>사내 소통 · 자유게시판</p>
                                <span className={styles.cardCta}>자유게시판 <Arrow /></span>
                            </motion.div>
                        </Link>

                        {/* 업무보고 */}
                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.125 }}>
                            <div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgReports}`}>
                                <h3 className={styles.cardTitle}>업무보고</h3>
                                <p className={styles.cardDesc}>실적 보고 및 일일 업무 사항 묶음 관리</p>
                                <div className={styles.cardLinks}>
                                    <Link href="/employees/reports" className={styles.cardLinkItem}>통합 업무보고 <Arrow /></Link>
                                    <Link href="/employees/reports/my" className={styles.cardLinkItem}>내 업무보고 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>

                        {/* 자료실: 업무자료실·서식자료실 */}
                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                            <div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgDocs}`}>
                                <h3 className={styles.cardTitle}>자료실</h3>
                                <p className={styles.cardDesc}>업무자료실 · 서식자료실</p>
                                <div className={styles.cardLinks}>
                                    <Link href="/employees/work-docs" className={styles.cardLinkItem}>업무자료실 <Arrow /></Link>
                                    <Link href="/employees/form-templates" className={styles.cardLinkItem}>서식자료실 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>

                        {/* 연락처 */}
                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.175 }}>
                            <div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgContacts}`}>
                                <h3 className={styles.cardTitle}>연락처</h3>
                                <p className={styles.cardDesc}>사내·외부 연락망 · 작업지 확인</p>
                                <div className={styles.cardLinks}>
                                    <Link href="/employees/internal-contacts" className={styles.cardLinkItem}>사내연락망 <Arrow /></Link>
                                    <Link href="/employees/external-contacts" className={styles.cardLinkItem}>외부연락처 <Arrow /></Link>
                                    <Link href="/employees/work-sites" className={styles.cardLinkItem}>작업지확인 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>

                        {/* 지점서비스 */}
                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                            <div className={`${styles.card} ${styles.cardWithBg} ${styles.cardBgBranches}`}>
                                <h3 className={styles.cardTitle}>지점서비스</h3>
                                <p className={styles.cardDesc}>전국 거점 및 지점별 전용 서비스</p>
                                <div className={styles.cardLinks}>
                                    <Link href="/employees/branches/headquarters" className={styles.cardLinkItem}>서울본사 <Arrow /></Link>
                                    <Link href="/employees/branches/asan" className={styles.cardLinkItem}>아산지점 <Arrow /></Link>
                                    <Link href="/employees/branches/jungbu" className={styles.cardLinkItem}>중부지점 <Arrow /></Link>
                                    <Link href="/employees/branches/dangjin" className={styles.cardLinkItem}>당진지점 <Arrow /></Link>
                                    <Link href="/employees/branches/yesan" className={styles.cardLinkItem}>예산지점 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>
            </div>
        </div>
    );
}
