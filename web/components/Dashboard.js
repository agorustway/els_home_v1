'use client';
import { useState, useEffect } from 'react';
import styles from './Dashboard.module.css';
import { motion, AnimatePresence } from 'framer-motion';

const mockLogs = [
    { id: 1, loc: '서울본사', action: '차량 배차 완료', vehicle: '82가 1042' },
    { id: 2, loc: '아산CY', action: '컨테이너 반출', vehicle: '95바 2081' },
    { id: 3, loc: '중부ICD', action: '운송 시작', vehicle: '88사 3015' },
    { id: 4, loc: '울산지점', action: 'KD부품 입고', vehicle: '91다 4127' },
    { id: 5, loc: '서산지점', action: '검수 완료', vehicle: '84무 1159' },
];

export default function Dashboard() {
    const [logs, setLogs] = useState(mockLogs);
    const [stats, setStats] = useState({
        active: 142,
        today: 236, // 운행차량의 약 1.6~1.7배 정도
        safety: 99.8,
        efficiency: 94
    });

    useEffect(() => {
        // 실시간 로그 업데이트 시뮬레이션
        const logInterval = setInterval(() => {
            const locations = ['서울본사', '아산CY', '중부ICD', '울산지점', '서산지점', '당진지점', '영천지점'];
            const actions = ['배차 완료', '운송 시작', '목적지 도착', '컨테이너 상차', '검수 통과'];
            const labels = ['가', '나', '다', '라', '마', '거', '너', '더', '러', '머', '바', '사', '아', '자', '하', '허', '호'];

            const newLog = {
                id: Date.now(),
                loc: locations[Math.floor(Math.random() * locations.length)],
                action: actions[Math.floor(Math.random() * actions.length)],
                vehicle: `${Math.floor(Math.random() * 20) + 80}${labels[Math.floor(Math.random() * labels.length)]} ${Math.floor(Math.random() * 9000) + 1000}`
            };
            setLogs(prev => [newLog, ...prev.slice(0, 5)]);

            // 수치 변화 시뮬레이션 (운행차량 x2 미만 규칙 유지)
            setStats(prev => {
                const nextActive = prev.active + (Math.random() > 0.5 ? 1 : -1);
                const nextToday = prev.today + 1;
                return {
                    ...prev,
                    active: nextActive,
                    today: nextToday
                };
            });
        }, 3500);

        return () => clearInterval(logInterval);
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
                        <div className={styles.cardTitle}>Real-time Terminal Log</div>
                        <div className={styles.logContainer}>
                            <div className={styles.logList}>
                                <AnimatePresence mode="popLayout">
                                    {logs.map((log) => {
                                        const now = new Date();
                                        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                                        return (
                                            <motion.div
                                                key={log.id}
                                                className={styles.logItem}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                layout
                                            >
                                                <span className={styles.logTime}>{timeStr}</span>
                                                <span className={styles.logMsg}>
                                                    <strong>{log.loc}</strong>: {log.vehicle} {log.action}
                                                </span>
                                            </motion.div>
                                        );
                                    })}
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
