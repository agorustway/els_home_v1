'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Constants
 */
const BRANCHES = [
    { id: 'seoul', name: '서울본사' },
    { id: 'asan', name: '아산지점' },
    { id: 'jungbu', name: '중부지점' },
    { id: 'dangjin', name: '당진지점' },
    { id: 'yesan', name: '예산지점' }
];

const PORTS = [
    { id: 'busan', name: '부산항' },
    { id: 'incheon', name: '인천항' },
    { id: 'pyeongtaek', name: '평택항' },
    { id: 'gwangyang', name: '광양항' },
    { id: 'ulsan', name: '울산항' }
];

const WEATHER_LABELS = {
    0: '맑음', 1: '대체로 맑음', 2: '약간 흐림', 3: '흐림', 45: '안개', 48: '서리 안개',
    51: '이슬비', 61: '비', 63: '비(강함)', 71: '눈', 80: '소나기', 95: '뇌우',
};

function weatherCodeToLabel(code) {
    if (code == null) return '—';
    return WEATHER_LABELS[code] ?? '흐림';
}

function getWeatherImagePath(code) {
    if (code == null) return '/images/weather/sunny_3d.png';
    if (code <= 1) return '/images/weather/sunny_3d.png';
    if (code <= 3 || code === 45 || code === 48) return '/images/weather/cloudy_3d.png';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain_3d.png';
    if (code >= 71 && code <= 77) return '/images/weather/snow_3d.png';
    if (code >= 95) return '/images/weather/thunder_3d.png';
    return '/images/weather/cloudy_3d.png';
}

function getHeroBackground(code) {
    if (code <= 1) return 'linear-gradient(135deg, #fffcf0 0%, #fff7ed 100%)';
    if (code <= 3) return 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';
    if (code >= 51) return 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
    return '#f8fafc';
}

