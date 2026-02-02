'use client';
import styles from './SubPageHero.module.css';
import { motion } from 'framer-motion';

export default function SubPageHero({ title, subtitle, bgImage, compact = false }) {
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
            </div>
        </section>
    );
}
