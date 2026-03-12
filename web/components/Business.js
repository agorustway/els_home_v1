'use client';
import Image from 'next/image';
import styles from './Business.module.css';
import { motion } from 'framer-motion';

const services = [
    {
        title: '컨테이너 물류 (CY 운영)',
        desc: '현대글로비스, 현대모비스 등 수출입 운송 전담 및 아산/중부 전용 DEPOT 운영으로 경쟁우위 확보',
        img: '/images/container_logistics.png',
    },
    {
        title: '철강재 및 일반 물류',
        desc: '현대제철, 현대글로비스 등 주요 화주의 코일, 열연, 철근 등 다양한 품목의 안전 운송 수행',
        img: '/images/steel_logistics.png',
    },
];

export default function Business() {
    return (
        <section id="business" className={styles.businessSection}>
            <div className="container">
                <h2 className="sectionTitle">주요 사업 및 운영 현황</h2>
                <div className={styles.grid}>
                    {services.map((service, idx) => (
                        <motion.div
                            key={idx}
                            className={styles.card}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            whileHover={{ y: -10 }}
                        >
                            <div className={styles.imageBox}>
                                <Image
                                    src={service.img}
                                    alt={service.title}
                                    fill
                                    sizes="(max-width: 768px) 100vw, 400px"
                                    className={styles.img}
                                />
                                <div className={styles.imgOverlay} />
                            </div>
                            <div className={styles.contentBox}>
                                <span className={styles.number}>0{idx + 1}</span>
                                <h3 style={{ fontSize: '1.2rem' }}>{service.title}</h3>
                                <p style={{ fontSize: '0.9rem' }}>{service.desc}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
