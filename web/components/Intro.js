'use client';
import Image from 'next/image';
import styles from './Intro.module.css';
import { motion } from 'framer-motion';

export default function Intro() {
    return (
        <section id="intro" className="section" style={{ overflow: 'hidden' }}>
            <div className="container">
                <div className={styles.content}>
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                        className={styles.textColumn}
                    >
                        <h2 className={styles.title}>회사 소개 <span className={styles.blue}>Company Profile</span></h2>
                        <h3 className={styles.tagline} style={{ fontSize: '2.5rem' }}>(주)이엘에스솔루션</h3>
                        <div className={styles.description}>
                            <p>
                                2013년 설립 이후 우수물류기업으로 꾸준히 성장하고 있는 <br />
                                <strong>운송 및 제조 서비스 전문 기업</strong>입니다.
                            </p>
                            <p style={{ marginTop: '20px' }}>
                                고객공감 서비스를 실현하기 위해 품질, 상생, 윤리, CS경영을 <br />
                                핵심 가치로 추구하며 지속적인 영향력을 넓혀가고 있습니다.
                            </p>
                            <div className={styles.stats}>
                                <div className={styles.statItem}>
                                    <span className={styles.statNum}>749억</span>
                                    <span className={styles.statLabel}>2022년 매출액</span>
                                </div>
                                <div className={styles.statItem}>
                                    <span className={styles.statNum}>27%</span>
                                    <span className={styles.statLabel}>전년 대비 성장률</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <div className={styles.imageColumn}>
                        <motion.div
                            animate={{ y: [0, -15, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className={styles.imageWrapper}
                        >
                            <Image
                                src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
                                alt="Logistics Center"
                                width={600}
                                height={400}
                                className={styles.mainImg}
                            />
                        </motion.div>
                        <motion.div
                            animate={{ y: [0, 15, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            className={`${styles.imageWrapper} ${styles.small}`}
                        >
                            <Image
                                src="https://images.unsplash.com/photo-1519003306447-425030491764?auto=format&fit=crop&w=800&q=80"
                                alt="Transportation"
                                width={600}
                                height={400}
                                className={styles.subImg}
                            />
                        </motion.div>
                        <div className={styles.decoCircle} />
                    </div>
                </div>
            </div>
        </section>
    );
}
