'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './Network.module.css';
import { motion, AnimatePresence } from 'framer-motion';

const locations = [
    {
        name: '서울 본사 (Headquarters)',
        lat: 37.4877,
        lng: 127.0195,
        addr: '서울특별시 서초구 효령로 424 대명빌딩 2F',
        role: '본사 / 경영지원'
    },
    {
        name: '아산지점 (CY)',
        lat: 36.9243,
        lng: 127.0570,
        addr: '충남 아산시 둔포면 아산밸리중앙로 79-6 501호',
        role: '메인 물류 허브 (5,000평)'
    },
    {
        name: '중부지점 (ICD)',
        lat: 36.5450,
        lng: 127.3505,
        addr: '세종시 연동면 연청로 745-86 중부ICD 2층',
        role: '중부권 ICD 거점'
    },
    {
        name: '서산/당진지점',
        lat: 36.9762,
        lng: 126.6867,
        addr: '충남 당진시 송산면 가곡로 21, 2층',
        role: '수출입 물류 거점'
    },
    {
        name: '영천/금호/임고지점',
        lat: 35.9168,
        lng: 128.8834,
        addr: '경북 영천시 금호읍 금창로 208-8',
        role: '제조 및 생산 도급 거점'
    }
];

export default function Network() {
    const mapRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        let map = null;
        const initMap = () => {
            if (window.naver && window.naver.maps && mapRef.current) {
                try {
                    const mapOptions = {
                        center: new window.naver.maps.LatLng(36.5, 127.8),
                        zoom: 7,
                        zoomControl: true,
                        zoomControlOptions: { position: window.naver.maps.Position.RIGHT_CENTER },
                        scrollWheel: false,
                        mapDataControl: false,
                        logoControl: true,
                        logoControlOptions: { position: window.naver.maps.Position.BOTTOM_LEFT }
                    };

                    map = new window.naver.maps.Map(mapRef.current, mapOptions);

                    locations.forEach((loc, i) => {
                        const isHQ = i === 0;
                        const marker = new window.naver.maps.Marker({
                            position: new window.naver.maps.LatLng(loc.lat, loc.lng),
                            map: map,
                            title: loc.name,
                            icon: {
                                content: `
                  <div style="display:flex; flex-direction:column; align-items:center;">
                    <div style="background:${isHQ ? '#0056b3' : '#3498db'}; color:white; padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; box-shadow:0 4px 10px rgba(0,0,0,0.1); border:2px solid white; white-space:nowrap;">${loc.name}</div>
                    <div style="width:10px; height:10px; background:${isHQ ? '#0056b3' : '#3498db'}; border:2px solid white; border-radius:50%; margin-top:-2px;"></div>
                  </div>
                `,
                                anchor: new window.naver.maps.Point(50, 25)
                            }
                        });

                        window.naver.maps.Event.addListener(marker, "click", () => {
                            setActiveIndex(i);
                            map.panTo(marker.getPosition());
                            map.setZoom(10, true);
                        });
                    });
                    setMapLoaded(true);
                } catch (e) {
                    console.error("Map Init Failed", e);
                }
            }
        };

        const timer = setInterval(() => {
            if (window.naver && window.naver.maps) {
                initMap();
                clearInterval(timer);
            }
        }, 200);
        return () => clearInterval(timer);
    }, []);

    const handleCardClick = (index) => {
        setActiveIndex(index);
        if (window.naver && window.naver.maps && mapRef.current) {
            // 실제 지도 인스턴스에 접근하여 이동 (데모를 위해 간단히 구현)
        }
    };

    return (
        <section id="network" className={styles.networkSection}>
            <div className="container">
                <div className={styles.sectionHeader}>
                    <span className={styles.subtext}>Global Infrastructure</span>
                    <h2 className={styles.mainTitle}>거점 현황 및 네트워크</h2>
                    <div className={styles.titleLine} />
                </div>

                <div className={styles.mainLayout}>
                    {/* Left: Info Cards */}
                    <div className={styles.listSide}>
                        <div className={styles.hqCard}>
                            <div className={styles.hqLabel}>Main Headquarters</div>
                            <h3>서울 본사</h3>
                            <p>{locations[0].addr}</p>
                            <div className={styles.contactInfo}>Tel. 02-1234-5678</div>
                        </div>

                        <div className={styles.scrollArea}>
                            {locations.slice(1).map((loc, i) => (
                                <motion.div
                                    key={i}
                                    className={`${styles.locCard} ${activeIndex === i + 1 ? styles.active : ''}`}
                                    onClick={() => handleCardClick(i + 1)}
                                    whileHover={{ scale: 1.01 }}
                                >
                                    <div className={styles.cardHeader}>
                                        <span className={styles.dot} />
                                        <h4>{loc.name}</h4>
                                    </div>
                                    <p className={styles.cardRole}>{loc.role}</p>
                                    <p className={styles.cardAddr}>{loc.addr}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Map Area */}
                    <div className={styles.mapSide}>
                        <div className={styles.mapContainer}>
                            <div ref={mapRef} className={styles.mapElement} />
                            <AnimatePresence>
                                {!mapLoaded && (
                                    <motion.div
                                        initial={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className={styles.mapOverlay}
                                    >
                                        <div className={styles.loader} />
                                        <p>인증 환경을 확인하고 지도를 불러옵니다.</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className={styles.mapBadge}>
                                <span className={styles.pulse} />
                                Real-time Network Monitoring
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
