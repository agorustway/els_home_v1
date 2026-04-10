'use client';

import { useState, useEffect, useRef } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';

/* ═══════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════ */
const REGIONS = [
    { id: 'current', name: '현위치', emoji: '📍' },
    { id: 'seoul', name: '서울', emoji: '🏙️' },
    { id: 'asan', name: '아산', emoji: '🏢' },
    { id: 'dangjin', name: '당진', emoji: '⚓' },
    { id: 'yesan', name: '예산', emoji: '🌿' },
    { id: 'sejong', name: '중부(세종)', emoji: '🏛️' },
];

const WEATHER_MAP = {
    0: { label: '맑음', emoji: '☀️', gradient: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)' },
    1: { label: '대체로 맑음', emoji: '🌤️', gradient: 'linear-gradient(135deg, #2563eb 0%, #93c5fd 100%)' },
    2: { label: '약간 흐림', emoji: '⛅', gradient: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)' },
    3: { label: '흐림', emoji: '☁️', gradient: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)' },
    45: { label: '안개', emoji: '🌫️', gradient: 'linear-gradient(135deg, #64748b 0%, #cbd5e1 100%)' },
    48: { label: '짙은 안개', emoji: '🌫️', gradient: 'linear-gradient(135deg, #64748b 0%, #cbd5e1 100%)' },
    51: { label: '이슬비', emoji: '🌦️', gradient: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' },
    53: { label: '이슬비', emoji: '🌦️', gradient: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' },
    55: { label: '진한 이슬비', emoji: '🌦️', gradient: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' },
    61: { label: '약한 비', emoji: '🌧️', gradient: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)' },
    63: { label: '비', emoji: '🌧️', gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' },
    65: { label: '강한 비', emoji: '🌧️', gradient: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
    71: { label: '고운 눈', emoji: '🌨️', gradient: 'linear-gradient(135deg, #818cf8 0%, #c7d2fe 100%)' },
    73: { label: '눈', emoji: '❄️', gradient: 'linear-gradient(135deg, #6366f1 0%, #a5b4fc 100%)' },
    75: { label: '폭설', emoji: '❄️', gradient: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)' },
    77: { label: '싸락눈', emoji: '🌨️', gradient: 'linear-gradient(135deg, #6366f1 0%, #a5b4fc 100%)' },
    80: { label: '소나기', emoji: '🌧️', gradient: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)' },
    81: { label: '강한 소나기', emoji: '⛈️', gradient: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' },
    82: { label: '매우 강한 소나기', emoji: '⛈️', gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' },
    85: { label: '약한 눈보라', emoji: '🌨️', gradient: 'linear-gradient(135deg, #6366f1 0%, #a5b4fc 100%)' },
    86: { label: '강한 눈보라', emoji: '❄️', gradient: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)' },
    95: { label: '뇌우', emoji: '⛈️', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
    96: { label: '우박', emoji: '⛈️', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
    99: { label: '강한 우박', emoji: '⛈️', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' },
};

function getWeather(code) {
    if (code == null) return WEATHER_MAP[0];
    return WEATHER_MAP[code] || WEATHER_MAP[3];
}

function getAirStatus(value, type) {
    if (value == null) return { label: '—', color: '#94a3b8' };
    if (type === 'pm10') {
        if (value > 150) return { label: '매우나쁨', color: '#dc2626' };
        if (value > 80) return { label: '나쁨', color: '#ef4444' };
        if (value > 30) return { label: '보통', color: '#f59e0b' };
        return { label: '좋음', color: '#10b981' };
    }
    if (value > 75) return { label: '매우나쁨', color: '#dc2626' };
    if (value > 35) return { label: '나쁨', color: '#ef4444' };
    if (value > 15) return { label: '보통', color: '#f59e0b' };
    return { label: '좋음', color: '#10b981' };
}

function generateAlerts(data) {
    if (!data?.hourly?.[0]) return [];
    const cur = data.hourly[0];
    const code = cur.code;
    const apparent = cur.apparent_temperature;
    const aq = data.airQuality;
    const alerts = [];

    if (code >= 95) alerts.push({ type: 'danger', icon: '⛈️', text: '뇌우·낙뢰 주의보' });
    else if (code >= 65 && code <= 67) alerts.push({ type: 'danger', icon: '🌧️', text: '호우 주의보' });
    else if (code >= 75 && code <= 77) alerts.push({ type: 'warning', icon: '❄️', text: '대설 주의보' });
    else if (code === 45 || code === 48) alerts.push({ type: 'info', icon: '🌫️', text: '짙은 안개 주의' });
    else if ((code >= 51 && code <= 55) || (code >= 61 && code <= 63) || (code >= 80 && code <= 82))
        alerts.push({ type: 'info', icon: '🌧️', text: '강수 예상 — 우산 필요' });

    if (apparent != null) {
        if (apparent >= 33) alerts.push({ type: 'danger', icon: '🔥', text: '폭염 주의보 — 야외활동 자제' });
        else if (apparent <= -12) alerts.push({ type: 'danger', icon: '🥶', text: '한파 주의보 — 보온 필수' });
    }

    if (aq?.pm10 > 150) alerts.push({ type: 'danger', icon: '😷', text: '미세먼지 매우나쁨 — 외출 자제' });
    else if (aq?.pm10 > 80) alerts.push({ type: 'warning', icon: '😷', text: '미세먼지 나쁨 — 마스크 권고' });

    return alerts;
}

/* ═══════════════════════════════════════════════════
   WeatherPage Component
   ═══════════════════════════════════════════════════ */
export default function WeatherPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();

    const [selectedRegion, setSelectedRegion] = useState('asan');
    const [cache, setCache] = useState({});
    const [portData, setPortData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [geoLoading, setGeoLoading] = useState(false);
    const [portsLoading, setPortsLoading] = useState(false);

    const portRef = useRef(null);
    const fetchedPorts = useRef(false);
    const fetchedRegions = useRef(new Set());
    const tabBarRef = useRef(null);

    // ─── Auth guard ───
    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    // ─── Fetch weather for a region ───
    async function fetchRegion(regionId, extraParams = '') {
        if (fetchedRegions.current.has(regionId + extraParams)) return;
        fetchedRegions.current.add(regionId + extraParams);
        try {
            const url = extraParams
                ? `/api/weather?${extraParams}`
                : `/api/weather?region=${regionId}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setCache(prev => ({ ...prev, [regionId]: data }));
            return data;
        } catch (e) {
            console.error('Weather fetch error:', e);
            fetchedRegions.current.delete(regionId + extraParams);
            return null;
        }
    }

    // ─── Initial load (default: 아산) ───
    useEffect(() => {
        if (!role) return;
        fetchRegion('asan').then(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]);

    // ─── Tab click handler ───
    function handleTabClick(regionId) {
        if (regionId === 'current') {
            handleCurrentLocation();
            return;
        }
        setSelectedRegion(regionId);
        if (!cache[regionId]) fetchRegion(regionId);
    }

    // ─── "현위치" handler ───
    function handleCurrentLocation() {
        setSelectedRegion('current');
        if (cache.current) return;

        setGeoLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetchRegion('current', `lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
                        .finally(() => setGeoLoading(false));
                },
                () => {
                    fetch('/api/weather/region-by-ip')
                        .then(r => r.json())
                        .then(d => fetchRegion('current', `region=${d.region || 'asan'}`))
                        .finally(() => setGeoLoading(false));
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        } else {
            fetch('/api/weather/region-by-ip')
                .then(r => r.json())
                .then(d => fetchRegion('current', `region=${d.region || 'asan'}`))
                .finally(() => setGeoLoading(false));
        }
    }

    // ─── Lazy-load port data (IntersectionObserver) ───
    useEffect(() => {
        if (!role || fetchedPorts.current) return;
        const el = portRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                fetchedPorts.current = true;
                setPortsLoading(true);
                fetch('/api/weather/marine')
                    .then(r => r.json())
                    .then(d => setPortData(d.ports || []))
                    .catch(() => setPortData([]))
                    .finally(() => setPortsLoading(false));
                observer.disconnect();
            }
        }, { rootMargin: '200px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [role, loading]);

    // ─── Refresh handler ───
    function handleRefresh() {
        // 'current' 탭은 geo 파라미터가 붙은 복합 키('currentlat=XX&lon=YY')도 모두 제거
        for (const key of [...fetchedRegions.current]) {
            if (key.startsWith(selectedRegion)) fetchedRegions.current.delete(key);
        }
        setCache(prev => {
            const next = { ...prev };
            delete next[selectedRegion];
            return next;
        });
        if (selectedRegion === 'current') {
            handleCurrentLocation();
        } else {
            fetchRegion(selectedRegion);
        }
    }

    // ─── Derived data ───
    const activeData = cache[selectedRegion];
    const current = activeData?.hourly?.[0];
    const weather = getWeather(current?.code);
    const alerts = activeData ? generateAlerts(activeData) : [];
    const aq = activeData?.airQuality;

    if (authLoading || !role) return null;

    const regionDisplayName = selectedRegion === 'current'
        ? (activeData?.region?.name || '현위치')
        : REGIONS.find(r => r.id === selectedRegion)?.name || '';

    return (
        <div className={styles.page}>
            {/* ─── Header ─── */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.headerTitle}>🌤️ 기상 대시보드</h1>
                </div>
                <div className={styles.headerRight}>
                    <button className={styles.refreshBtn} onClick={handleRefresh} title="새로고침">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                        </svg>
                    </button>
                    <a href="https://www.weather.go.kr" target="_blank" rel="noopener noreferrer" className={styles.kmaLink}>
                        기상청 →
                    </a>
                </div>
            </div>

            {/* ─── Region Tabs ─── */}
            <div className={styles.tabBar} ref={tabBarRef}>
                {REGIONS.map(r => (
                    <button
                        key={r.id}
                        className={`${styles.tab} ${selectedRegion === r.id ? styles.tabActive : ''}`}
                        onClick={() => handleTabClick(r.id)}
                    >
                        <span className={styles.tabEmoji}>{r.emoji}</span>
                        <span className={styles.tabName}>{r.name}</span>
                    </button>
                ))}
            </div>

            {/* ─── Loading Skeleton ─── */}
            {(loading || geoLoading || (!activeData && selectedRegion !== 'current')) && (
                <div className={styles.skeleton}>
                    <div className={styles.skeletonHero} />
                    <div className={styles.skeletonStrip} />
                    <div className={styles.skeletonRow}>
                        <div className={styles.skeletonCard} />
                        <div className={styles.skeletonCard} />
                    </div>
                </div>
            )}

            {/* ─── Weather Content ─── */}
            {activeData && current && (
                <div className={styles.content}>

                    {/* Alerts */}
                    {alerts.length > 0 && (
                        <div className={styles.alertBar}>
                            {alerts.map((a, i) => (
                                <div key={i} className={`${styles.alert} ${styles[`alert_${a.type}`]}`}>
                                    <span className={styles.alertIcon}>{a.icon}</span>
                                    <span className={styles.alertText}>{a.text}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Hero Card */}
                    <div className={styles.hero} style={{ background: weather.gradient }}>
                        <div className={styles.heroBody}>
                            <div className={styles.heroLocation}>{regionDisplayName}</div>
                            <div className={styles.heroTemp}>{Math.round(current.temp)}°</div>
                            <div className={styles.heroCondition}>{weather.label}</div>
                            <div className={styles.heroMeta}>
                                <span>체감 {Math.round(current.apparent_temperature ?? current.temp)}°</span>
                                {current.windspeed != null && <span> · 풍속 {current.windspeed}m/s</span>}
                                {current.humidity != null && <span> · 습도 {current.humidity}%</span>}
                            </div>
                        </div>
                        <div className={styles.heroEmoji}>{weather.emoji}</div>
                        <div className={styles.heroGlow} />
                    </div>

                    {/* Daily Summary */}
                    {activeData.dailySummary && (
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryIcon}>📋</span>
                            <p className={styles.summaryText}>{activeData.dailySummary.split('.').slice(0, 2).join('.') + '.'}</p>
                        </div>
                    )}

                    {/* ─── 12-Hour Forecast ─── */}
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>⏱️</span> 12시간 예보
                        </h3>
                        <div className={styles.hourlyScroll}>
                            {activeData.hourly.slice(0, 12).map((h, i) => {
                                const hw = getWeather(h.code);
                                const hour = new Date(h.time + ':00+09:00').getHours();
                                return (
                                    <div key={i} className={`${styles.hourlyItem} ${i === 0 ? styles.hourlyNow : ''}`}>
                                        <span className={styles.hourTime}>{i === 0 ? '지금' : `${hour}시`}</span>
                                        <span className={styles.hourEmoji}>{hw.emoji}</span>
                                        <span className={styles.hourTemp}>{Math.round(h.temp)}°</span>
                                        {h.pop != null && h.pop > 0 && (
                                            <span className={styles.hourRain}>💧{h.pop}%</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Air Quality ─── */}
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>🍃</span> 생활정보
                        </h3>
                        <div className={styles.aqGrid}>
                            {[
                                { label: '미세먼지', sub: 'PM10', val: aq?.pm10, type: 'pm10', icon: '🫁' },
                                { label: '초미세먼지', sub: 'PM2.5', val: aq?.pm2_5, type: 'pm25', icon: '🔬' },
                            ].map((item, i) => {
                                const status = getAirStatus(item.val, item.type);
                                return (
                                    <div key={i} className={styles.aqCard}>
                                        <div className={styles.aqTop}>
                                            <span className={styles.aqIcon}>{item.icon}</span>
                                            <span className={styles.aqLabel}>{item.label}</span>
                                        </div>
                                        <div className={styles.aqBottom}>
                                            <span className={styles.aqValue}>
                                                {item.val != null ? Math.round(item.val) : '—'}
                                                <span className={styles.aqUnit}> µg/m³</span>
                                            </span>
                                            <span className={styles.aqBadge} style={{ background: status.color }}>
                                                {status.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Port Weather (Lazy Load) ─── */}
                    <div ref={portRef} className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>⚓</span> 주요 항만 기상
                        </h3>
                        {portsLoading && (
                            <div className={styles.portLoading}>
                                <div className={styles.miniSpinner} />
                                항만 데이터 로딩 중...
                            </div>
                        )}
                        {portData && portData.length > 0 && (
                            <div className={styles.portScroll}>
                                {portData.map(p => {
                                    const pw = getWeather(p.code);
                                    return (
                                        <div key={p.id} className={styles.portCard}>
                                            <div className={styles.portHead}>
                                                <span className={styles.portEmoji}>{pw.emoji}</span>
                                                <span className={styles.portName}>{p.name}</span>
                                            </div>
                                            <div className={styles.portBody}>
                                                <div className={styles.portStat}>
                                                    <span className={styles.portStatLabel}>🌡️ 기온</span>
                                                    <span className={styles.portStatVal}>{p.temp != null ? `${Math.round(p.temp)}°` : '—'}</span>
                                                </div>
                                                <div className={styles.portStat}>
                                                    <span className={styles.portStatLabel}>💨 풍속</span>
                                                    <span className={styles.portStatVal}>{p.windSpeed != null ? `${p.windSpeed}m/s` : '—'}</span>
                                                </div>
                                                <div className={styles.portStat}>
                                                    <span className={styles.portStatLabel}>🌊 파고</span>
                                                    <span className={styles.portStatVal}>{p.waveHeight != null ? `${p.waveHeight}m` : '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {portData && portData.length === 0 && (
                            <div className={styles.portLoading}>항만 데이터를 불러올 수 없습니다.</div>
                        )}
                    </div>

                    {/* ─── Updated At ─── */}
                    {activeData.updatedAt && (
                        <div className={styles.updatedAt}>
                            마지막 업데이트: {new Date(activeData.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── No Data Fallback ─── */}
            {!loading && !activeData && selectedRegion !== 'current' && (
                <div className={styles.noData}>
                    <span style={{ fontSize: '2rem' }}>🌥️</span>
                    <p>데이터를 불러올 수 없습니다</p>
                    <button className={styles.retryBtn} onClick={() => fetchRegion(selectedRegion)}>다시 시도</button>
                </div>
            )}
        </div>
    );
}
