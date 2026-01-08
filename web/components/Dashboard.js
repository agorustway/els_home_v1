'use client';
import { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';
import { motion, AnimatePresence } from 'framer-motion';

const mockLogs = [
    { id: 1, loc: '아산CY', action: '컨테이너 반출', vehicle: '95바 2081', time: '09:12' },
    { id: 2, loc: '중부ICD', action: '운송 시작', vehicle: '88사 3015', time: '08:45' },
    { id: 3, loc: '울산지점', action: 'KD부품 입고', vehicle: '91다 4127', time: '07:30' },
    { id: 4, loc: '서산지점', action: '검수 완료', vehicle: '84무 1159', time: '06:15' },
    { id: 5, loc: '당진지점', action: '배차 완료', vehicle: '82가 1042', time: '05:50' },
];

export default function Dashboard() {
    const [logs, setLogs] = useState(mockLogs);
    const [stats, setStats] = useState({
        active: 112, // 70~150 사이 초기값
        today: 185,  // active의 1~2배 사이 초기값
        safety: 99.8,
        efficiency: 94
    });

    useEffect(() => {
        let timeoutId;

        const updateDashboard = () => {
            const locations = ['아산CY', '중부ICD', '울산지점', '서산지점', '당진지점', '영천지점', '금호지점', '임고지점', '예산지점'];
            const actions = ['배차 완료', '운송 시작', '목적지 도착', '컨테이너 상차', '검수 통과'];
            const labels = ['가', '나', '다', '라', '마', '거', '너', '더', '러', '머', '바', '사', '아', '자', '하', '허', '호'];

            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            const newLog = {
                id: Date.now(),
                loc: locations[Math.floor(Math.random() * locations.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                vehicle: `${Math.floor(Math.random() * 20) + 80}${labels[Math.floor(Math.random() * labels.length)]} ${Math.floor(Math.random() * 9000) + 1000}`,
                time: timeStr
            };

            setLogs(prev => [newLog, ...prev.slice(0, 4)]);

            setStats(prev => {
                // active: 70 ~ 150 범위 유지
                let nextActive = prev.active + (Math.random() > 0.5 ? 1 : -1);
                if (nextActive < 70) nextActive = 70;
                if (nextActive > 150) nextActive = 150;

                // today: active의 1.0배 ~ 2.0배 유지
                let nextToday = prev.today + (Math.random() > 0.3 ? 1 : 0);
                if (nextToday < nextActive) nextToday = nextActive;
                if (nextToday > nextActive * 2) nextToday = Math.floor(nextActive * 1.8);

                return {
                    ...prev,
                    active: nextActive,
                    today: nextToday
                };
            });

            // 업데이트 간격: 30분(1,800,000ms) ~ 2시간(7,200,000ms) 랜덤
            const minInterval = 30 * 60 * 1000;
            const maxInterval = 120 * 60 * 1000;
            const nextInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;

            timeoutId = setTimeout(updateDashboard, nextInterval);
        };

        // 첫 업데이트 예약
        const initialDelay = 5000; // 페이지 진입 후 5초 뒤 첫 업데이트
        timeoutId = setTimeout(updateDashboard, initialDelay);

        return () => clearTimeout(timeoutId);
    }, []);

    return (
        <section id="dashboard" className={styles.dashboard}>
            <div className="container">
                <div className={styles.header}>
                    <span className={styles.tag}>Live Dashboard</span>
                    <h2 className={styles.title}>실시간 운영 현황</h2>
                </div>

                <div className={styles.grid}>
                    {/* 1. 통계 카드 */}
                    <motion.div
                        className={styles.card}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                    >
                        <div className={styles.cardTitle}>
                            <div className={styles.liveDot} />
                            <span>Fleet Statistics</span>
                        </div>
                        <div className={styles.statsGrid}>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.active}</span>
                                <span className={styles.statLabel}>운행 중 차량</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.today}</span>
                                <span className={styles.statLabel}>오늘의 배차량</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.safety}%</span>
                                <span className={styles.statLabel}>안전 운행지수</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.efficiency}%</span>
                                <span className={styles.statLabel}>통합 운영효율</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* 2. 가동률 센터 */}
                    <motion.div
                        className={styles.card}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className={styles.cardTitle}>System Status</div>
                        <div className={styles.statusCenter}>
                            <div className={styles.waveContainer}>
                                <div className={styles.wave} />
                                <div className={styles.wave} />
                                <div className={styles.wave} />
                                <div className={styles.centerContent}>
                                    <span className={styles.percent}>98.4%</span>
                                    <p className={styles.percentLabel}>시스템 가동률</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* 3. 실시간 로그 */}
                    <motion.div
                        className={styles.card}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className={styles.cardTitle}>Real-time Log</div>
                        <div className={styles.logContainer}>
                            <div className={styles.logList}>
                                <AnimatePresence mode="popLayout">
                                    {logs.map((log) => (
                                        <motion.div
                                            key={log.id}
                                            className={styles.logItem}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            layout
                                        >
                                            <span className={styles.logTime}>{log.time}</span>
                                            <span className={styles.logMsg}>
                                                <strong>{log.loc}</strong>: {log.vehicle} {log.action}
                                            </span>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                            <div className={styles.fader} />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
