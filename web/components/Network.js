'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './Network.module.css';
import { locations } from '../constants/locations';


export default function Network() {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const [loadingStatus, setLoadingStatus] = useState("지도 데이터를 불러오는 중...");
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        // 1. 방어 코드: 이미 로드되었으면 초기화만 시도
        if (window.naver && window.naver.maps) {
            initMap();
            return;
        }

        // 2. 인증 실패 콜백 정의
        window.navermap_authFailure = () => {
            setLoadingStatus("네이버 지도 인증 실패 (Error 200)");
            setIsError(true);
        };

        // 3. 스크립트 중복 방지
        const scriptId = 'naver-map-script-manual';
        const existingScript = document.getElementById(scriptId);
        if (existingScript) return;

        // 4. 수동 스크립트 주입 (Tutorial 기반 수정)
        // Domain: oapi.map.naver.com
        // Param: ncpKeyId
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=hxoj79osnj';
        script.async = true;
        script.defer = true;

        script.onload = () => {
            setLoadingStatus("지도 라이브러리 로드 완료! 초기화 중...");
            setTimeout(() => initMap(), 100);
        };

        script.onerror = () => {
            setLoadingStatus("네이버 지도 서버 접속 실패");
            setIsError(true);
        };

        document.head.appendChild(script);

        return () => {
            // cleanup if needed
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstance.current) return;
        if (!window.naver || !window.naver.maps) {
            setTimeout(initMap, 200); // 재시도
            return;
        }

        try {
            const naver = window.naver;
            const mapOptions = {
                center: new naver.maps.LatLng(36.2, 126.9),
                zoom: 8,
                minZoom: 6,
                zoomControl: false, // Disable default zoom control
                scrollWheel: false, // Disable scroll zoom
                draggable: false, // Disable drag to pan
                pinchZoom: false, // Disable pinch zoom
                keyboardShortcuts: false,
                disableDoubleTapZoom: true,
                disableDoubleClickZoom: true,
                disableTwoFingerTapZoom: true,
                mapTypeControl: false,
                logoControlOptions: {
                    position: naver.maps.Position.BOTTOM_LEFT
                }
            };

            mapInstance.current = new naver.maps.Map(mapRef.current, mapOptions);

            locations.forEach((loc, i) => {
                const isHQ = i === 0;
                const marker = new naver.maps.Marker({
                    position: new naver.maps.LatLng(loc.lat, loc.lng),
                    map: mapInstance.current,
                    icon: {
                        content: `
              <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                <div style="background:${isHQ ? '#003366' : '#0078ff'}; color:white; padding:6px 14px; border-radius:30px; font-size:12px; font-weight:800; border:2px solid white; box-shadow:0 8px 20px rgba(0,0,0,0.2); white-space:nowrap;">
                  ${loc.name}
                </div>
                <div style="width:14px; height:14px; background:${isHQ ? '#003366' : '#0078ff'}; border:3px solid white; border-radius:50%; margin-top:-3px; box-shadow:0 4px 10px rgba(0,0,0,0.15);"></div>
              </div>
            `,
                        anchor: new naver.maps.Point(50, 40)
                    }
                });

                naver.maps.Event.addListener(marker, 'click', () => {
                    handleLocSelect(i);
                });
            });
            setLoadingStatus(null); // 로딩 완료
        } catch (e) {
            console.error("Map Init Error:", e);
            setLoadingStatus("지도 초기화 오류 발생");
            setIsError(true);
        }
    };

    const handleLocSelect = (i) => {
        setActiveIdx(i);
        if (mapInstance.current && window.naver) {
            const loc = locations[i];
            const pos = new window.naver.maps.LatLng(loc.lat, loc.lng);
            mapInstance.current.morph(pos, 14, { duration: 500 });
        }
    };

    const handleReset = () => {
        setActiveIdx(0); // Keep HQ as default or set to -1
        if (mapInstance.current && window.naver) {
            const pos = new window.naver.maps.LatLng(36.2, 126.9);
            mapInstance.current.morph(pos, 8, { duration: 500 });
        }
    };

    const handleZoom = (delta) => {
        if (mapInstance.current) {
            const currentZoom = mapInstance.current.getZoom();
            mapInstance.current.setZoom(currentZoom + delta, true);
        }
    };

    const handlePan = (dx, dy) => {
        if (mapInstance.current) {
            mapInstance.current.panBy(new window.naver.maps.Point(dx, dy));
        }
    };

    return (
        <section id="network" className={styles.section}>
            <div className="container">
                <div className={styles.header}>
                    <span className={styles.tag}>Logistics Network</span>
                    <h2 className={styles.title}>네트워크</h2>
                </div>

                <div className={styles.viewport}>
                    <div className={styles.mapSide}>
                        <div className={styles.mapInner}>
                            <div ref={mapRef} className={styles.mapCanvas} />

                            <div className={styles.mapControls}>
                                <div className={styles.panControls}>
                                    <button onClick={() => handlePan(0, -100)} className={styles.controlBtn} title="위로 이동">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                    </button>
                                    <div className={styles.midPan}>
                                        <button onClick={() => handlePan(-100, 0)} className={styles.controlBtn} title="왼쪽으로 이동">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                        </button>
                                        <button onClick={() => handlePan(100, 0)} className={styles.controlBtn} title="오른쪽으로 이동">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                        </button>
                                    </div>
                                    <button onClick={() => handlePan(0, 100)} className={styles.controlBtn} title="아래로 이동">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                </div>
                                <div className={styles.zoomControls}>
                                    <button onClick={() => handleZoom(1)} className={styles.controlBtn} title="확대">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                    </button>
                                    <button onClick={() => handleZoom(-1)} className={styles.controlBtn} title="축소">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
                                    </button>
                                </div>
                            </div>

                            {loadingStatus && (
                                <div className={styles.loadingOverlay}>
                                    <div className={`${styles.spinner} ${isError ? styles.error : ''}`} />
                                    <div className={styles.loadingStatus}>
                                        <p>{loadingStatus}</p>
                                        {isError && <span>NCP 콘솔의 Web 서비스 URL 설정을 확인해주세요 (localhost:3000/)</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.floatingPanel}>
                        <div className={styles.hqSection}>
                            <div className={styles.hqHeader}>
                                <span className={styles.badge}>HQ</span>
                                <h3>서울 본사</h3>
                            </div>
                            <p className={styles.hqAddr}>{locations[0].addr}</p>
                            {locations[0].tel && (
                                <p className={styles.cardTel}>
                                    <span style={{ color: 'var(--primary-blue)' }}>TEL.</span> {locations[0].tel}
                                </p>
                            )}
                            <div className={styles.btnGroup}>
                                <button
                                    className={styles.centerBtn}
                                    onClick={() => handleLocSelect(0)}
                                >본사</button>
                                <button
                                    className={styles.resetBtn}
                                    onClick={handleReset}
                                >전지점</button>
                            </div>
                        </div>

                        <div className={styles.branchArea}>
                            <p className={styles.areaTitle}>Nationwide Branches</p>
                            <div className={styles.scrollList}>
                                {locations.slice(1).map((loc, i) => (
                                    <div
                                        key={i}
                                        className={`${styles.locCard} ${activeIdx === i + 1 ? styles.active : ''}`}
                                        onClick={() => handleLocSelect(i + 1)}
                                    >
                                        <div className={styles.cardHeader}>
                                            <span className={styles.dot} />
                                            <h4>{loc.name}</h4>
                                        </div>
                                        <p className={styles.cardRole}>{loc.role}</p>
                                        <p className={styles.cardAddr}>{loc.addr}</p>
                                        {loc.tel && (
                                            <p className={styles.cardTel}>
                                                <span style={{ color: 'var(--primary-blue)' }}>TEL.</span> {loc.tel}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={styles.panelFooter}>
                            <div className={styles.pulse} />
                            <span>실시간 물류 인프라 가동 중</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
