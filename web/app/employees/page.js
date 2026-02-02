'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './employees.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserRole } from '@/hooks/useUserRole';

const Arrow = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;

const WEATHER_LABELS = { 0: '맑음', 1: '대체로 맑음', 2: '약간 흐림', 3: '흐림', 45: '안개', 48: '서리 안개', 51: '이슬비', 61: '비', 63: '비(강함)', 71: '눈', 80: '소나기', 95: '뇌우' };

/** 다른 지역 로테이션용 ID 목록 (현위치 제외 후 3개씩 5초마다 전환) */
const OTHER_REGION_IDS = ['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'gwangju', 'ulsan', 'suwon', 'changwon', 'sejong', 'asan'];
const ROTATE_INTERVAL_MS = 5000;

function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function weatherCodeToLabel(code) {
    if (code == null) return '—';
    return WEATHER_LABELS[code] ?? '—';
}

function getWeatherImagePath(code) {
    if (code == null) return '/images/weather/sunny_3d.png';
    if (code <= 1) return '/images/weather/sunny_3d.png';
    if (code <= 3) return '/images/weather/cloudy_3d.png';
    if (code === 45 || code === 48) return '/images/weather/cloudy_3d.png'; // Use cloudy icon for fog for consistency
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '/images/weather/rain_3d.png';
    if (code >= 71 && code <= 77) return '/images/weather/snow_3d.png';
    if (code >= 95) return '/images/weather/thunder_3d.png';
    return '/images/weather/cloudy_3d.png';
}

/** 날씨 API time (ISO "2026-01-30T14:00") → "2026년 1월 30일 14:00" */
function formatWeatherDateTime(isoTime) {
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

/** 뉴스 pubDate (RSS) → 한국 날짜·시간 "2026년 1월 30일 14:00" */
function formatNewsDateKorea(pubDate) {
    if (!pubDate || typeof pubDate !== 'string') return '';
    try {
        const d = new Date(pubDate.trim());
        if (Number.isNaN(d.getTime())) return pubDate;
        const y = d.getFullYear();
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const h = d.getHours();
        const m = d.getMinutes();
        return `${y}년 ${month}월 ${date}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } catch {
        return pubDate;
    }
}

export default function EmployeesPortal() {
    const { role, loading: authLoading, user } = useUserRole();
    const [weatherData, setWeatherData] = useState(null);
    const [newsItems, setNewsItems] = useState([]);

    useEffect(() => {
        // 방문객인 경우 페이지 진입 시점에 한 번 더 이벤트를 발생시켜 확실히 모달이 뜨게 할 수 있음
        if (!authLoading && user && role === 'visitor') {
            window.dispatchEvent(new Event('openApprovalModal'));
        }
    }, [authLoading, user, role]);

    const handleProtectedClick = (e) => {
        if (role === 'visitor') {
            e.preventDefault();
            window.dispatchEvent(new Event('openApprovalModal'));
        }
    };

    const doFetchWeather = useCallback((regionId) => {
        fetch(`/api/weather?region=${regionId}`)
            .then((res) => res.json())
            .then((json) => { if (!json.error) setWeatherData(json); })
            .catch(() => setWeatherData(null));
    }, []);

    useEffect(() => {
        const mobile = isMobileDevice();
        if (mobile && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetch(`/api/weather?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
                        .then((res) => res.json())
                        .then((json) => { if (!json.error) setWeatherData(json); })
                        .catch(() => setWeatherData(null));
                },
                () => fetch('/api/weather/region-by-ip').then((r) => r.json()).then((j) => doFetchWeather(j.region || 'asan')),
                { timeout: 8000, maximumAge: 300000 }
            );
        } else {
            fetch('/api/weather/region-by-ip')
                .then((r) => r.json())
                .then((j) => doFetchWeather(j.region || 'asan'));
        }
    }, [doFetchWeather]);

    const [otherWeatherList, setOtherWeatherList] = useState([]);
    const [otherRegionIndex, setOtherRegionIndex] = useState(0);
    const currentRegionId = weatherData?.region?.id;
    const otherIdsFiltered = currentRegionId
        ? OTHER_REGION_IDS.filter((id) => id !== currentRegionId)
        : OTHER_REGION_IDS;
    const nOther = otherIdsFiltered.length;

    useEffect(() => {
        if (nOther < 1) return;
        const i = otherRegionIndex % nOther;
        const ids = [otherIdsFiltered[i], otherIdsFiltered[(i + 1) % nOther], otherIdsFiltered[(i + 2) % nOther]];
        Promise.all(ids.map((id) => fetch(`/api/weather?region=${id}`).then((r) => r.json())))
            .then((results) => setOtherWeatherList(results.filter((j) => !j.error)))
            .catch(() => setOtherWeatherList([]));
    }, [otherRegionIndex, nOther, currentRegionId]);

    useEffect(() => {
        const t = setInterval(() => setOtherRegionIndex((prev) => prev + 1), ROTATE_INTERVAL_MS);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        fetch('/api/news')
            .then((res) => res.json())
            .then((json) => { if (!json.error && json.items?.length) setNewsItems(json.items); })
            .catch(() => setNewsItems([]));
    }, []);

    const currentWeather = weatherData?.hourly?.[0];
    const featuredNews = newsItems[0];
    const latestNews = newsItems.slice(1, 4);

    return (
        <div className={styles.layoutWrapper}>
            <div className={styles.page}>
                {/* 주요서비스: 축소·재구성 */}
                <section className={styles.portalSection}>
                    <header className={styles.portalHeaderCompact}>
                        <h1 className={styles.portalTitleCompact}>주요 서비스</h1>
                    </header>
                    <div className={styles.gridContainerCompact}>
                        <Link href="/employees/archive" className={styles.cardWrapCompact} onClick={handleProtectedClick}>
                            <motion.div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgNas}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                                <h3 className={styles.cardTitleCompact}>자료실 (NAS)</h3>
                                <span className={styles.cardCtaCompact}>바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>
                        <Link href="/employees/container-history" className={styles.cardWrapCompact} onClick={handleProtectedClick}>
                            <motion.div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgContainer}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.03 }}>
                                <h3 className={styles.cardTitleCompact}>컨테이너 이력조회</h3>
                                <span className={styles.cardCtaCompact}>바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>
                        <Link href="/employees/safe-freight" className={styles.cardWrapCompact} onClick={handleProtectedClick}>
                            <motion.div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgSafeFreight}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.06 }}>
                                <h3 className={styles.cardTitleCompact}>안전운임 조회</h3>
                                <span className={styles.cardCtaCompact}>바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>
                        <Link href="/employees/board/free" className={styles.cardWrapCompact} onClick={handleProtectedClick}>
                            <motion.div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgBoard}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.09 }}>
                                <h3 className={styles.cardTitleCompact}>자유게시판</h3>
                                <span className={styles.cardCtaCompact}>바로가기 <Arrow /></span>
                            </motion.div>
                        </Link>
                        <motion.div className={styles.cardWrapCompact} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.12 }}>
                            <div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgReports}`}>
                                <h3 className={styles.cardTitleCompact}>업무보고</h3>
                                <div className={styles.cardLinksCompact}>
                                    <Link href="/employees/reports" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>통합 <Arrow /></Link>
                                    <Link href="/employees/reports/my" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>내 보고 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>
                        <motion.div className={styles.cardWrapCompact} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
                            <div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgDocs}`}>
                                <h3 className={styles.cardTitleCompact}>자료실</h3>
                                <div className={styles.cardLinksCompact}>
                                    <Link href="/employees/work-docs" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>업무자료 <Arrow /></Link>
                                    <Link href="/employees/form-templates" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>서식 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>
                        <motion.div className={styles.cardWrapCompact} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.18 }}>
                            <div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgContacts}`}>
                                <h3 className={styles.cardTitleCompact}>연락처</h3>
                                <div className={styles.cardLinksCompact}>
                                    <Link href="/employees/internal-contacts" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>사내 <Arrow /></Link>
                                    <Link href="/employees/external-contacts" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>외부 <Arrow /></Link>
                                    <Link href="/employees/work-sites" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>작업지 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>
                        <motion.div className={styles.cardWrapCompact} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.21 }}>
                            <div className={`${styles.cardCompact} ${styles.cardWithBg} ${styles.cardBgBranches}`}>
                                <h3 className={styles.cardTitleCompact}>지점서비스</h3>
                                <div className={styles.cardLinksCompact}>
                                    <Link href="/employees/branches/headquarters" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>서울본사 <Arrow /></Link>
                                    <Link href="/employees/branches/asan" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>아산 <Arrow /></Link>
                                    <Link href="/employees/branches/jungbu" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>중부 <Arrow /></Link>
                                    <Link href="/employees/branches/dangjin" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>당진 <Arrow /></Link>
                                    <Link href="/employees/branches/yesan" className={styles.cardLinkItemCompact} onClick={handleProtectedClick}>예산 <Arrow /></Link>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* 날씨 · 뉴스: 날씨는 한 묶음(큰 현위치 + 아래 다른 지역 리스트), 뉴스는 한 묶음 */}
                <section className={styles.widgetSection}>
                    <header className={styles.widgetSectionHeader}>
                        <h2 className={styles.widgetSectionTitle}>날씨 · 뉴스</h2>
                        <span className={styles.widgetSectionNote}>현위치 기준</span>
                    </header>
                    <div className={styles.widgetRow}>
                        {/* 날씨 블록: 큰 고정 현위치 + 아래 다른 지역 3곳 리스트 (한 묶음) */}
                        <div className={styles.weatherBlock}>
                            <div className={styles.weatherBlockHeader}>
                                <span className={styles.widgetLabel}>날씨</span>
                                <Link href="/employees/weather" className={styles.newsMoreLink}>상세 보기 <Arrow /></Link>
                            </div>
                            <Link href="/employees/weather" className={styles.weatherFeatured}>
                                <div className={styles.weatherFeaturedInner}>
                                    {weatherData?.hourly?.[0] && (
                                        <img src={getWeatherImagePath(weatherData.hourly[0].code)} alt="" className={styles.widgetWeatherImgCurrent} aria-hidden />
                                    )}
                                    <span className={styles.widgetLabel}>현위치</span>
                                    {weatherData?.region ? (
                                        <>
                                            <strong className={styles.widgetPrimaryCurrent}>{weatherData.region.name}</strong>
                                            <span className={styles.widgetSecondaryCurrent}>
                                                {weatherCodeToLabel(currentWeather?.code)} {currentWeather?.temp != null ? `${currentWeather.temp}°C` : ''}
                                            </span>
                                            {weatherData?.dailySummary && (
                                                <p className={styles.weatherForecastDesc}>{weatherData.dailySummary}</p>
                                            )}
                                            {weatherData?.hourly?.[0]?.time && (
                                                <span className={styles.widgetWeatherTime}>{formatWeatherDateTime(weatherData.hourly[0].time)}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className={styles.widgetSecondaryCurrent}>불러오는 중...</span>
                                    )}
                                </div>
                            </Link>
                            <ul className={styles.weatherList}>
                                {otherWeatherList.slice(0, 3).map((data, idx) => (
                                    <li key={data?.region?.id ?? idx}>
                                        <Link href="/employees/weather" className={styles.weatherListItem}>
                                            {data?.hourly?.[0] && (
                                                <img src={getWeatherImagePath(data.hourly[0].code)} alt="" className={styles.weatherListIcon} aria-hidden />
                                            )}
                                            <span className={styles.weatherListName}>{data?.region?.name ?? '—'}</span>
                                            <span className={styles.weatherListMeta}>
                                                {data?.hourly?.[0] != null
                                                    ? `${weatherCodeToLabel(data.hourly[0].code)} ${data.hourly[0].temp != null ? `${data.hourly[0].temp}°C` : ''} · ${formatWeatherDateTime(data.hourly[0].time)}`
                                                    : '—'}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {/* 뉴스 블록 */}
                        <div className={styles.newsBlock}>
                            <div className={styles.newsBlockHeader}>
                                <span className={styles.widgetLabel}>뉴스</span>
                                <Link href="/employees/news" className={styles.newsMoreLink}>전체 보기 <Arrow /></Link>
                            </div>
                            {featuredNews && (
                                <Link
                                    href={`/employees/news/article?url=${encodeURIComponent(featuredNews.link)}`}
                                    className={styles.newsFeaturedCard}
                                >
                                    <div className={styles.newsFeaturedThumb}>
                                        {featuredNews.thumbnail ? (
                                            <img src={featuredNews.thumbnail} alt="" className={styles.newsFeaturedImg} decoding="async" />
                                        ) : (
                                            <div className={styles.widgetNewsThumbPlaceholder} aria-hidden />
                                        )}
                                    </div>
                                    <div className={styles.newsFeaturedBody}>
                                        <span className={styles.newsFeaturedBadge}>많이 본 뉴스</span>
                                        <strong className={styles.newsFeaturedTitle}>{featuredNews.title}</strong>
                                        {featuredNews.pubDate && <span className={styles.widgetMeta}>{formatNewsDateKorea(featuredNews.pubDate)}</span>}
                                        <span className={styles.widgetCta}>기사 보기 <Arrow /></span>
                                    </div>
                                </Link>
                            )}
                            <ul className={styles.newsList}>
                                {latestNews.map((item, i) => (
                                    <li key={i}>
                                        <Link href={item.link ? `/employees/news/article?url=${encodeURIComponent(item.link)}` : '#'} className={styles.newsListItem}>
                                            <span className={styles.newsListTitle}>{item.title}</span>
                                            {item.pubDate && <span className={styles.newsListMeta}>{formatNewsDateKorea(item.pubDate)}</span>}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            {newsItems.length === 0 && (
                                <p className={styles.widgetSecondary}>뉴스 불러오는 중...</p>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* 승인 모달은 SiteLayout에서 공통으로 처리함 */}
        </div>
    );
}
