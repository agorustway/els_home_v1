'use client';
import styles from './Network.module.css';
import { motion } from 'framer-motion';

export default function Network() {
    const branches = [
        { region: '충청권', icons: '🏭', list: '아산지점, 중부지점, 당진지점, 예산지점, 서산지점' },
        { region: '영남권', icons: '🚢', list: '울산지점, 영천지점, 금호지점, 임고지점' },
    ];

    return (
        <section id="network" className={styles.networkSection}>
            <div className="container">
                <h2 className="sectionTitle">거점 현황 및 네트워크</h2>
                <div className={styles.flexContent}>
                    <div className={styles.infoCol}>
                        <div className={styles.hqBox}>
                            <span className={styles.hqLabel}>Headquarters</span>
                            <h3>서울 본사</h3>
                            <p>서울특별시 서초구 효령로 424 대명빌딩 2F</p>
                        </div>

                        <div className={styles.facBox}>
                            <h4>물류 거점 (Special Facilities)</h4>
                            <div className={styles.cyGrid}>
                                <div className={styles.cyItem}>
                                    <strong>아산 CY</strong>
                                    <span>5,000평 규모</span>
                                </div>
                                <div className={styles.cyItem}>
                                    <strong>중부 CY</strong>
                                    <span>1,000평 규모</span>
                                </div>
                            </div>
                            <p className={styles.equipNote}>* 리치스태커 등 전용 장비 보유 및 직접 운영</p>
                        </div>
                    </div>

                    <div className={styles.branchCol}>
                        {branches.map((b, i) => (
                            <motion.div
                                key={i}
                                className={styles.regionCard}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                            >
                                <div className={styles.regionHeader}>
                                    <span className={styles.regionIcon}>{b.icons}</span>
                                    <h4>{b.region}</h4>
                                </div>
                                <p>{b.list}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
