'use client';
import styles from './SubPageHero.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function SubPageHero({ title, subtitle, bgImage, compact = false }) {
    const router = useRouter();

    // 임시 기상 특보 데이터 (실제 서비스에서는 API나 상위 컨텍스트에서 주입 가능)
    const weatherAlert = {
        active: true,
        type: '강풍주의보',
        location: '서해안/남해안',
        time: '오늘 11:00 발효'
    };

    const handleAlertClick = () => {
        router.push('/employees/weather');
    };

    return (
        <section
            className={`${styles.hero} ${compact ? styles.compact : ''}`}
            style={{ backgroundImage: `url(${bgImage || '/images/hero_logistics.png'})` }}
        >
            <div className={styles.overlay} />
            <div className={`container ${styles.heroContainer}`}>
                <div className={styles.content}>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.title}
                    >
                        {title}
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className={styles.subtitle}
                    >
                        {subtitle}
                    </motion.p>
                </div>

                {/* 기상 특보 팝업 (우측 상단) */}
                {weatherAlert.active && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className={styles.weatherAlertPopup}
                        onClick={handleAlertClick}
                    >
                        <div className={styles.alertHeader}>
                            <span className={styles.alertBadge}>기상 특보</span>
                            <span className={styles.alertTitle}>{weatherAlert.type}</span>
                        </div>
                        <p className={styles.alertContent}>
                            {weatherAlert.location} 일대 강한 바람 주의<br/>
                            ({weatherAlert.time})
                        </p>
                        <div className={styles.alertAction}>
                            자세히 확인하기 →
                        </div>
                    </motion.div>
                )}
            </div>
        </section>
    );
}