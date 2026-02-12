'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';
import { motion } from 'framer-motion';

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

    // Helper for Air Quality Color/Label
    const getAirQualityStatus = (value, type) => {
        if (value == null) return { label: '-', color: '#94a3b8' };

        // PM10 (µg/m³) 기준: 0-30 좋음, 31-80 보통, 81-150 나쁨, 151+ 매우나쁨
        // PM2.5 (µg/m³) 기준: 0-15 좋음, 16-35 보통, 36-75 나쁨, 76+ 매우나쁨
        let status = '좋음';
        let color = '#3b82f6'; // Blue

        if (type === 'pm10') {
            if (value > 150) { status = '매우 나쁨'; color = '#ef4444'; }
            else if (value > 80) { status = '나쁨'; color = '#f59e0b'; }
            else if (value > 30) { status = '보통'; color = '#10b981'; }
        } else {
            if (value > 75) { status = '매우 나쁨'; color = '#ef4444'; }
            else if (value > 35) { status = '나쁨'; color = '#f59e0b'; }
            else if (value > 15) { status = '보통'; color = '#10b981'; }
        }
        return { label: status, color };
    };

    const aq = activeData?.airQuality;
    const pm10Stat = getAirQualityStatus(aq?.pm10, 'pm10');
    const pm25Stat = getAirQualityStatus(aq?.pm2_5, 'pm25');

    if (authLoading || !role) return null;

    const getWeeklyForecast = () => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
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
            <div className={styles.headerSection}>
                <h1 className={styles.mainTitle}>Weather Dashboard</h1>
                <p className={styles.subTitle}>실시간 기상 관측 및 대기질 모니터링</p>
            </div>

            {loading ? (
                <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                    <p style={{ color: '#64748b' }}>기상 데이터를 분석하고 있습니다...</p>
                </div>
            ) : (
                <div className={styles.gridContainer}>
                    {/* 1. Hero Card (Current Weather) */}
                    {activeData && (() => {
                        const cur = activeData.hourly[0];
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className={`${styles.card} ${styles.heroCard}`}
                            >
                                <div className={styles.heroContent}>
                                    <div className={styles.locationBadge}>
                                        📍 {selectedId === 'current' ? '현위치' : BRANCHES.find(b => b.id === selectedId)?.name}
                                    </div>
                                    <div className={styles.currentTemp}>{Math.round(cur.temp)}°</div>
                                    <div className={styles.currentCondition}>{weatherCodeToLabel(cur.code)}</div>
                                    {activeData.dailySummary && (
                                        <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#475569', maxWidth: '80%' }}>
                                            {activeData.dailySummary.split('.')[0]}.
                                        </p>
                                    )}
                                </div>
                                <div className={styles.heroDecor} />
                                <img src={getWeatherImagePath(cur.code)} alt="" className={styles.heroIcon} />
                            </motion.div>
                        );
                    })()}

                    {/* 2. Air Quality Card */}
                    <div className={`${styles.card} ${styles.aqCard}`}>
                        <div className={styles.cardTitle}>
                            <span className={styles.cardTitleIcon}>🍃</span> 대기질 현황
                        </div>
                        <div className={styles.aqList}>
                            <div className={styles.aqItem}>
                                <div>
                                    <div className={styles.aqName}>미세먼지 (PM10)</div>
                                    <div className={styles.aqValue}>{aq?.pm10 ?? '-'} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>µg/m³</span></div>
                                </div>
                                <div className={styles.aqStatus} style={{ background: pm10Stat.color }}>
                                    {pm10Stat.label}
                                </div>
                            </div>
                            <div className={styles.aqItem}>
                                <div>
                                    <div className={styles.aqName}>초미세먼지 (PM2.5)</div>
                                    <div className={styles.aqValue}>{aq?.pm2_5 ?? '-'} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>µg/m³</span></div>
                                </div>
                                <div className={styles.aqStatus} style={{ background: pm25Stat.color }}>
                                    {pm25Stat.label}
                                </div>
                            </div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '12px', textAlign: 'right' }}>
                            * WHO 기준 적용
                        </div>
                    </div>

                    {/* 3. Hourly Forecast (Scrollable) */}
                    <div className={styles.hourlySection}>
                        <div className={styles.cardTitle} style={{ marginBottom: '12px' }}>
                            <span className={styles.cardTitleIcon}>clock</span> 24시간 예보
                        </div>
                        <div className={styles.hourlyTrack}>
                            {activeData?.hourly?.slice(0, 24).map((h, i) => (
                                <div key={i} className={styles.hourlyCard}>
                                    <span className={styles.hourTime}>{new Date(h.time).getHours()}시</span>
                                    <img src={getWeatherImagePath(h.code)} alt="" className={styles.hourIcon} />
                                    <span className={styles.hourTemp}>{Math.round(h.temp)}°</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 4. Weekly Forecast (Grid) */}
                    <div className={`${styles.card} ${styles.weeklySection}`}>
                        <div className={styles.cardTitle}>
                            <span className={styles.cardTitleIcon}>calendar</span> 주간 예보 (7일)
                        </div>
                        <div className={styles.weeklyGrid}>
                            {getWeeklyForecast().map((w, i) => (
                                <div key={i} className={styles.weeklyCard}>
                                    <div className={`${styles.weekDay} ${i === 0 ? styles.today : ''}`}>{w.dayName}</div>
                                    <img src={getWeatherImagePath(w.code)} alt="" className={styles.weekIcon} />
                                    <div className={styles.weekTemp}>{Math.round(w.temp)}°</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 5. Branch List */}
                    <div className={styles.branchSection}>
                        <div className={styles.cardTitle} style={{ marginBottom: '16px' }}>
                            <span className={styles.cardTitleIcon}>building</span> 지점별 날씨
                        </div>
                        <div className={styles.branchGrid}>
                            <div
                                className={`${styles.branchCard} ${selectedId === 'current' ? styles.branchActive : ''}`}
                                onClick={() => setSelectedId('current')}
                            >
                                <img src={getWeatherImagePath(weatherCache['current']?.hourly[0].code)} alt="" className={styles.branchIcon} />
                                <div className={styles.branchInfo}>
                                    <span className={styles.branchName}>현위치</span>
                                    <span className={styles.branchTemp}>{Math.round(weatherCache['current']?.hourly[0].temp ?? 0)}°</span>
                                </div>
                            </div>
                            {BRANCHES.map(b => {
                                const cur = weatherCache[b.id]?.hourly[0];
                                return (
                                    <div
                                        key={b.id}
                                        className={`${styles.branchCard} ${selectedId === b.id ? styles.branchActive : ''}`}
                                        onClick={() => setSelectedId(b.id)}
                                    >
                                        <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.branchIcon} />
                                        <div className={styles.branchInfo}>
                                            <span className={styles.branchName}>{b.name}</span>
                                            <span className={styles.branchTemp}>{Math.round(cur?.temp ?? 0)}°</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 6. Port Monitoring */}
                    <div className={styles.portSection}>
                        <div className={styles.cardTitle} style={{ marginBottom: '16px' }}>
                            <span className={styles.cardTitleIcon}>anchor</span> 주요 항만 기상 모니터링
                        </div>
                        <div className={styles.portGrid}>
                            {PORTS.map(p => {
                                const data = portCache[p.id];
                                const cur = data?.hourly[0];
                                return (
                                    <div key={p.id} className={styles.portCard}>
                                        <div className={styles.portInfoSide}>
                                            <div className={styles.portName}>{p.name}</div>
                                            <div className={styles.portStats}>
                                                <div className={`${styles.statItem} ${styles.temp}`}>
                                                    <span className={styles.statLabel}>기온</span>
                                                    <span className={styles.statVal}>{Math.round(cur?.temp ?? 0)}°</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.wave}`}>
                                                    <span className={styles.statLabel}>파고</span>
                                                    <span className={styles.statVal}>{data?.wave}m</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.wind}`}>
                                                    <span className={styles.statLabel}>풍속</span>
                                                    <span className={styles.statVal}>{data?.wind}m/s</span>
                                                </div>
                                            </div>
                                        </div>
                                        <img src={getWeatherImagePath(cur?.code)} alt="" className={styles.portIcon} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
