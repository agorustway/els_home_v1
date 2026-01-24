'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './AsanMealGame.module.css';

const MEAL_OPTIONS = [
    { id: 'korean', label: '한식', icon: '🍱', desc: '정갈한 전통 한식 식단' },
    { id: 'western', label: '일품', icon: '🍝', desc: '특별한 일품 요리' },
    { id: 'salad', label: '샐러드', icon: '🥗', desc: '신선한 다이어트 식단' },
];

export default function AsanMealGame() {
    const [selected, setSelected] = useState(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSelect = (id) => {
        if (isSubmitted) return;
        setSelected(id);
    };

    const handleSubmit = () => {
        if (!selected) {
            alert('오늘 드실 메뉴를 선택해주세요!');
            return;
        }
        setIsSubmitted(true);
        // 여기서 나중에 API 연동해서 DB에 저장하면 돼 형!
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <span className={styles.badge}>Asan Branch</span>
                    <h2 className={styles.title}>오늘의 식단 선택</h2>
                    <p className={styles.subtitle}>원하시는 메뉴를 선택하시면 조리실에 전달됩니다.</p>
                </div>

                <div className={styles.grid}>
                    {MEAL_OPTIONS.map((option) => (
                        <motion.div
                            key={option.id}
                            className={`${styles.optionCard} ${selected === option.id ? styles.active : ''} ${isSubmitted ? styles.disabled : ''}`}
                            onClick={() => handleSelect(option.id)}
                            whileHover={!isSubmitted ? { y: -5 } : {}}
                            whileTap={!isSubmitted ? { scale: 0.98 } : {}}
                        >
                            <span className={styles.icon}>{option.icon}</span>
                            <h3 className={styles.label}>{option.label}</h3>
                            <p className={styles.desc}>{option.desc}</p>
                            {selected === option.id && (
                                <motion.div 
                                    className={styles.check}
                                    layoutId="check"
                                >
                                    ✓
                                </motion.div>
                            )}
                        </motion.div>
                    ))}
                </div>

                <div className={styles.footer}>
                    <AnimatePresence mode="wait">
                        {!isSubmitted ? (
                            <motion.button
                                key="submit"
                                className={styles.submitBtn}
                                onClick={handleSubmit}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                선택 완료하기
                            </motion.button>
                        ) : (
                            <motion.div
                                key="success"
                                className={styles.successMsg}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                            >
                                🎊 선택이 완료되었습니다! 맛있게 드세요.
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}