'use client';

import { useState, useEffect } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './weather.module.css';

function formatUpdateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

function getWeatherImagePath(code) {
    if (code == null) return '/images/weather/sunny.svg';
    if (code <= 1) return '/images/weather/sunny.svg';
    if (code <= 3) return '/images/weather/cloudy.svg';
    if (code === 45 || code === 48) return '/images/weather/fog.svg';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain.svg';
    if (code >= 71 && code <= 77) return '/images/weather/snow.svg';
    if (code >= 95) return '/images/weather/thunder.svg';
    return '/images/weather/cloudy.svg';
}

function formatHour(timeStr) {
    if (!timeStr) return '—';
    return new Date(timeStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
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
                <h1 className={styles.title}>날씨</h1>
                <p className={styles.subtitle}>현위치 날씨와 다른 지역 날씨를 확인할 수 있습니다.</p>
                {lastUpdated && (
                    <p className={styles.updated}>마지막 업데이트: {formatUpdateTime(lastUpdated)}</p>
                )}
            </div>

            <div className={styles.card}>
                {error && <p className={styles.error}>{error}</p>}
                {loading && <p className={styles.loading}>날씨를 불러오는 중...</p>}

                {/* 현위치 고정 - 큰 이미지 */}
                {currentData && !loading && current && (
                    <div className={styles.currentSection}>
                        <h2 className={styles.currentSectionTitle}>현위치</h2>
                        <div
                            className={styles.currentHero}
                            style={{ backgroundImage: `url(${getWeatherImagePath(current.code)})` }}
                        >
                            <div className={styles.currentHeroContent}>
                                <span className={styles.currentHeroLabel}>{currentData.region?.name}</span>
                                <span className={styles.currentHeroDesc}>
                                    {weatherCodeToLabel(current.code)} {current.temp != null ? `${current.temp}°C` : ''}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 다른 지역 3개 - 작은 이미지, 5초마다 전환 */}
                <div className={styles.otherSection}>
                    <h2 className={styles.otherSectionTitle}>다른 지역 (5초마다 전환)</h2>
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
                                    <span className={styles.otherCardName}>{name}</span>
                                    <span className={styles.otherCardTemp}>
                                        {h?.temp != null ? `${h.temp}°C` : '—'}
                                    </span>
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
