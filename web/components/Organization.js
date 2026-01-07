'use client';
import styles from './Organization.module.css';
import { motion } from 'framer-motion';

export default function Organization() {
    const manpower = [
        { label: '경영지원', count: 6 },
        { label: '영업관리', count: 4 },
        { label: '현장관리', count: 46 },
        { label: '현장직', count: 389 },
    ];

    return (
        <section id="organization" className={`section ${styles.bg}`}>
            <div className="container">
                <h2 className="sectionTitle">조직 구성</h2>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <p style={{ color: 'var(--text-gray)' }}>총 임직원: <strong>445명</strong> (2023년 기준)</p>
                </div>

                <div className={styles.chartContainer}>
                    <svg className={styles.svgLines} width="100%" height="100%">
                        <line x1="50%" y1="50" x2="50%" y2="80" stroke="#0056b3" strokeWidth="2" />
                        <line x1="20%" y1="80" x2="80%" y2="80" stroke="#0056b3" strokeWidth="2" />
                        <line x1="20%" y1="80" x2="20%" y2="120" stroke="#0056b3" strokeWidth="2" />
                        <line x1="50%" y1="80" x2="50%" y2="120" stroke="#0056b3" strokeWidth="2" />
                        <line x1="80%" y1="80" x2="80%" y2="120" stroke="#0056b3" strokeWidth="2" />
                    </svg>

                    <div className={styles.nodeWrapper}>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            className={styles.ceoNode}
                        >
                            CEO
                        </motion.div>

                        <div className={styles.departments}>
                            <motion.div className={styles.deptNode}>
                                <h4>물류사업부</h4>
                                <p>아산, 중부, 예산지점</p>
                            </motion.div>

                            <motion.div className={`${styles.deptNode} ${styles.primary}`}>
                                <h4>영업지원부</h4>
                                <p>울산, 서산, 당진지점</p>
                            </motion.div>

                            <motion.div className={styles.deptNode}>
                                <h4>경영지원부</h4>
                                <p>영천, 금호, 임고지점</p>
                            </motion.div>
                        </div>
                    </div>

                    <div className={styles.manpowerGrid}>
                        {manpower.map((m, i) => (
                            <div key={i} className={styles.manPowerCard}>
                                <span className={styles.mpCount}>{m.count}명</span>
                                <span className={styles.mpLabel}>{m.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
