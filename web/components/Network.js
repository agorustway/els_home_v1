'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './Network.module.css';

const locations = [
    {
        name: '서울 본사 (HQ)',
        lat: 37.4877,
        lng: 127.0195,
        addr: '서울특별시 서초구 효령로 424 대명빌딩 2F',
        role: '종합 물류 전략 및 컨트롤 타워'
    },
    {
        name: '아산지점 (CY)',
        lat: 36.9243,
        lng: 127.0570,
        addr: '충남 아산시 둔포면 아산밸리중앙로 79-6 501호',
        role: '메인 컨테이너 터미널 (5,000평 운영)'
    },
    {
        name: '중부지점 (ICD)',
        lat: 36.5450,
        lng: 127.3505,
        addr: '세종시 연동면 연청로 745-86 중부ICD',
        role: '중부권 내륙 컨테이너 기지 (1,000평)'
    },
    {
        name: '서산/당진지점',
        lat: 36.9762,
        lng: 126.6867,
        addr: '충남 당진시 송산면 가곡로 21, 2층',
        role: '수출입 철강 및 자동차 부품 전담'
    },
    {
        name: '울산지점',
        lat: 35.5384,
        lng: 129.3114,
        addr: '울산광역시 북구 효자로 123',
        role: '자동차 KD부품 포장 및 물류 거점'
    },
    {
        name: '영천/금호/임고지점',
        lat: 35.9168,
        lng: 128.8834,
        addr: '경북 영천시 금호읍 금창로 208-8',
        role: '핵심 부품 제조 및 도급 운영'
    }
];

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
                center: new naver.maps.LatLng(36.55, 127.8),
                zoom: 7,
                minZoom: 6,
                zoomControl: true,
                zoomControlOptions: {
                    position: naver.maps.Position.RIGHT_CENTER
                },
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
            mapInstance.current.morph(pos, 11, { duration: 500 });
        }
    };

    return (
        <section id="network" className={styles.section}>
            <div className="container">
                <div className={styles.header}>
                    <span className={styles.tag}>Logistics Network</span>
                    <h2 className={styles.title}>거점 및 네트워크 현황</h2>
                </div>

                <div className={styles.viewport}>
                    <div className={styles.mapSide}>
                        <div className={styles.mapInner}>
                            <div ref={mapRef} className={styles.mapCanvas} />

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
                                <span className={styles.badge}>Main HQ</span>
                                <h3>서울 본사</h3>
                            </div>
                            <p className={styles.hqAddr}>{locations[0].addr}</p>
                            <button
                                className={styles.centerBtn}
                                onClick={() => handleLocSelect(0)}
                            >본사 거점 확인</button>
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
