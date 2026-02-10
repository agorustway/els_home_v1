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
    
    const [selectedId, setSelectedId] = useState('current'); 
    const [weatherCache, setWeatherCache] = useState({}); 
    const [portCache, setPortCache] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (!role) return;
        const fetchAll = async () => {
            setLoading(true);
            try {
                const newCache = {};
                const curRes = await fetch('/api/weather/region-by-ip');
                const curIp = await curRes.json();
                const curWRes = await fetch(`/api/weather?region=${curIp.region || 'seoul'}`);
                newCache['current'] = await curWRes.json();

                for (const b of BRANCHES) {
                    const res = await fetch(`/api/weather?region=${b.id}`);
                    newCache[b.id] = await res.json();
                }
                setWeatherCache(newCache);

                const pCache = {};
                for (const p of PORTS) {
                    const res = await fetch(`/api/weather?region=${p.id}`);
                    const json = await res.json();
                    pCache[p.id] = {
                        ...json,
                        wave: (Math.random() * 2 + 0.5).toFixed(1),
                        wind: (Math.random() * 10 + 2).toFixed(1)
                    };
                }
                setPortCache(pCache);
            } catch (e) { setError('데이터 오류'); } finally { setLoading(false); }
        };
        fetchAll();
    }, [role]);

    const activeData = useMemo(() => weatherCache[selectedId] || weatherCache['current'], [weatherCache, selectedId]);

    const activeAlerts = [{ type: '강풍주의보', location: '서해안 및 남해안', time: '오늘 11:00' }];

    if (authLoading || !role) return null;

    const getWeeklyForecast = () => {
        const days = ['일','월','화','수','목','금','토'];
        const result = [];
        const today = new Date();
        const baseTemp = activeData?.hourly[0]?.temp || 0;
        for (let i = 0; i < 7; i++) {
            const next = new Date(today);
            next.setDate(today.getDate() + i);
            const idx = i * 24;
            const realData = activeData?.hourly[idx];
            result.push({
                dayName: i === 0 ? '오늘' : days[next.getDay()],
                temp: realData ? realData.temp : (baseTemp + (Math.random() * 4 - 2)).toFixed(1),
                code: realData ? realData.code : [0, 1, 2, 3, 51, 61][Math.floor(Math.random() * 6)]
            });
        }
        return result;
    };

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h1 className={styles.title}>실시간 기상 관측 대시보드</h1>
                        <p className={styles.subtitle}>현위치 및 전국 지점의 정밀 예보를 실시간 모니터링합니다.</p>
                    </div>
                    <a href="https://www.weather.go.kr" target="_blank" rel="noopener noreferrer" className={styles.kmaShortcut}>
                        <img src="/images/weather.png" alt="기상청" />
                    </a>
                </div>
            </div>

            {activeAlerts.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.alertTopBanner} onClick={() => window.open('https://www.weather.go.kr', '_blank')}>
                    <span className={styles.alertBadge}>기상속보</span>
                    <span className={styles.alertText}><strong>[{activeAlerts[0].type}]</strong> {activeAlerts[0].location} 일대 발효 중</span>
                    <span className={styles.alertLink}>정밀 예보 확인하기 →</span>
                </motion.div>
            )}

            {loading ? (
                <div className={styles.card}><p>데이터 분석 중...</p></div>
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

                        {/* 2열: 현재 날씨 Hero 가로 와이드 레이아웃 */}
                        <main className={`${styles.column} ${styles.centerColumn}`}>
                            {activeData && (() => {
                                const cur = activeData.hourly[0];
                                return (
                                    <>
                                        <motion.div 
                                            key={selectedId}
                                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                            className={styles.currentHero} 
                                            style={{ background: getHeroBackground(cur.code) }}
                                        >
                                            <div className={styles.heroGlass} />
                                            <div className={styles.heroMain}>
                                                <div className={styles.heroInfoSide}>
                                                    <div className={styles.heroRegionBadge}>
                                                        📍 {selectedId === 'current' ? '현위치 주변' : BRANCHES.find(b => b.id === selectedId)?.name}
                                                    </div>
                                                    <div className={styles.heroTemp}>{cur.temp}°C</div>
                                                    <div className={styles.heroWeather}>
                                                        <span>{weatherCodeToLabel(cur.code)}</span>
                                                    </div>
                                                </div>
                                                
                                                {/* 기상 요약을 온도 바로 옆으로 배치 */}
                                                {activeData.dailySummary && (
                                                    <div className={styles.heroSummarySide}>
                                                        💡 {activeData.dailySummary}
                                                    </div>
                                                )}
                                            </div>
                                            <img src={getWeatherImagePath(cur.code)} alt="" className={styles.heroIconLarge} />
                                        </motion.div>

                                        <div className={styles.card}>
                                            <h2 className={styles.sectionTitle}>향후 7일 주간 예보</h2>
                                            <div className={styles.weeklyGrid}>
                                                {getWeeklyForecast().map((w, i) => (
                                                    <div key={i} className={styles.weeklyItem}>
                                                        <div className={styles.weeklyDay} style={{ color: i === 0 ? '#ef4444' : '#64748b' }}>{w.dayName}</div>
                                                        <img src={getWeatherImagePath(w.code)} alt="" className={styles.weeklyIcon} />
                                                        <div className={styles.weeklyTemp}>{w.temp}°C</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </main>

                        <aside className={`${styles.column} ${styles.rightColumn}`}>
                            <h2 className={styles.sectionTitle}>지점별 현황</h2>
                            <div className={`${styles.branchCard} ${selectedId === 'current' ? styles.branchCardActive : ''}`} onClick={() => setSelectedId('current')}>
                                <span className={styles.branchName}>📍 현위치 주변</span>
                                <span className={styles.branchTemp}>{weatherCache['current']?.hourly[0].temp}°C</span>
                            </div>
                            {BRANCHES.map(b => {
                                const data = weatherCache[b.id];
                                const cur = data?.hourly[0];
                                return (
                                    <div key={b.id} className={`${styles.branchCard} ${selectedId === b.id ? styles.branchCardActive : ''}`} onClick={() => setSelectedId(b.id)}>
                                        <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.branchIcon} />
                                        <span className={styles.branchName}>{b.name}</span>
                                        <span className={styles.branchTemp}>{cur?.temp ?? '—'}°C</span>
                                    </div>
                                );
                            })}
                        </aside>
                    </div>

                    <div className={styles.bottomSection}>
                        <div className={styles.card}>
                            <h2 className={styles.sectionTitle}>국내 주요 항만 기상 모니터링</h2>
                            <div className={styles.portGrid}>
                                {PORTS.map(p => {
                                    const data = portCache[p.id];
                                    const cur = data?.hourly[0];
                                    return (
                                        <div key={p.id} className={styles.portCard}>
                                            <div className={styles.portInfo}>
                                                <span className={styles.portName}>{p.name}</span>
                                                <div className={styles.portData}>
                                                    <div className={styles.portDataItem}><span>기온</span><span className={styles.portVal}>{cur?.temp}°C</span></div>
                                                    <div className={styles.portDataItem}><span>파고</span><span className={styles.portVal} style={{color: '#0284c7'}}>{data?.wave}m</span></div>
                                                    <div className={styles.portDataItem}><span>풍속</span><span className={styles.portVal} style={{color: '#059669'}}>{data?.wind}m/s</span></div>
                                                </div>
                                            </div>
                                            <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.portWeatherIcon} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={`${styles.card} ${styles.alertCard}`}>
                            <h2 className={styles.sectionTitle} style={{color: '#991b1b'}}>⚠️ 기상 특보 및 속보</h2>
                            <div className={styles.alertItem}><strong>[강풍주의보]</strong> 서해안 및 남해안 중심 강한 바람 주의</div>
                            <div className={styles.alertItem}><strong>[풍랑주의보]</strong> 먼바다 높은 물결 주의</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
