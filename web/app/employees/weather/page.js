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
    if (code === 45 || code === 48) return '/images/weather/cloudy_3d.png'; // Use cloudy icon for fog for better aesthetics if fog icon is poor
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain_3d.png';
    if (code >= 71 && code <= 77) return '/images/weather/snow_3d.png';
    if (code >= 95) return '/images/weather/thunder_3d.png';
    return '/images/weather/cloudy_3d.png';
}

function getHeroStyle(code) {
    if (code == null) return {};
    if (code <= 1) return {
        background: 'linear-gradient(135deg, #fffcf0 0%, #fff7ed 100%)',
        border: '1px solid #ffedd5',
        labelColor: '#101828',
        descColor: '#101828'
    };
    if (code <= 3 || code === 45 || code === 48) return {
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1px solid #e2e8f0',
        labelColor: '#101828',
        descColor: '#101828'
    };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return {
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        border: '1px solid #bae6fd',
        labelColor: '#101828',
        descColor: '#101828'
    };
    if (code >= 71 && code <= 77) return {
        background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
        border: '1px solid #f1f5f9',
        labelColor: '#101828',
        descColor: '#101828'
    };
    if (code >= 95) return {
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
        border: '1px solid #cbd5e1',
        labelColor: '#101828',
        descColor: '#101828'
    };
    return {};
}

/** 날씨 API time (ISO "2026-01-30T14:00") → "2026년 2월 2일 08:30" */
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
    } catch {
        return '';
    }
}

function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function getSummaryColor(temp) {
    if (temp == null) return '#1e293b';
    if (temp <= 5) return '#0369a1'; // 추울 때 파란색
    if (temp >= 28) return '#e11d48'; // 더울 때 빨간색
    return '#101828'; // 일반적일 때 검은색 (더 짙게)
}

