'use client';
import { useState, useRef } from 'react';
import styles from './Dashboard.module.css';
import { motion, useInView, AnimatePresence } from 'framer-motion';

const chartData = [
    { year: '21년', value: 591.5 },
    { year: '22년', value: 749.6 },
    { year: '23년', value: 765.8 },
    { year: '24년', value: 766.4 },
];

const MIN_VALUE = 550; // 하단의 생략할 최솟값
const MAX_VALUE = 800; // 상단의 최댓값

const certs = [
    { id: 1, name: 'EcoVadis 실버 메달', img: '' },
    { id: 2, name: 'ISO 14001 인증', img: '' },
    { id: 3, name: 'ISO 9001 인증', img: '' },
    { id: 4, name: 'ISO 45001 인증', img: '' },
    { id: 5, name: '운송사업허가증', img: '' },
    { id: 6, name: '우수물류기업 인증', img: '' },
    { id: 7, name: '위험물운송자격', img: '' }
];

export default function Dashboard() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-100px' });
    const [selectedCert, setSelectedCert] = useState(null);

    return (
        <section id="dashboard" className={styles.section} ref={ref}>
            <div className="container">
                <div className={styles.header}>
                    <span className={styles.tag}>Financial & Trust Overview</span>
                    <h2 className={styles.title}>재무 및 신뢰 지표</h2>
                </div>

                {/* Section 1: Financial & Facts (6:4 ratio) */}
                <div className={styles.financialGrid}>
                    {/* Left: Bar Chart */}
                    <motion.div
                        className={styles.chartCard}
                        initial={{ opacity: 0, y: 30 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.6 }}
                    >
                        <div className={styles.cardTitle}>연도별 매출 성장 (단위: 억 원)</div>
                        <div className={styles.chartContainer}>
                            {chartData.map((item, idx) => {
                                // 550 아래는 자르고, 차이를 시각적으로 과장하기 위해 나머지 값만 15%~100% 범위로 스케일링
                                const heightPercent = 15 + ((item.value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * 85;
                                return (
                                    <div key={idx} className={styles.barWrapper}>
                                        <div className={styles.barValue}>{item.value}</div>
                                        <div
                                            className={styles.bar}
                                            style={{ height: isInView ? `${heightPercent}%` : '0%' }}
                                        >
                                            <div className={styles.barCut}>~</div>
                                        </div>
                                        <div className={styles.barLabel}>{item.year}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Right: Facts Grid (3 rows) */}
                    <div className={styles.statsGrid}>
                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, x: 30 }}
                            animate={isInView ? { opacity: 1, x: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            <div className={styles.statIcon}>🏢</div>
                            <div className={styles.statInfo}>
                                <div className={styles.statValue}>아산, 세종, 당진, 예산</div>
                                <div className={styles.statLabel}>충청권 주요 거점 및 통합 DEPOT 운영</div>
                            </div>
                        </motion.div>

                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, x: 30 }}
                            animate={isInView ? { opacity: 1, x: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.3 }}
                        >
                            <div className={styles.statIcon}>👥</div>
                            <div className={styles.statInfo}>
                                <div className={styles.statValue}>총 임직원 25명</div>
                            </div>
                        </motion.div>

                        <motion.div
                            className={styles.statCard}
                            initial={{ opacity: 0, x: 30 }}
                            animate={isInView ? { opacity: 1, x: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.4 }}
                        >
                            <div className={styles.statIcon}>📦</div>
                            <div className={styles.statInfo}>
                                <div className={styles.statValue}>월 3,000 FEU</div>
                                <div className={styles.statLabel}>컨테이너 수송 및 KD포장 실적</div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Section 2: Certifications Gallery */}
                <motion.div
                    className={styles.certSection}
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6, delay: 0.5 }}
                >
                    <div className={styles.certTitle}>Certifications & Licenses</div>
                    <div className={styles.certGrid}>
                        {certs.map((cert) => (
                            <div
                                key={cert.id}
                                className={styles.certCard}
                                onClick={() => setSelectedCert(cert)}
                            >
                                <div className={styles.certImgBox}>
                                    {cert.img ? (
                                        <img src={cert.img} alt={cert.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div className={styles.certPlaceholder}>
                                            Image<br />Placeholder
                                        </div>
                                    )}
                                </div>
                                <div className={styles.certName}>{cert.name}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Modal */}
            <AnimatePresence>
                {selectedCert && (
                    <motion.div
                        className={styles.modalOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedCert(null)}
                    >
                        <motion.div
                            className={styles.modalContent}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button className={styles.closeBtn} onClick={() => setSelectedCert(null)}>✕</button>
                            <div className={styles.modalImgBox}>
                                {selectedCert.img ? (
                                    <img src={selectedCert.img} alt={selectedCert.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                    <div className={styles.certPlaceholder} style={{ fontSize: '1.2rem' }}>
                                        [ {selectedCert.name} ]<br /><br />실제 이미지 등록 필요
                                    </div>
                                )}
                            </div>
                            <div className={styles.modalTitle}>{selectedCert.name}</div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
