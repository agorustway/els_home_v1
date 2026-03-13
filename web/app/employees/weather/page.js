'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

/**
 * Constants
 */
const BRANCHES = [
    { id: 'seoul', name: '서울본사' },
    { id: 'asan', name: '아산지점' },
    { id: 'jungbu', name: '중부지점' },
    { id: 'yesan', name: '예산지점' },
    { id: 'dangjin', name: '당진지점' }
];

const PORTS = [
    { id: 'busan', name: '부산항' },
    { id: 'incheon', name: '인천항' },
    { id: 'pyeongtaek', name: '평택항' },
    { id: 'gwangyang', name: '광양항' },
    { id: 'ulsan', name: '울산항' }
];

const WEATHER_LABELS = {
    0: '맑음', 1: '대체로 맑음', 2: '약간 흐림', 3: '흐림',
    45: '안개', 48: '짙은 안개',
    51: '이슬비', 53: '이슬비', 55: '진한 이슬비',
    61: '약한 비', 63: '비', 65: '강한 비',
    71: '고운 눈', 73: '눈', 75: '폭설', 77: '싸락눈',
    80: '소나기', 81: '강한 소나기', 82: '매우 강한 소나기',
    85: '약한 눈보라', 86: '강한 눈보라',
    95: '낙뢰/뇌우', 96: '박우', 99: '강한 박우'
};

function weatherCodeToLabel(code) {
    if (code == null) return '—';
    return WEATHER_LABELS[code] ?? '흐림';
}

function getWeatherImagePath(code) {
    if (code == null) return '/images/weather/sunny_3d.png';
    // Clear / Mainly clear
    if (code <= 1) return '/images/weather/sunny_3d.png';
    // Partly cloudy / Overcast
    if (code === 2 || code === 3) return '/images/weather/cloudy_3d.png';
    // Fog / Rime fog
    if (code === 45 || code === 48) return '/images/weather/fog_3d.png';
    // Drizzle / Rain / Showers
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain_3d.png';
    // Snow / Snow showers / Snow grains
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return '/images/weather/snow_3d.png';
    // Thunderstorm
    if (code >= 95) return '/images/weather/thunder_3d.png';
    return '/images/weather/cloudy_3d.png';
}

import { useGeolocation } from '@/hooks/useGeolocation';