export default function WeatherPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [currentData, setCurrentData] = useState(null);
    const [otherStartIndex, setOtherStartIndex] = useState(0);
    const [otherData, setOtherData] = useState([null, null, null]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/weather');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (!role) return;
        setLoading(true);
        setError(null);
        const mobile = isMobileDevice();
        const doFetch = (regionId) =>
            fetch(`/api/weather?region=${regionId}`)
                .then((res) => res.json())
                .then((json) => {
                    if (json.error) throw new Error(json.error);
                    setCurrentData(json);
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));

        if (mobile && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetch(`/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
                        .then((res) => res.json())
                        .then((json) => {
                            if (json.error) throw new Error(json.error);
                            setCurrentData(json);
                        })
                        .catch((e) => setError(e.message))
                        .finally(() => setLoading(false));
                },
                () => fetch('/api/weather/region-by-ip').then((r) => r.json()).then((j) => doFetch(j.region || 'seoul')),
                { timeout: 10000, maximumAge: 300000 }
            );
        } else {
            fetch('/api/weather/region-by-ip')
                .then((r) => r.json())
                .then((j) => doFetch(j.region || 'seoul'));
        }
    }, [role]);

    useEffect(() => {
        const ids = [OTHER_REGIONS[otherStartIndex % 10], OTHER_REGIONS[(otherStartIndex + 1) % 10], OTHER_REGIONS[(otherStartIndex + 2) % 10]];
        Promise.all(ids.map((id) => fetch(`/api/weather?region=${id}`).then((r) => r.json())))
            .then((arr) => setOtherData(arr.map((j) => (j.error ? null : j))));
    }, [otherStartIndex]);

    useEffect(() => {
        const tid = setInterval(() => setOtherStartIndex((i) => (i + 3) % 10), OTHER_ROTATE_MS);
        return () => clearInterval(tid);
    }, []);

    if (authLoading || !role) return null;

    const current = currentData?.hourly?.[0];
    const lastUpdated = currentData?.updatedAt ?? null;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>실시간 기상 정보</h1>
                <p className={styles.subtitle}>현위치 기반 정밀 기상 예보와 주요 지역의 실시간 날씨를 제공합니다.</p>
                {lastUpdated && (
                    <p className={styles.updated}>관측 시각: {formatUpdateTime(lastUpdated)}</p>
                )}
            </div>

            <div className={styles.card}>
                {error && <div className={styles.errorBox}><p className={styles.error}>{error}</p></div>}
                {loading && <p className={styles.loading}>기상 데이터를 분석하는 중입니다...</p>}

                {/* 현위치 고정 - 큰 이미지 */}
                {currentData && !loading && current && (() => {
                    const heroStyle = getHeroStyle(current.code);
                    return (
                        <div className={styles.currentSection}>
                            <h2 className={styles.currentSectionTitle}>현위치 기상 상태</h2>
                            <div
                                className={styles.currentHero}
                                style={{
                                    background: `url(${getWeatherImagePath(current.code)}) no-repeat right 40px center / 160px, ${heroStyle.background}`,
                                    border: heroStyle.border
                                }}
                            >
                                <div className={styles.currentHeroContent}>
                                    <span className={styles.currentHeroLabel} style={{ color: heroStyle.labelColor }}>
                                        {currentData.region?.name}
                                    </span>
                                    <span className={styles.currentHeroDesc} style={{ color: heroStyle.descColor }}>
                                        {weatherCodeToLabel(current.code)} {current.temp != null ? `${current.temp}°C` : ''}
                                    </span>
                                    {currentData.dailySummary && (() => {
                                        const summaryColor = getSummaryColor(current.temp);
                                        return (
                                            <p
                                                className={styles.weatherForecastDesc}
                                                style={{
                                                    color: summaryColor,
                                                    borderTopColor: summaryColor + '20', // Subtle divider
                                                    fontWeight: '600' // Better readability for colored text
                                                }}
                                            >
                                                {currentData.dailySummary}
                                            </p>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 다른 지역 3개 - 작은 이미지, 5초마다 전환 */}
                <div className={styles.otherSection}>
                    <h2 className={styles.otherSectionTitle}>주요 지역 실시간 날씨</h2>
                    <div className={styles.otherRow}>
                        {otherData.map((d, i) => {
                            const regionId = OTHER_REGIONS[(otherStartIndex + i) % 10];
                            const h = d?.hourly?.[0];
                            const name = d?.region?.name ?? REGION_NAMES[regionId] ?? regionId;
                            return (
                                <div key={`${otherStartIndex}-${i}`} className={styles.otherCard}>
                                    <img
                                        src={getWeatherImagePath(h?.code)}
                                        alt=""
                                        className={styles.otherCardImg}
                                        aria-hidden
                                    />
                                    <div className={styles.otherCardBody}>
                                        <span className={styles.otherCardName}>{name}</span>
                                        <span className={styles.otherCardTemp}>
                                            {h?.temp != null ? `${h.temp}°C` : '—'} · {weatherCodeToLabel(h?.code)}
                                        </span>
                                        {h?.time && (
                                            <span className={styles.otherCardDate}>{formatWeatherDateTimeShort(h.time)}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 시간별 날씨 - 현위치 기준 */}
                {currentData && !loading && (
                    <>
                        <h2 className={styles.sectionTitle}>{currentData.region?.name} · 시간별 날씨</h2>
                        <div className={styles.hourlyWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>시간</th>
                                        <th>날씨</th>
                                        <th>기온(°C)</th>
                                        <th>강수확률(%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentData.hourly?.map((h, i) => (
                                        <tr key={h.time || i}>
                                            <td>{formatHour(h.time)}</td>
                                            <td className={styles.cellWeather}>
                                                <img src={getWeatherImagePath(h.code)} alt="" className={styles.weatherIcon} aria-hidden />
                                                {weatherCodeToLabel(h.code)}
                                            </td>
                                            <td>{h.temp != null ? h.temp : '—'}</td>
                                            <td>{h.pop != null ? h.pop : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
