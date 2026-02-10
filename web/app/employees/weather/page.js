'use client';

import { useState, useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';

function formatUpdateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const month = d.getMonth() + 1;
    const dateNum = d.getDate();
    const h = d.getHours();
    const m = d.getMinutes();
    return `${y}년 ${month}월 ${dateNum}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WEATHER_LABELS = {
    0: '맑음', 1: '대체로 맑음', 2: '약간 흐림', 3: '흐림', 45: '안개', 48: '서리 안개',
    51: '이슬비', 61: '비', 63: '비(강함)', 71: '눈', 80: '소나기', 95: '뇌우',
};

// 지점 정의
const BRANCHES = [
    { id: 'seoul', name: '서울본사' },
    { id: 'asan', name: '아산지점' },
    { id: 'jungbu', name: '중부지점' },
    { id: 'dangjin', name: '당진지점' },
    { id: 'yesan', name: '예산지점' }
];

const OTHER_REGIONS = ['seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'ulsan', 'suwon', 'changwon', 'sejong'];
const REGION_NAMES = { seoul: '서울', busan: '부산', incheon: '인천', daegu: '대구', daejeon: '대전', gwangju: '광주', ulsan: '울산', suwon: '수원', changwon: '창원', sejong: '세종' };
const OTHER_ROTATE_MS = 5000;

function weatherCodeToLabel(code) {
    if (code == null) return '—';
    return WEATHER_LABELS[code] ?? '—';
}

function formatHour(timeStr) {
    if (!timeStr) return '—';
    const d = new Date(timeStr);
    const y = d.getFullYear();
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const h = d.getHours();
    const m = d.getMinutes();
    return `${y}년 ${month}월 ${date}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getWeatherImagePath(code) {
    if (code == null) return '/images/weather/sunny_3d.png';
    if (code <= 1) return '/images/weather/sunny_3d.png';
    if (code <= 3) return '/images/weather/cloudy_3d.png';
    if (code === 45 || code === 48) return '/images/weather/cloudy_3d.png';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain_3d.png';
    if (code >= 71 && code <= 77) return '/images/weather/snow_3d.png';
    if (code >= 95) return '/images/weather/thunder_3d.png';
    return '/images/weather/cloudy_3d.png';
}

function getHeroStyle(code) {
    if (code == null) return {};
    if (code <= 1) return { background: 'linear-gradient(135deg, #fffcf0 0%, #fff7ed 100%)', border: '1px solid #ffedd5', labelColor: '#101828', descColor: '#101828' };
    if (code <= 3 || code === 45 || code === 48) return { background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0', labelColor: '#101828', descColor: '#101828' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #bae6fd', labelColor: '#101828', descColor: '#101828' };
    if (code >= 71 && code <= 77) return { background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)', border: '1px solid #f1f5f9', labelColor: '#101828', descColor: '#101828' };
    if (code >= 95) return { background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', border: '1px solid #cbd5e1', labelColor: '#101828', descColor: '#101828' };
    return {};
}

function formatWeatherDateTimeShort(isoTime) {
    if (!isoTime || typeof isoTime !== 'string') return '';
    try {
        const d = new Date(isoTime);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const h = d.getHours();
        const m = d.getMinutes();
        return `${y}년 ${month}월 ${date}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } catch { return ''; }
}

function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function getSummaryColor(temp) {
    if (temp == null) return '#1e293b';
    if (temp <= 5) return '#0369a1';
    if (temp >= 28) return '#e11d48';
    return '#101828';
}

export default function WeatherPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [currentData, setCurrentData] = useState(null);
    const [branchWeather, setBranchWeather] = useState({}); // { branchId: weatherData }
    const [otherStartIndex, setOtherStartIndex] = useState(0);
    const [otherWeatherCache, setOtherWeatherCache] = useState({});
    const [lastFetchTime, setLastFetchTime] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    // 현위치 날씨 로드
    useEffect(() => {
        if (!role) return;
        setLoading(true);
        const doFetch = (regionId) =>
            fetch(`/api/weather?region=${regionId}`)
                .then((res) => res.json())
                .then((json) => {
                    if (json.error) throw new Error(json.error);
                    setCurrentData(json);
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));

        if (isMobileDevice() && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetch(`/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
                        .then((res) => res.json())
                        .then((json) => { if (json.error) throw new Error(json.error); setCurrentData(json); })
                        .catch((e) => setError(e.message))
                        .finally(() => setLoading(false));
                },
                () => fetch('/api/weather/region-by-ip').then((r) => r.json()).then((j) => doFetch(j.region || 'seoul')),
                { timeout: 10000, maximumAge: 300000 }
            );
        } else {
            fetch('/api/weather/region-by-ip').then((r) => r.json()).then((j) => doFetch(j.region || 'seoul'));
        }
    }, [role]);

    // 지점 및 기타 지역 날씨 캐싱
    useEffect(() => {
        if (!role) return;
        const fetchExtendedWeather = async () => {
            const now = Date.now();
            if (lastFetchTime > 0 && now - lastFetchTime < 30 * 60 * 1000) return;

            // 지점별 날씨 로드
            const bCache = {};
            for (const b of BRANCHES) {
                try {
                    const res = await fetch(`/api/weather?region=${b.id}`);
                    const json = await res.json();
                    if (!json.error) bCache[b.id] = json;
                } catch (e) { }
            }
            setBranchWeather(bCache);

            // 주요 지역 날씨 로드
            const oCache = {};
            for (const rid of OTHER_REGIONS) {
                try {
                    const res = await fetch(`/api/weather?region=${rid}`);
                    const json = await res.json();
                    if (!json.error) oCache[rid] = json;
                } catch (e) { }
            }
            setOtherWeatherCache(oCache);
            setLastFetchTime(now);
        };

        fetchExtendedWeather();
        const timer = setInterval(fetchExtendedWeather, 30 * 60 * 1000);
        return () => clearInterval(timer);
    }, [role, lastFetchTime]);

    useEffect(() => {
        const tid = setInterval(() => setOtherStartIndex((i) => (i + 3) % OTHER_REGIONS.length), OTHER_ROTATE_MS);
        return () => clearInterval(tid);
    }, []);

    if (authLoading || !role) return null;

    const current = currentData?.hourly?.[0];
    const lastUpdated = currentData?.updatedAt ?? null;

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>실시간 기상 정보</h1>
                <p className={styles.subtitle}>현위치 및 지점별 정밀 기상 정보를 실시간으로 확인하세요.</p>
                {lastUpdated && <p className={styles.updated}>관측 시각: {formatUpdateTime(lastUpdated)}</p>}
            </div>

            <div className={styles.splitLayout}>
                {/* 왼쪽 열: 현위치 정보 및 시간별 예보 */}
                <div className={styles.leftColumn}>
                    <div className={styles.card}>
                        {error && <div className={styles.errorBox}><p className={styles.error}>{error}</p></div>}
                        {loading && <p className={styles.loading}>데이터를 불러오는 중입니다...</p>}

                        {currentData && !loading && current && (() => {
                            const heroStyle = getHeroStyle(current.code);
                            return (
                                <div className={styles.currentSection}>
                                    <h2 className={styles.currentSectionTitle}>현위치 기상 상태</h2>
                                    <div className={styles.currentHero} style={{ background: `url(${getWeatherImagePath(current.code)}) no-repeat right 40px center / 160px, ${heroStyle.background}`, border: heroStyle.border }}>
                                        <div className={styles.currentHeroContent}>
                                            <span className={styles.currentHeroLabel} style={{ color: heroStyle.labelColor }}>{currentData.region?.name}</span>
                                            <span className={styles.currentHeroDesc} style={{ color: heroStyle.descColor }}>{weatherCodeToLabel(current.code)} {current.temp != null ? `${current.temp}°C` : ''}</span>
                                            {currentData.dailySummary && <p className={styles.weatherForecastDesc} style={{ color: getSummaryColor(current.temp), borderTopColor: getSummaryColor(current.temp) + '20', fontWeight: '600' }}>{currentData.dailySummary}</p>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 시간별 날씨 */}
                        {currentData && !loading && (
                            <>
                                <h2 className={styles.sectionTitle}>{currentData.region?.name} · 시간별 예보</h2>
                                <div className={styles.hourlyWrap}>
                                    <table className={styles.table}>
                                        <thead><tr><th>시간</th><th>날씨</th><th>기온</th><th>강수</th></tr></thead>
                                        <tbody>
                                            {currentData.hourly?.slice(0, 12).map((h, i) => (
                                                <tr key={i}>
                                                    <td>{new Date(h.time).getHours()}시</td>
                                                    <td className={styles.cellWeather}>
                                                        <img src={getWeatherImagePath(h.code)} alt="" className={styles.weatherIcon} />
                                                        {weatherCodeToLabel(h.code)}
                                                    </td>
                                                    <td>{h.temp}°C</td>
                                                    <td>{h.pop}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 오른쪽 열: 지점별 실시간 현황 */}
                <aside className={styles.rightColumn}>
                    <h2 className={styles.branchSectionTitle}>지점별 실시간 날씨</h2>
                    {BRANCHES.map((b) => {
                        const data = branchWeather[b.id];
                        const h = data?.hourly?.[0];
                        return (
                            <div key={b.id} className={styles.branchCard}>
                                <img src={getWeatherImagePath(h?.code)} alt="" className={styles.branchIcon} />
                                <div className={styles.branchInfo}>
                                    <span className={styles.branchName}>{b.name}</span>
                                    <span className={styles.branchWeather}>{weatherCodeToLabel(h?.code)}</span>
                                </div>
                                <span className={styles.branchTemp}>{h?.temp != null ? `${h.temp}°C` : '—'}</span>
                            </div>
                        );
                    })}

                    <div className={styles.card} style={{ marginTop: '16px', padding: '16px' }}>
                        <h3 className={styles.otherSectionTitle} style={{ fontSize: '0.95rem' }}>기타 주요 지역</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {[0, 1, 2].map((i) => {
                                const rid = OTHER_REGIONS[(otherStartIndex + i) % OTHER_REGIONS.length];
                                const d = otherWeatherCache[rid];
                                const h = d?.hourly?.[0];
                                return (
                                    <div key={rid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span>{REGION_NAMES[rid]}</span>
                                        <span style={{ fontWeight: '700' }}>{h?.temp ?? '—'}°C</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}