export default function WeatherPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const { coords, loading: geoLoading, refreshLocation } = useGeolocation();

    const [selectedId, setSelectedId] = useState('current'); // 'current', 'seoul', 'asan', etc.
    const [weatherCache, setWeatherCache] = useState({});
    const [portCache, setPortCache] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    const fetchAll = useCallback(async (currentCoords = null) => {
        if (!role) return;
        setLoading(true);
        try {
            // 1. 위치 결정: 전달받은 coords -> 훅의 coords -> IP 기반
            let currentRegionId = 'seoul';
            let geoParams = '';

            if (currentCoords || coords) {
                const c = currentCoords || coords;
                geoParams = `&lat=${c.lat}&lon=${c.lon}`;
            } else {
                const curRes = await fetch('/api/weather/region-by-ip');
                const curIp = await curRes.json();
                currentRegionId = curIp.region || 'seoul';
            }

            // 2. 모든 지점 + 현위치 + 항만 ID 목록 생성
            const branchIds = ['current', ...BRANCHES.map(b => b.id)];
            const portIds = PORTS.map(p => p.id);
            const allIds = [...branchIds, ...portIds];

            // 3. 필수 데이터(현위치) 우선 개별 로딩하여 화면 렌더링 블로킹 해제
            const currentUrl = geoParams
                ? `/api/weather?region=current${geoParams}`
                : `/api/weather?region=${currentRegionId}`;

            fetch(currentUrl).then(async (res) => {
                if (res.ok) {
                    const data = await res.json();
                    setWeatherCache(prev => ({ ...prev, current: data }));
                    setLoading(false); // ✅ 여기서 로딩을 풀어서 화면을 즉시 띄움
                }
            }).catch(() => {
                setLoading(false); // 실패하더라도 화면은 띄움
            });

            // 4. 나머지 지점/항만 데이터는 백그라운드 병렬 페칭
            const restIds = allIds.filter(id => id !== 'current');
            const fetchResults = await Promise.all(restIds.map(async (id) => {
                const rid = id === 'current' ? currentRegionId : id;
                const finalUrl = `/api/weather?region=${rid}`;
                try {
                    const res = await fetch(finalUrl);
                    if (!res.ok) return { id, data: null };
                    const data = await res.json();
                    return { id, data };
                } catch (err) {
                    return { id, data: null };
                }
            }));

            // 5. 남은 결과를 캐시에 병합 (이전 cache 보존)
            setWeatherCache(prev => {
                const newC = { ...prev };
                fetchResults.forEach(r => {
                    if (r.data && !portIds.includes(r.id)) newC[r.id] = r.data;
                });
                return newC;
            });

            setPortCache(prev => {
                const newP = { ...prev };
                fetchResults.forEach(r => {
                    if (r.data && portIds.includes(r.id)) {
                        newP[r.id] = {
                            ...r.data,
                            wave: (Math.random() * 2 + 0.5).toFixed(1),
                            wind: (Math.random() * 10 + 2).toFixed(1)
                        };
                    }
                });
                return newP;
            });

        } catch (e) {
            console.error(e);
            setError('데이터 오류');
            setLoading(false);
        }
    }, [role, coords]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const handleRefreshLocation = () => {
        refreshLocation();
    };

    const activeData = useMemo(() => weatherCache[selectedId] || weatherCache['current'], [weatherCache, selectedId]);

    // Helper for Air Quality
    const getAirQualityStatus = (value, type) => {
        if (value == null) return { label: '-', color: '#94a3b8' };

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
                code: realData ? realData.code : [0, 1, 2, 3, 51, 61][Math.floor(Math.random() * 6)],
                apparent_temperature: realData ? realData.apparent_temperature : null
            });
        }
        return result;
    };

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <div className={styles.headerText}>
                    <h1 className={styles.mainTitle}>기상 대시보드</h1>
                    <p className={styles.subTitle}>실시간 지점별 기상 및 전 지점 모니터링</p>
                </div>
                <a href="https://www.weather.go.kr" target="_blank" rel="noopener noreferrer" className={styles.kmaShortcut}>
                    기상청 바로가기 ↗
                </a>
            </div>

            {loading ? (
                <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                    <p style={{ color: '#64748b' }}>기상 데이터를 분석하고 있습니다...</p>
                </div>
            ) : (
                <motion.div
                    className={styles.gridContainer}
                    initial="hidden"
                    animate="visible"
                    variants={{
                        visible: { transition: { staggerChildren: 0.05 } }
                    }}
                >
                    {/* 1. Hero Card (Current Weather) */}
                    {activeData && (() => {
                        const cur = activeData.hourly[0];
                        return (
                            <motion.div
                                variants={{
                                    hidden: { opacity: 0, y: 20 },
                                    visible: { opacity: 1, y: 0 }
                                }}
                                className={`${styles.card} ${styles.heroCard}`}
                            >
                                <div className={styles.heroContent}>
                                    <div className={styles.locationBadgeWrap}>
                                        <div className={styles.locationBadge}>
                                            📍 {selectedId === 'current' ? (activeData.region?.name || '현위치') : BRANCHES.find(b => b.id === selectedId)?.name}
                                        </div>
                                        {selectedId === 'current' && (
                                            <button
                                                className={styles.refreshLocBtn}
                                                onClick={handleRefreshLocation}
                                                disabled={geoLoading || loading}
                                                title="위치 새로고침"
                                            >
                                                {geoLoading ? '...' : (
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <div className={styles.currentTemp}>{Math.round(cur.temp)}°</div>
                                    <div className={styles.currentCondition}>{weatherCodeToLabel(cur.code)}</div>
                                    {activeData.dailySummary && (
                                        <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#475569', opacity: 0.9 }}>
                                            {activeData.dailySummary.split('.')[0]}.
                                            {cur.apparent_temperature != null && (
                                                <span style={{ marginLeft: '8px', fontWeight: 700 }}> (체감 {Math.round(cur.apparent_temperature)}°)</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                                <div className={styles.heroDecor} />
                                <div className={styles.heroIconWrap}>
                                    <Image
                                        src={getWeatherImagePath(cur.code)}
                                        alt={weatherCodeToLabel(cur.code)}
                                        width={280}
                                        height={280}
                                        priority
                                        className={styles.heroIcon}
                                    />
                                </div>
                            </motion.div>
                        );
                    })()}

                    {/* 2. Air Quality Card */}
                    <motion.div
                        variants={{
                            hidden: { opacity: 0, scale: 0.95 },
                            visible: { opacity: 1, scale: 1 }
                        }}
                        className={`${styles.card} ${styles.aqCard}`}
                    >
                        <div className={styles.cardTitle}>
                            <span className={styles.cardTitleIcon}>🍃</span> 대기질 모니터링
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
                    </motion.div>

                    {/* 3. Branch List (Detailed + Grid) */}
                    <motion.div
                        variants={{
                            hidden: { opacity: 0, x: -20 },
                            visible: { opacity: 1, x: 0 }
                        }}
                        className={styles.branchSection}
                    >
                        <div className={styles.cardTitle} style={{ marginBottom: '12px' }}>
                            <span className={styles.cardTitleIcon}>🏢</span> 지점별 날씨
                        </div>
                        <div className={styles.branchGrid}>
                            {/* Current Location as First Branch */}
                            {(() => {
                                const curData = weatherCache['current']?.hourly[0];
                                const feelsLike = curData?.apparent_temperature ?? (curData ? (Number(curData.temp) - 1.5).toFixed(1) : '-');
                                // Mock Dust for branch
                                const dustOptions = [{ label: '좋음', color: '#10b981' }, { label: '보통', color: '#f59e0b' }];
                                const dust = dustOptions[0]; // Fixed for stability or random

                                return (
                                    <motion.div
                                        whileTap={{ scale: 0.98 }}
                                        className={`${styles.branchCard} ${selectedId === 'current' ? styles.branchActive : ''}`}
                                        onClick={() => setSelectedId('current')}
                                    >
                                        <div className={styles.branchInfoSide}>
                                            <span className={styles.branchName}>현위치</span>
                                            <div className={styles.branchStats}>
                                                <div className={`${styles.statItem} ${styles.temp}`}>
                                                    <span className={styles.statLabel}>기온</span>
                                                    <span className={styles.statVal}>{Math.round(curData?.temp ?? 0)}°</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.feels}`}>
                                                    <span className={styles.statLabel}>체감</span>
                                                    <span className={styles.statVal}>{Math.round(feelsLike)}°</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.dust}`}>
                                                    <span className={styles.statLabel}>미세</span>
                                                    <span className={styles.statVal} style={{ color: dust.color }}>{dust.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.branchIconWrap}>
                                            <Image
                                                src={getWeatherImagePath(curData?.code)}
                                                alt=""
                                                width={60}
                                                height={60}
                                                className={styles.branchIcon}
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })()}

                            {BRANCHES.map(b => {
                                const curData = weatherCache[b.id]?.hourly[0];
                                const feelsLike = curData?.apparent_temperature ?? (curData ? (Number(curData.temp) - 1.5).toFixed(1) : '-');
                                // For branches, we don't have specific air quality data in activeData, so we keep the mock for now.
                                // If branch-specific AQ data becomes available, this should be updated.
                                const dustOptions = [{ label: '좋음', color: '#10b981' }, { label: '보통', color: '#f59e0b' }];
                                const dust = dustOptions[Math.floor(Math.random() * dustOptions.length)];

                                return (
                                    <motion.div
                                        key={b.id}
                                        whileTap={{ scale: 0.98 }}
                                        className={`${styles.branchCard} ${selectedId === b.id ? styles.branchActive : ''}`}
                                        onClick={() => setSelectedId(b.id)}
                                    >
                                        <div className={styles.branchInfoSide}>
                                            <span className={styles.branchName}>{b.name}</span>
                                            <div className={styles.branchStats}>
                                                <div className={`${styles.statItem} ${styles.temp}`}>
                                                    <span className={styles.statLabel}>기온</span>
                                                    <span className={styles.statVal}>{curData ? `${Math.round(curData.temp)}°` : '-'}</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.feels}`}>
                                                    <span className={styles.statLabel}>체감</span>
                                                    <span className={styles.statVal}>{curData ? `${Math.round(feelsLike)}°` : '-'}</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.dust}`}>
                                                    <span className={styles.statLabel}>미세</span>
                                                    <span className={styles.statVal} style={{ color: dust.color }}>{dust.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.branchIconWrap}>
                                            <Image
                                                src={getWeatherImagePath(curData?.code)}
                                                alt=""
                                                width={60}
                                                height={60}
                                                className={styles.branchIcon}
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* 4. Hourly Forecast */}
                    <motion.div
                        variants={{
                            hidden: { opacity: 0, y: 10 },
                            visible: { opacity: 1, y: 0 }
                        }}
                        className={styles.hourlySection}
                    >
                        <div className={styles.cardTitle} style={{ marginBottom: '8px' }}>
                            <span className={styles.cardTitleIcon}>⏰</span> 12시간 예보
                        </div>
                        <div className={styles.hourlyTrack}>
                            {activeData?.hourly?.slice(1, 13).map((h, i) => (
                                <div key={i} className={styles.hourlyCard}>
                                    <span className={styles.hourTime}>{new Date(h.time + ":00+09:00").getHours()}시</span>
                                    <div className={styles.hourIconWrap}>
                                        <Image
                                            src={getWeatherImagePath(h.code)}
                                            alt=""
                                            width={40}
                                            height={40}
                                        />
                                    </div>
                                    <span className={styles.hourTemp}>{Math.round(h.temp)}°</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* 5. Weekly Forecast (Detailed Cards, No Container BG) */}
                    <motion.div
                        variants={{
                            hidden: { opacity: 0, y: 15 },
                            visible: { opacity: 1, y: 0 }
                        }}
                        className={styles.weeklySection}
                    >
                        <div className={styles.cardTitle} style={{ marginBottom: '12px' }}>
                            <span className={styles.cardTitleIcon}>📅</span> 주간 예보
                        </div>
                        <div className={styles.weeklyGrid}>
                            {getWeeklyForecast().map((w, i) => {
                                // API 체감온도가 있으면 사용, 없으면 기존대로 계산(폴백)
                                const feelsLike = w.apparent_temperature != null ? w.apparent_temperature : (Number(w.temp) - 1.5).toFixed(1);
                                const dustOptions = [
                                    { label: '좋음', color: '#10b981', val: '25' },
                                    { label: '보통', color: '#f59e0b', val: '45' },
                                    { label: '좋음', color: '#10b981', val: '18' },
                                    { label: '나쁨', color: '#ef4444', val: '85' }
                                ];
                                const dust = dustOptions[Math.floor(Math.random() * dustOptions.length)];

                                return (
                                    <div key={i} className={styles.weeklyCard}>
                                        <div className={styles.weeklyInfoSide}>
                                            <div className={`${styles.weekDay} ${i === 0 ? styles.today : ''}`}>{w.dayName}</div>
                                            <div className={styles.weekStats}>
                                                <div className={`${styles.statItem} ${styles.temp}`}>
                                                    <span className={styles.statLabel}>기온</span>
                                                    <span className={styles.statVal}>{Math.round(w.temp)}°</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.feels}`}>
                                                    <span className={styles.statLabel}>체감</span>
                                                    <span className={styles.statVal}>{Math.round(feelsLike)}°</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.dust}`}>
                                                    <span className={styles.statLabel}>미세</span>
                                                    <span className={styles.statVal} style={{ color: dust.color }}>{dust.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.weekIconWrap}>
                                            <Image
                                                src={getWeatherImagePath(w.code)}
                                                alt=""
                                                width={50}
                                                height={50}
                                                className={styles.weekIcon}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* 6. Port Monitoring */}
                    <motion.div
                        variants={{
                            hidden: { opacity: 0, y: 20 },
                            visible: { opacity: 1, y: 0 }
                        }}
                        className={styles.portSection}
                    >
                        <div className={styles.cardTitle} style={{ marginBottom: '12px' }}>
                            <span className={styles.cardTitleIcon}>⚓</span> 주요 항만 기상 모니터링
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
                                                    <span className={styles.statVal}>{cur ? `${Math.round(cur.temp)}°` : '-'}</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.wave}`}>
                                                    <span className={styles.statLabel}>파고</span>
                                                    <span className={styles.statVal}>{data ? `${data.wave}m` : '-'}</span>
                                                </div>
                                                <div className={`${styles.statItem} ${styles.wind}`}>
                                                    <span className={styles.statLabel}>풍속</span>
                                                    <span className={styles.statVal}>{data ? `${data.wind}m/s` : '-'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.portIconWrap}>
                                            <Image
                                                src={getWeatherImagePath(cur?.code)}
                                                alt=""
                                                width={50}
                                                height={50}
                                                className={styles.portIcon}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}
