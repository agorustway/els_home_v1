'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './tracking.module.css';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@/constants/vehicleTracking';

export default function VehicleTrackingPage() {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const infoWindowRef = useRef(null);
    const intervalRef = useRef(null);

    // 데이터 fetch
    const fetchTrips = useCallback(async () => {
        try {
            const res = await fetch('/api/vehicle-tracking/trips?mode=active');
            const data = await res.json();
            if (data.trips) {
                setTrips(data.trips);
            }
        } catch (e) {
            console.error('운행 데이터 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // 네이버맵 초기화
    useEffect(() => {
        if (window.naver?.maps) {
            initMap();
            return;
        }

        const script = document.createElement('script');
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`;
        script.async = true;
        script.onload = () => initMap();
        document.head.appendChild(script);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstanceRef.current) return;

        const map = new naver.maps.Map(mapRef.current, {
            center: new naver.maps.LatLng(36.5, 127.0), // 한국 중앙
            zoom: 7,
            zoomControl: true,
            zoomControlOptions: {
                position: naver.maps.Position.TOP_RIGHT,
            },
        });

        mapInstanceRef.current = map;
        setMapReady(true);
    };

    // 데이터 fetch + 30초 자동 새로고침
    useEffect(() => {
        fetchTrips();
        intervalRef.current = setInterval(fetchTrips, 30000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchTrips]);

    // 마커 업데이트
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // 기존 마커 제거
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        if (infoWindowRef.current) infoWindowRef.current.close();

        const tripsWithLocation = trips.filter(t => t.lastLocation);

        if (tripsWithLocation.length === 0) return;

        const bounds = new naver.maps.LatLngBounds();

        tripsWithLocation.forEach(trip => {
            const loc = trip.lastLocation;
            const pos = new naver.maps.LatLng(loc.lat, loc.lng);
            bounds.extend(pos);

            const isDriving = trip.status === 'driving';
            const markerColor = isDriving ? '#10b981' : '#f59e0b';

            const marker = new naver.maps.Marker({
                position: pos,
                map: map,
                icon: {
                    content: `
                        <div style="
                            width: 32px; height: 32px;
                            background: ${markerColor};
                            border: 3px solid #fff;
                            border-radius: 50%;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            display: flex; align-items: center; justify-content: center;
                            font-size: 14px; color: #fff;
                        ">🚛</div>
                    `,
                    anchor: new naver.maps.Point(16, 16),
                },
            });

            // 정보창
            const infoHtml = `
                <div style="padding:10px 12px; min-width:200px; font-size:13px; line-height:1.6;">
                    <strong style="font-size:14px;">${trip.driver_name}</strong>
                    <span style="
                        display:inline-block; margin-left:6px; padding:1px 7px;
                        border-radius:8px; font-size:11px; font-weight:600;
                        background:${isDriving ? '#dcfce7' : '#fef9c3'};
                        color:${isDriving ? '#16a34a' : '#ca8a04'};
                    ">${TRIP_STATUS_LABELS[trip.status]}</span>
                    <br/>
                    <span style="color:#64748b;">🚛 ${trip.vehicle_number}</span><br/>
                    ${trip.container_number ? `<span style="color:#64748b;">📦 ${trip.container_number} (${trip.container_type})</span><br/>` : ''}
                    ${trip.special_notes ? `<span style="color:#ef4444; font-size:12px;">⚠️ ${trip.special_notes}</span><br/>` : ''}
                    <span style="color:#94a3b8; font-size:11px;">
                        📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}
                        ${loc.speed ? ` · ${(loc.speed * 3.6).toFixed(0)}km/h` : ''}
                    </span>
                </div>
            `;

            const infoWindow = new naver.maps.InfoWindow({
                content: infoHtml,
                borderWidth: 1,
                borderColor: '#e5e7eb',
                backgroundColor: '#fff',
                anchorSize: new naver.maps.Size(10, 10),
            });

            naver.maps.Event.addListener(marker, 'click', () => {
                if (infoWindowRef.current) infoWindowRef.current.close();
                infoWindow.open(map, marker);
                infoWindowRef.current = infoWindow;
            });

            markersRef.current.push(marker);
        });

        // 모든 마커가 보이도록 bounds 조정
        if (tripsWithLocation.length > 1) {
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        } else if (tripsWithLocation.length === 1) {
            map.setCenter(new naver.maps.LatLng(tripsWithLocation[0].lastLocation.lat, tripsWithLocation[0].lastLocation.lng));
            map.setZoom(13);
        }
    }, [trips, mapReady]);

    const activeCount = trips.filter(t => t.status === 'driving').length;
    const pausedCount = trips.filter(t => t.status === 'paused').length;

    const formatTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className={styles.trackingPage}>
            {/* 타이틀 바 */}
            <div className={styles.titleBar}>
                <h2>
                    <span>🚛</span> 차량위치관제
                    {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}
                </h2>
                <div className={styles.titleBtns}>
                    <button className={styles.refreshBtn} onClick={() => { setLoading(true); fetchTrips(); }}>
                        🔄 새로고침
                    </button>
                    <Link href="/employees/vehicle-tracking/driver" className={styles.driverLinkBtn}>
                        📱 운전원 페이지 →
                    </Link>
                </div>
            </div>

            {/* 네이버 맵 */}
            <div className={styles.mapContainer}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                {!mapReady && (
                    <div className={styles.mapLoading}>지도를 불러오는 중...</div>
                )}
            </div>

            {/* 운행 목록 */}
            <div className={styles.tableSection}>
                <h3>📋 현재 운행 현황 ({trips.length}건)</h3>

                {trips.length === 0 && !loading ? (
                    <div className={styles.emptyState}>
                        <span>🚛</span>
                        현재 운행 중인 차량이 없습니다.
                    </div>
                ) : (
                    <table className={styles.tripTable}>
                        <thead>
                            <tr>
                                <th>상태</th>
                                <th>운전원</th>
                                <th>차량번호</th>
                                <th>컨테이너</th>
                                <th>타입</th>
                                <th>특이사항</th>
                                <th>시작시각</th>
                                <th>마지막 위치</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trips.map(trip => (
                                <tr key={trip.id}>
                                    <td>
                                        <span className={`${styles.statusBadge} ${trip.status === 'driving' ? styles.statusDriving : styles.statusPaused}`}>
                                            {trip.status === 'driving' ? '🟢' : '🟡'} {TRIP_STATUS_LABELS[trip.status]}
                                        </span>
                                    </td>
                                    <td><strong>{trip.driver_name}</strong></td>
                                    <td>{trip.vehicle_number}</td>
                                    <td>{trip.container_number || '-'}</td>
                                    <td>{trip.container_type}</td>
                                    <td style={{ color: trip.special_notes ? '#ef4444' : '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {trip.special_notes || '-'}
                                    </td>
                                    <td>{formatTime(trip.started_at)}</td>
                                    <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                        {trip.lastLocation
                                            ? `${trip.lastLocation.lat.toFixed(4)}, ${trip.lastLocation.lng.toFixed(4)}`
                                            : '위치 없음'
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
