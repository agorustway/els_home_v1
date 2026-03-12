'use client';
import Image from 'next/image';
import styles from './Intro.module.css';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function Intro() {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <section id="intro" className="section">
                <div className="container">
                    <div className={styles.content}>
                        <div className={styles.textColumn}>
                            <h2 className={styles.title}>회사 소개 <span className={styles.blue}>Company Profile</span></h2>
                            <h3 className={styles.tagline} style={{ fontSize: '2.5rem' }}>이엘에스솔루션</h3>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section id="intro" className="section">
            <div className="container">
                <div className={styles.content}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className={styles.textColumn}
                    >
                        <h2 className={styles.title}>회사 소개 <span className={styles.blue}>Company Profile</span></h2>
                        <h3 className={styles.tagline}>TRUSTED LOGISTICS<br /><span className={styles.highlight}>PARTNER</span></h3>
                        <div className={styles.description}>
                            <p>
                                2013년 설립된 이엘에스솔루션은 국내 컨테이너 및 카고, <strong>자동차 KD 부품, 철강 내륙 운송</strong> 분야에서
                                풍부한 현장 경험과 노하우를 보유하고 있습니다.
                            </p>
                            <p style={{ marginTop: '15px' }}>
                                수도권 및 중부권을 중심으로 인천, 평택, 광양, 부산 등 주요 항만과 연계된
                                <strong>선적 및 운송 서비스</strong>를 안정적으로 수행하며 고객의 신뢰를 쌓아왔습니다.
                            </p>
                            <p style={{ marginTop: '15px' }}>
                                협력사와의 유기적인 거점(CY) 운영 관리를 통해 화주 공장 인접 지역에서
                                <strong>긴급 상황 시 가장 유연하게 대응</strong>하는 것이 우리의 핵심 경쟁력입니다.
                            </p>
                        </div>
                    </motion.div>

                    <div className={styles.visualColumn}>
                        <motion.div
                            className={styles.logoIntroFrame}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1.2 }}
                        >
                            <div className={styles.logoCenter}>
                                <Image
                                    src="/images/logo.png"
                                    alt="ELS Solution Logo"
                                    width={400}
                                    height={120}
                                    style={{ height: 'auto', width: 'auto', maxWidth: '100%' }}
                                />
                            </div>
                            
                            <div className={styles.summaryGrid}>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>전문 분야</span>
                                    <span className={styles.summaryVal}>컨테이너, 벌크, KD부품, 철강</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>주요 거점</span>
                                    <span className={styles.summaryVal}>아산, 울산, 평택, 당진 外</span>
                                </div>
                                <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>운영 철학</span>
                                    <span className={styles.summaryVal}>안전 최우선 & 실시간 대응</span>
                                </div>
                            </div>
                            
                            <motion.div
                                className={styles.smartBadge}
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.6, duration: 0.8 }}
                            >
                                <div className={styles.badgeIcon}>🏢</div>
                                <div>
                                    <h4>스마트 물류 시스템</h4>
                                    <p>실시간 관제 및 가시화 플랫폼 운영</p>
                                </div>
                            </motion.div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
