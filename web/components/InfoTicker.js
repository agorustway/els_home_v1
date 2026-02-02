'use client';

import { useState, useEffect } from 'react';
import styles from './InfoTicker.module.css';

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

export default function InfoTicker({ style }) {
    const [mounted, setMounted] = useState(false);
    const [liveTime, setLiveTime] = useState(null);
    const [newsItems, setNewsItems] = useState([]);
    const [tickerRegionIndex, setTickerRegionIndex] = useState(0);
    const [tickerWeather, setTickerWeather] = useState(null);

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

    // 뉴스 가져오기
    useEffect(() => {
        fetch('/api/news')
            .then((res) => res.json())
            .then((json) => { if (!json.error && json.items?.length) setNewsItems(json.items); })
            .catch(() => setNewsItems([]));
    }, []);

    // 티커 날씨 지역 순환 (5초)
    useEffect(() => {
        const timer = setInterval(() => {
            setTickerRegionIndex((prev) => (prev + 1) % OTHER_REGION_IDS.length);
        }, ROTATE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    // 티커용 현재 순환 지역 날씨 가져오기
    useEffect(() => {
        const rid = OTHER_REGION_IDS[tickerRegionIndex];
        fetch(`/api/weather?region=${rid}`)
            .then(r => r.json())
            .then(j => { if (!j.error) setTickerWeather(j); })
            .catch(() => { });
    }, [tickerRegionIndex]);

    if (!mounted) return null;

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
        <div className={styles.tickerBar} style={style}>
            <div className={styles.tickerInfo}>
                <div className={styles.tickerClock}>
                    {formatTickerTime(liveTime)}
                </div>
                {tickerWeather && (
                    <div className={styles.tickerWeather}>
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
                                <span key={i} className={styles.tickerNewsItem}>
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
    );
}
