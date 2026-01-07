'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Hero.module.css';

const slides = [
    {
        image: 'https://images.unsplash.com/photo-1494412574643-35d324698420?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: 'Precision Logistics Solution',
        subtitle: '최상의 운송 품질과 전문적인 물류 솔루션을 제공합니다',
    },
    {
        image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: 'Strategic CY Operations',
        subtitle: '아산 및 중부 전용 DEPOT(CY) 운영을 통한 독보적 물류 인프라',
    },
    {
        image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: 'Automotive Parts Expert',
        subtitle: '현대/기아자동차 KD부품 포장 및 생산 도급 서비스의 신뢰받는 파트너',
    },
    {
        image: 'https://images.unsplash.com/photo-1519003306447-425030491764?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: 'Integrated SCM Partner',
        subtitle: '품질, 상생, 윤리 경영을 바탕으로 고객의 공감을 실현합니다',
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
                    style={{ backgroundImage: `url(${slides[current].image})` }}
                >
                    <div className={styles.overlay}></div>
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
