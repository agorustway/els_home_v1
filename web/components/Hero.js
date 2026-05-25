'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Hero.module.css';

const slides = [
    {
        image: '/images/asan/KakaoTalk_20260119_110613230.jpg',
        eyebrow: 'CY / ICD 운영',
        title: '이엘에스솔루션',
        subtitle: '아산과 중부 거점을 기반으로 항만, 공장, 현장을 안정적으로 연결합니다.',
        pos: 'center 85%'
    },
    {
        image: '/images/joogbu/KakaoTalk_20260313_161417917_01.jpg',
        eyebrow: '내륙 운송 네트워크',
        title: '현장에 강한 물류 파트너',
        subtitle: '주요 항만과 충청권 거점을 잇는 운송망으로 물동량 변화에 유연하게 대응합니다.',
        pos: 'center 75%'
    },
    {
        image: '/images/yesan/KakaoTalk_20260317_165413697.jpg',
        eyebrow: '카고 / 컨테이너 통합 운영',
        title: '신속하고 안전한 운송 품질',
        subtitle: '자동차 부품, 철강, 컨테이너 운송을 현장 중심의 운영 체계로 수행합니다.',
        pos: 'center 80%'
    },
    {
        image: '/images/office_intro.png',
        eyebrow: 'ELS Operation Standard',
        title: '정확한 관리, 꾸준한 신뢰',
        subtitle: '운송 품질과 안전 기준을 지속적으로 개선하며 고객의 업무 흐름을 함께 지킵니다.',
        pos: 'center 30%'
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
                        <span className={styles.eyebrow}>{slides[current].eyebrow}</span>
                        <h1 className={styles.title}>
                            {slides[current].title}
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
