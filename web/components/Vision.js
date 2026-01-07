'use client';
import styles from './Vision.module.css';
import { motion } from 'framer-motion';

export default function Vision() {
    const values = [
        { title: 'Quality', kor: '품질경영', desc: '최고의 서비스 제공' },
        { title: 'Win-win', kor: '상생경영', desc: '동반 성장 추구' },
        { title: 'Ethics', kor: '윤리경영', desc: '투명하고 정직한 활동' },
        { title: 'CS', kor: 'CS경영', desc: '고객 공감 서비스' },
    ];

    return (
        <section id="vision" className="section">
            <div className="container">
                <h2 className="sectionTitle">경영이념 및 비전</h2>

                <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className={styles.visionStatement}
                    >
                        "고객중심 · 사회적공헌 · 상생윤리"
                    </motion.div>
                </div>

                <div className={styles.visionContainer}>
                    <div className={styles.centerHex}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
                            className={styles.rotatingBg}
                        />
                        <div className={styles.centerContent}>
                            <h3>CORE</h3>
                            <p>VALUES</p>
                        </div>
                    </div>

                    <div className={styles.vNodes}>
                        {values.map((v, i) => (
                            <motion.div
                                key={i}
                                className={`${styles.vNode} ${styles[`pos${i}`]}`}
                                initial={{ opacity: 0, scale: 0 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1, type: "spring" }}
                            >
                                <div className={styles.vCircle}>
                                    <h4 style={{ color: 'var(--primary-blue)' }}>{v.kor}</h4>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{v.desc}</span>
                                </div>
                                <div className={styles.connector} style={{ background: 'var(--primary-blue)', opacity: 0.2 }} />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