export default function WeatherPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    
    const [selectedId, setSelectedId] = useState('current'); // 'current' or branch.id
    const [weatherCache, setWeatherCache] = useState({}); // { id: data }
    const [portCache, setPortCache] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    // 전체 날씨 데이터 로드 (현위치 + 지점 + 항만)
    useEffect(() => {
        if (!role) return;
        const fetchAll = async () => {
            setLoading(true);
            try {
                const newCache = {};
                // 1. 현위치 (IP 기준)
                const curRes = await fetch('/api/weather/region-by-ip');
                const curIp = await curRes.json();
                const curWRes = await fetch(`/api/weather?region=${curIp.region || 'seoul'}`);
                newCache['current'] = await curWRes.json();

                // 2. 지점별
                for (const b of BRANCHES) {
                    const res = await fetch(`/api/weather?region=${b.id}`);
                    newCache[b.id] = await res.json();
                }
                setWeatherCache(newCache);

                // 3. 항만별 (가상 파고/풍속 포함)
                const pCache = {};
                for (const p of PORTS) {
                    const res = await fetch(`/api/weather?region=${p.id}`);
                    const json = await res.json();
                    pCache[p.id] = {
                        ...json,
                        wave: (Math.random() * 2 + 0.5).toFixed(1), // 실제 API 연동 전 가상 데이터
                        wind: (Math.random() * 10 + 2).toFixed(1)
                    };
                }
                setPortCache(pCache);
            } catch (e) {
                setError('날씨 데이터를 불러오는 중 오류가 발생했습니다.');
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [role]);

    const activeData = useMemo(() => weatherCache[selectedId] || weatherCache['current'], [weatherCache, selectedId]);

    // 가상 기상 특보 데이터 (실제 API 연동 시 이 부분을 업데이트)
    const activeAlerts = [
        { type: '강풍주의보', location: '서해안 및 남해안', time: '오늘 11:00' }
    ];

    if (authLoading || !role) return null;

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>실시간 기상 관측 대시보드</h1>
                <p className={styles.subtitle}>현위치, 지점별 정밀 예보 및 항만 기상 정보를 실시간으로 모니터링합니다.</p>
            </div>

            {/* 상단 기상 특보 알림 바 */}
            {activeAlerts.length > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className={styles.alertTopBanner}
                >
                    <span className={styles.alertBadge}>기상속보</span>
                    <span className={styles.alertText}>
                        <strong>[{activeAlerts[0].type}]</strong> {activeAlerts[0].location} 일대 발효 중 ({activeAlerts[0].time})
                    </span>
                    <span className={styles.alertLink}>정밀 예보 확인하기 →</span>
                </motion.div>
            )}

            {loading ? (
                <div className={styles.card}><p>기상 데이터를 통합 분석 중입니다...</p></div>
            ) : (
                <>
                    <div className={styles.splitLayout}>
                        {/* 1열: 시간별 예보 */}
                        <aside className={`${styles.column} ${styles.leftColumn}`}>
                            <div className={styles.card}>
                                <h2 className={styles.sectionTitle}>24시간 정밀 예보</h2>
                                <div className={styles.hourlyList}>
                                    {activeData?.hourly?.slice(0, 24).map((h, i) => (
                                        <div key={i} className={styles.hourlyItem}>
                                            <span className={styles.hourlyTime}>{new Date(h.time).getHours()}시</span>
                                            <img src={getWeatherImagePath(h.code)} alt="" className={styles.hourlyIcon} />
                                            <span style={{flex: 1, marginLeft: '10px'}}>{weatherCodeToLabel(h.code)}</span>
                                            <span className={styles.hourlyTemp}>{h.temp}°C</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </aside>

                        {/* 2열: 현재 날씨 Hero & 주간 예보 */}
                        <main className={`${styles.column} ${styles.centerColumn}`}>
                            {activeData && (() => {
                                const cur = activeData.hourly[0];
                                return (
                                    <>
                                        <motion.div 
                                            key={selectedId}
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            className={styles.currentHero} 
                                            style={{ background: getHeroBackground(cur.code) }}
                                        >
                                            <div className={styles.heroMain}>
                                                <span className={styles.heroRegion}>{selectedId === 'current' ? '현위치' : BRANCHES.find(b => b.id === selectedId)?.name}</span>
                                                <span className={styles.heroWeather}>{weatherCodeToLabel(cur.code)}</span>
                                                <span className={styles.heroTemp}>{cur.temp}°C</span>
                                            </div>
                                            <img src={getWeatherImagePath(cur.code)} alt="" className={styles.heroIconLarge} />
                                        </motion.div>

                                        <div className={styles.card}>
                                            <h2 className={styles.sectionTitle}>향후 7일 주간 예보</h2>
                                            <div className={styles.weeklyGrid}>
                                                {/* 실제 Daily API 연동 필요하지만 현재 Hourly에서 추출하여 시뮬레이션 */}
                                                {[0, 1, 2, 3, 4, 5, 6].map(day => {
                                                    const idx = day * 24;
                                                    const d = activeData.hourly[idx] || cur;
                                                    const date = new Date(d.time);
                                                    const dayName = ['일','월','화','수','목','금','토'][date.getDay()];
                                                    return (
                                                        <div key={day} className={styles.weeklyItem}>
                                                            <div className={styles.weeklyDay}>{dayName}</div>
                                                            <img src={getWeatherImagePath(d.code)} alt="" className={styles.weeklyIcon} />
                                                            <div className={styles.weeklyTemp}>{d.temp}°C</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        
                                        {activeData.dailySummary && (
                                            <div className={styles.card} style={{ background: '#f0f9ff', border: 'none' }}>
                                                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0369a1', lineHeight: 1.6 }}>
                                                    💡 오늘의 기상 요약: {activeData.dailySummary}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </main>

                        {/* 3열: 지점 선택 리스트 */}
                        <aside className={`${styles.column} ${styles.rightColumn}`}>
                            <h2 className={styles.sectionTitle}>지점별 현황</h2>
                            <div 
                                className={`${styles.branchCard} ${selectedId === 'current' ? styles.branchCardActive : ''}`}
                                onClick={() => setSelectedId('current')}
                            >
                                <span className={styles.branchName}>📍 현위치 주변</span>
                                <span className={styles.branchTemp}>{weatherCache['current']?.hourly[0].temp}°C</span>
                            </div>
                            {BRANCHES.map(b => {
                                const data = weatherCache[b.id];
                                const cur = data?.hourly[0];
                                return (
                                    <div 
                                        key={b.id} 
                                        className={`${styles.branchCard} ${selectedId === b.id ? styles.branchCardActive : ''}`}
                                        onClick={() => setSelectedId(b.id)}
                                    >
                                        <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.branchIcon} />
                                        <span className={styles.branchName}>{b.name}</span>
                                        <span className={styles.branchTemp}>{cur?.temp ?? '—'}°C</span>
                                    </div>
                                );
                            })}
                        </aside>
                    </div>

                    {/* 하단: 항만 정보 & 특보 */}
                    <div className={styles.bottomSection}>
                        <div className={styles.card}>
                            <h2 className={styles.sectionTitle}>국내 주요 항만 기상 모니터링</h2>
                            <div className={styles.portGrid}>
                                {PORTS.map(p => {
                                    const data = portCache[p.id];
                                    const cur = data?.hourly[0];
                                    return (
                                        <div key={p.id} className={styles.portCard}>
                                            <div className={styles.portHeader}>
                                                <span className={styles.portName}>{p.name}</span>
                                                <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.portWeatherIcon} />
                                            </div>
                                            <div className={styles.portData}>
                                                <span>기온</span><span className={styles.portVal}>{cur?.temp}°C</span>
                                                <span>파고</span><span className={styles.portVal} style={{color: '#0284c7'}}>{data?.wave}m</span>
                                                <span>풍속</span><span className={styles.portVal} style={{color: '#059669'}}>{data?.wind}m/s</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={`${styles.card} ${styles.alertCard}`}>
                            <h2 className={styles.sectionTitle} style={{color: '#991b1b'}}>⚠️ 기상 특보 및 속보</h2>
                            <div className={styles.alertItem}>
                                <strong>[강풍주의보]</strong> 서해안 및 남해안 중심 초속 10m 이상의 강한 바람 주의
                            </div>
                            <div className={styles.alertItem}>
                                <strong>[풍랑주의보]</strong> 동해 중부 먼바다 물결 2.0~4.0m로 매우 높음
                            </div>
                            <div className={styles.alertItem}>
                                <strong>[태풍소식]</strong> 현재 한반도 주변 활동 중인 태풍 없음
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
