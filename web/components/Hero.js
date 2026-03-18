'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Hero.module.css';

const slides = [
    {
        image: '/images/asan/KakaoTalk_20260119_110613230.jpg',
        title: 'Strategic CY Operations',
        subtitle: '아산 및 중부 전용 DEPOT(CY) 운영을 통한 독보적 물류 인프라',
        pos: 'center 85%'
    },
    {
        image: '/images/joogbu/KakaoTalk_20260313_161417917_01.jpg',
        title: 'Total Logistics Network',
        subtitle: '동북아 물류 거점을 잇는 최적화된 운송망과 통합 물류 거점 서비스',
        pos: 'center 75%'
    },
    {
        image: '/images/office_intro.png',
        title: 'Precision Logistics Solution',
        subtitle: '최상의 운송 품질과 전문적인 물류 솔루션을 제공합니다',
        pos: 'center 30%'
    },
    {
        image: '/images/yesan/KakaoTalk_20260317_165413697.jpg',
        title: 'Integrated SCM Partner',
        subtitle: '최근단 인프라를 통한 신속하고 안전한 철강 및 종합 물류 서비스',
        pos: 'center 80%'
    }
];

export default function Hero() {
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % slides.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <section className={styles.hero}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={current}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    className={styles.slide}
                    style={{ 
                        backgroundImage: `url(${slides[current].image})`,
                        backgroundPosition: slides[current].pos || 'center'
                    }}
                >
                    <div className={styles.overlay}></div>
                    <div className={styles.scanlines}></div>
                    <div className={styles.vignette}></div>
                </motion.div>
            </AnimatePresence>

            <div className="container">
                <div className={styles.content}>
                    <motion.div
                        key={`title-${current}`}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                    >
                        <h1 className={styles.title}>
                            {slides[current].title.split(' ').map((word, i) => (
                                <span key={i} className={i === 1 ? styles.highlight : ''}>{word} </span>
                            ))}
                        </h1>
                        <p className={styles.subtitle}>{slides[current].subtitle}</p>
                    </motion.div>
                </div>
            </div>

            <div className={styles.progress}>
                {slides.map((_, i) => (
                    <div
                        key={i}
                        className={`${styles.bar} ${i === current ? styles.active : ''}`}
                        onClick={() => setCurrent(i)}
                    />
                ))}
            </div>
        </section>
    );
}
