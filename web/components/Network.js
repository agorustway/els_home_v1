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
    const [copyFeedback, setCopyFeedback] = useState("");

    useEffect(() => {
        // Debug Env Var
        console.log("Loading Naver Map with Client ID:", process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID);

        // 1. 방어 코드: 이미 로드되었으면 초기화만 시도
        if (window.naver && window.naver.maps) {
            initMap();
            return;
        }

        // 2. 인증 실패 콜백 정의
        window.navermap_authFailure = () => {
            const currentUrl = window.location.origin;
            setLoadingStatus(`네이버 지도 인증 실패 (설정 필요)`);
            setCopyFeedback(`등록 필요 URL: ${currentUrl}`); // 잠시 토스트 메시지로 띄움
            setIsError(true);
            console.error(`[Naver Map Auth Error] NCP Console에 다음 URL을 등록해야 합니다: ${currentUrl}`);
        };

        // 3. 스크립트 중복 방지
        const scriptId = 'naver-map-script-manual';
        const existingScript = document.getElementById(scriptId);
        if (existingScript) return;

        // 4. 수동 스크립트 주입 (Tutorial 기반 수정)
        // Domain: oapi.map.naver.com
        // Param: ncpKeyId (Reverted for compatibility)
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`;
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
            const isMobile = window.innerWidth <= 768;

            const mapOptions = {
                center: isMobile ? new naver.maps.LatLng(36.5, 127.8) : new naver.maps.LatLng(36.2, 126.9),
                zoom: isMobile ? 7 : 8,
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
            const isMobile = window.innerWidth <= 768;
            const loc = locations[i];
            const pos = new window.naver.maps.LatLng(loc.lat, loc.lng);
            mapInstance.current.morph(pos, 14, { duration: 500 });

            // On mobile, scroll up to the map so user can see the movement
            if (isMobile && mapRef.current) {
                mapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    const handleReset = () => {
        setActiveIdx(0);
        if (mapInstance.current && window.naver) {
            const isMobile = window.innerWidth <= 768;
            const pos = isMobile ? new window.naver.maps.LatLng(36.5, 127.8) : new window.naver.maps.LatLng(36.2, 126.9);
            const zoom = isMobile ? 7 : 8;
            mapInstance.current.morph(pos, zoom, { duration: 500 });
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

    const copyToClipboard = (text, type = 'address') => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(type === 'address' ? "주소가 복사되었습니다" : "전화번호가 복사되었습니다");
            setTimeout(() => setCopyFeedback(""), 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    const handleTelClick = (e, tel) => {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(tel, 'tel');
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
                                        {isError && (
                                            <div style={{fontSize: '0.8rem', marginTop: '10px', color: '#ff6b6b'}}>
                                                <p>NCP 콘솔 &gt; Web Dynamic Map &gt; Web 서비스 URL에</p>
                                                <p style={{fontWeight: 'bold', background: 'rgba(255,255,255,0.1)', padding: '2px 5px', borderRadius: '4px', margin: '5px 0'}}>
                                                    {typeof window !== 'undefined' ? window.location.origin : ''}
                                                </p>
                                                <p>을(를) 추가해주세요.</p>
                                            </div>
                                        )}
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
                            <p
                                className={styles.hqAddr}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(locations[0].addr);
                                }}
                                title="클릭하여 주소 복사"
                            >
                                {locations[0].addr}
                            </p>
                            {locations[0].tel && (
                                <p className={styles.cardTel}>
                                    <span style={{ color: 'var(--primary-blue)' }}>TEL.</span>
                                    <a
                                        href={`tel:${locations[0].tel}`}
                                        className={styles.telLink}
                                        onClick={(e) => handleTelClick(e, locations[0].tel)}
                                    >
                                        {locations[0].tel}
                                    </a>
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
                                        <p
                                            className={styles.cardAddr}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copyToClipboard(loc.addr);
                                            }}
                                            title="클릭하여 주소 복사"
                                        >
                                            {loc.addr}
                                        </p>
                                        {loc.tel && (
                                            <p className={styles.cardTel}>
                                                <span style={{ color: 'var(--primary-blue)' }}>TEL.</span>
                                                <a
                                                    href={`tel:${loc.tel}`}
                                                    className={styles.telLink}
                                                    onClick={(e) => handleTelClick(e, loc.tel)}
                                                >
                                                    {loc.tel}
                                                </a>
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

            {/* Copy Feedback Toast */}
            {copyFeedback && (
                <div className={styles.toast}>
                    {copyFeedback}
                </div>
            )}
        </section>
    );
}
