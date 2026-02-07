'use client';

import { useState, useEffect } from 'react';
import styles from './InfoTicker.module.css';

import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import ApprovalModal from './ApprovalModal';

const OTHER_REGION_IDS = ['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'gwangju', 'ulsan', 'suwon', 'changwon', 'sejong', 'asan', 'dangjin', 'yesan'];
const ROTATE_INTERVAL_MS = 5000;

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

export default function InfoTicker({ style, isEmployees = false }) {
    const router = useRouter();
    const { role } = useUserRole();
    const [mounted, setMounted] = useState(false);
    const [liveTime, setLiveTime] = useState(null);
    const [newsItems, setNewsItems] = useState([]);
    const [tickerRegionIndex, setTickerRegionIndex] = useState(0);
    const [weatherCache, setWeatherCache] = useState({});
    const [lastFetchTime, setLastFetchTime] = useState(0);
    const [showModal, setShowModal] = useState(false);

    // 마운트 체크
    useEffect(() => {
        setMounted(true);
        setLiveTime(new Date());
    }, []);

    // 실시간 시계 (초 단위)
    useEffect(() => {
        const timer = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 뉴스 및 모든 지역 날씨 가져오기 (30분 주기)
    useEffect(() => {
        const fetchAllData = async () => {
            const now = Date.now();
            if (lastFetchTime > 0 && now - lastFetchTime < 30 * 60 * 1000) return;

            // 뉴스 Fetch
            fetch('/api/news')
                .then((res) => res.json())
                .then((json) => { if (!json.error && json.items?.length) setNewsItems(json.items); })
                .catch(() => setNewsItems([]));

            // 모든 지역 날씨 Fetch (순차적 또는 병렬)
            const newCache = { ...weatherCache };
            for (const rid of OTHER_REGION_IDS) {
                try {
                    const res = await fetch(`/api/weather?region=${rid}`);
                    const json = await res.json();
                    if (!json.error) newCache[rid] = json;
                } catch (e) { }
            }
            setWeatherCache(newCache);
            setLastFetchTime(now);
        };

        fetchAllData();
        const timer = setInterval(fetchAllData, 30 * 60 * 1000);
        return () => clearInterval(timer);
    }, [lastFetchTime]);

    // 티커 날씨 지역 순환 (5초) - 서버 요청 없이 인덱스만 변경
    useEffect(() => {
        const timer = setInterval(() => {
            setTickerRegionIndex((prev) => (prev + 1) % OTHER_REGION_IDS.length);
        }, ROTATE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    const tickerWeather = weatherCache[OTHER_REGION_IDS[tickerRegionIndex]];

    if (!mounted) return null;

    const handleRestrictedClick = (path) => {
        if (!role) {
            setShowModal(true);
            return;
        }
        router.push(path);
    };

    const formatTickerTime = (date) => {
        if (!date) return '';
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const day = days[date.getDay()];
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${y}. ${m}. ${d}. (${day}) ${hh}:${mm}:${ss}`;
    };

    return (
        <>
            <div className={`${styles.tickerBar} ${isEmployees ? styles.stickyTop : ''}`} style={style}>
                <div className={styles.tickerInfo}>
                    <div className={styles.tickerClock}>
                        {formatTickerTime(liveTime)}
                    </div>
                    {tickerWeather && (
                        <div
                            className={styles.tickerWeather}
                            onClick={() => handleRestrictedClick('/employees/weather')}
                            style={{ cursor: 'pointer' }}
                            title="날씨 상세 보기"
                        >
                            <img
                                src={getWeatherImagePath(tickerWeather.hourly?.[0]?.code)}
                                alt=""
                                className={styles.tickerWeatherIcon}
                            />
                            <span className={styles.tickerWeatherText}>
                                {tickerWeather.region.name} {tickerWeather.hourly?.[0]?.temp}°C
                            </span>
                        </div>
                    )}
                </div>
                <div className={styles.tickerDivider}></div>
                <div className={styles.tickerNews}>
                    <div className={styles.tickerNewsLabel}>HEADLINE</div>
                    <div className={styles.tickerNewsTrack}>
                        <div className={styles.tickerNewsScroll}>
                            {newsItems.length > 0 ? (
                                [...newsItems, ...newsItems].map((item, i) => (
                                    <span
                                        key={i}
                                        className={styles.tickerNewsItem}
                                        onClick={() => handleRestrictedClick(`/employees/news/article?url=${encodeURIComponent(item.link)}`)}
                                        style={{ cursor: 'pointer' }}
                                        title={item.title}
                                    >
                                        {item.title}
                                    </span>
                                ))
                            ) : (
                                <span className={styles.tickerNewsItem}>최신 뉴스를 불러오는 중입니다...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <ApprovalModal isOpen={showModal} onClose={() => setShowModal(false)} />
        </>
    );
}
