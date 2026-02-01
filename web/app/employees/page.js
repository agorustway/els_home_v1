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
                        <p className={styles.portalSubtitle}>시스템 · 주요 서비스 바로가기</p>
                    </header>

                    <div className={styles.gridContainer}>
                        <Link href="/employees/archive" className={styles.cardWrap}>
                            <motion.div className={styles.card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                                <h3 className={styles.cardTitle}>지식정보 자료실</h3>
                                <p className={styles.cardDesc}>협업 문구, 매뉴얼, 사내 자료(NAS) 통합 관리</p>
                                <span className={styles.cardCta}>자료실 바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>

                        <Link href="/employees/container-history" className={styles.cardWrap}>
                            <motion.div className={styles.card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
                                <h3 className={styles.cardTitle}>컨테이너 이력조회</h3>
                                <p className={styles.cardDesc}>etrans 연동 · 컨테이너 번호/엑셀 업로드 후 조회·엑셀 다운로드</p>
                                <span className={styles.cardCta}>이력조회 바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>

                        <Link href="/employees/safe-freight" className={styles.cardWrap}>
                            <motion.div className={styles.card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.075 }}>
                                <h3 className={styles.cardTitle}>안전운임 조회</h3>
                                <p className={styles.cardDesc}>화물자동차 안전운임 고시 · 구간별/거리별 운임 조회·엑셀 다운로드</p>
                                <span className={styles.cardCta}>안전운임 조회 <Arrow /></span>
                            </motion.div>
                        </Link>

                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                            <div className={styles.card}>
                                <h3 className={styles.cardTitle}>통합 업무보고</h3>
                                <p className={styles.cardDesc}>실적 보고 및 일일 업무 사항 묶음 관리</p>
                                <div className={styles.cardLinks}>
                                    <Link href="/employees/reports" className={styles.cardLinkItem}>전체 업무현황 <Arrow /></Link>
                                    <Link href="/employees/reports/my" className={styles.cardLinkItem}>내 보고서 관리 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div className={styles.cardWrap} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
                            <div className={styles.card}>
                                <h3 className={styles.cardTitle}>지점별 서비스</h3>
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

                        <Link href="/employees/board/free" className={styles.cardWrap}>
                            <motion.div className={styles.card} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                                <h3 className={styles.cardTitle}>소통 · 자유게시판</h3>
                                <p className={styles.cardDesc}>사내 자유게시판</p>
                                <span className={styles.cardCta}>자유게시판 <Arrow /></span>
                            </motion.div>
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
