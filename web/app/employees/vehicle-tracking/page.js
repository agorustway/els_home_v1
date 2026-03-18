'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './tracking.module.css';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@/constants/vehicleTracking';

export default function VehicleTrackingPage() {
    // 탭 상태
    const [activeTab, setActiveTab] = useState('live'); // 'live' | 'records'

    // 실시간 관제 데이터
    const [liveTrips, setLiveTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const infoWindowRef = useRef(null);
    const intervalRef = useRef(null);

    // 운행 기록 (검색/필터)
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [recordsTotal, setRecordsTotal] = useState(0);

    // ─── 실시간 관제 ───
    const fetchLiveTrips = useCallback(async () => {
        try {
            const res = await fetch('/api/vehicle-tracking/trips?mode=active');
            const data = await res.json();
            if (data.trips) setLiveTrips(data.trips);
        } catch (e) {
            console.error('운행 데이터 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // 네이버맵 초기화
    useEffect(() => {
        if (window.naver?.maps) { initMap(); return; }
        const script = document.createElement('script');
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`;
        script.async = true;
        script.onload = () => initMap();
        document.head.appendChild(script);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstanceRef.current) return;
        const map = new naver.maps.Map(mapRef.current, {
            center: new naver.maps.LatLng(36.5, 127.0),
            zoom: 7,
            zoomControl: true,
            zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
        });
        mapInstanceRef.current = map;
        setMapReady(true);
    };

    // 실시간 fetch + 30초 자동 새로고침
    useEffect(() => {
        fetchLiveTrips();
        intervalRef.current = setInterval(fetchLiveTrips, 30000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchLiveTrips]);

    // 마커 업데이트
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;
        const map = mapInstanceRef.current;
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        if (infoWindowRef.current) infoWindowRef.current.close();

        const tripsWithLocation = liveTrips.filter(t => t.lastLocation);
        if (tripsWithLocation.length === 0) return;

        const bounds = new naver.maps.LatLngBounds();

        tripsWithLocation.forEach(trip => {
            const loc = trip.lastLocation;
            const pos = new naver.maps.LatLng(loc.lat, loc.lng);
            bounds.extend(pos);
            const isDriving = trip.status === 'driving';
            const markerColor = isDriving ? '#10b981' : '#f59e0b';

            // 차량번호 뒷 4자리 추출
            const vNum = trip.vehicle_number || '';
            const vLabel = vNum.length >= 4 ? vNum.slice(-4) : '';

            const marker = new naver.maps.Marker({
                position: pos, map,
                icon: {
                    content: `<div style="min-width:38px;height:24px;padding:0 6px;background:${markerColor};border:2px solid #fff;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:0.5px;">${vLabel || '───'}</div>`,
                    anchor: new naver.maps.Point(22, 12),
                },
            });

            const infoHtml = `
                <div style="padding:10px 12px;min-width:200px;font-size:13px;line-height:1.6;">
                    <strong style="font-size:14px;">${trip.driver_name}</strong>
                    <span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:8px;font-size:11px;font-weight:600;background:${isDriving ? '#dcfce7' : '#fef9c3'};color:${isDriving ? '#16a34a' : '#ca8a04'};">${TRIP_STATUS_LABELS[trip.status]}</span><br/>
                    <span style="color:#64748b;">🚛 ${trip.vehicle_number}</span><br/>
                    ${trip.container_number ? `<span style="color:#64748b;">📦 ${trip.container_number} (${trip.container_type})</span><br/>` : ''}
                    ${trip.special_notes ? `<span style="color:#ef4444;font-size:12px;">⚠️ ${trip.special_notes}</span><br/>` : ''}
                    <span style="color:#94a3b8;font-size:11px;">📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.speed ? ` · ${(loc.speed * 3.6).toFixed(0)}km/h` : ''}</span>
                </div>`;

            const infoWindow = new naver.maps.InfoWindow({
                content: infoHtml, borderWidth: 1, borderColor: '#e5e7eb',
                backgroundColor: '#fff', anchorSize: new naver.maps.Size(10, 10),
            });

            naver.maps.Event.addListener(marker, 'click', () => {
                if (infoWindowRef.current) infoWindowRef.current.close();
                infoWindow.open(map, marker);
                infoWindowRef.current = infoWindow;
            });

            markersRef.current.push(marker);
        });

        if (tripsWithLocation.length > 1) {
            map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        } else if (tripsWithLocation.length === 1) {
            map.setCenter(new naver.maps.LatLng(tripsWithLocation[0].lastLocation.lat, tripsWithLocation[0].lastLocation.lng));
            map.setZoom(13);
        }
    }, [liveTrips, mapReady]);

    // ─── 운행 기록 검색 ───
    const fetchRecords = useCallback(async () => {
        setRecordsLoading(true);
        try {
            const params = new URLSearchParams({ mode: 'all' });
            if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
            if (filterKeyword) params.set('keyword', filterKeyword);
            if (filterFrom) params.set('from', filterFrom);
            if (filterTo) params.set('to', filterTo);

            const res = await fetch(`/api/vehicle-tracking/trips?${params}`);
            const data = await res.json();
            if (data.trips) {
                setRecords(data.trips);
                setRecordsTotal(data.total || data.trips.length);
            }
        } catch (e) {
            console.error('기록 조회 실패:', e);
        } finally {
            setRecordsLoading(false);
        }
    }, [filterStatus, filterKeyword, filterFrom, filterTo]);

    // 탭 변경 시 기록 로드
    useEffect(() => {
        if (activeTab === 'records') fetchRecords();
    }, [activeTab]);

    const handleSearch = () => fetchRecords();

    const handleReset = () => {
        setFilterStatus('all');
        setFilterKeyword('');
        setFilterFrom('');
        setFilterTo('');
    };

    // 기록 삭제
    const handleDeleteRecord = async (id) => {
        if (!confirm('이 운행 기록을 삭제하시겠습니까?')) return;
        try {
            await fetch(`/api/vehicle-tracking/trips/${id}`, { method: 'DELETE' });
            setRecords(prev => prev.filter(t => t.id !== id));
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    };

    // 유틸
    const activeCount = liveTrips.filter(t => t.status === 'driving').length;

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const getStatusClass = (status) => {
        if (status === 'driving') return styles.statusDriving;
        if (status === 'paused') return styles.statusPaused;
        return styles.statusCompleted;
    };

    const getStatusIcon = (status) => {
        if (status === 'driving') return '🟢';
        if (status === 'paused') return '🟡';
        return '⚪';
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
                    <button className={styles.refreshBtn} onClick={() => { setLoading(true); fetchLiveTrips(); if (activeTab === 'records') fetchRecords(); }}>
                        🔄 새로고침
                    </button>
                    <Link href="/employees/vehicle-tracking/driver" className={styles.driverLinkBtn}>
                        📱 운전원 페이지 →
                    </Link>
                </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className={styles.tabNav}>
                <button
                    className={`${styles.tab} ${activeTab === 'live' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('live')}
                >
                    📡 실시간 관제
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'records' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('records')}
                >
                    📋 운행 기록 관리
                </button>
            </div>

            {/* ═══ 탭 1: 실시간 관제 ═══ */}
            {activeTab === 'live' && (
                <>
                    {/* 네이버 맵 */}
                    <div className={styles.mapContainer}>
                        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                        {!mapReady && <div className={styles.mapLoading}>지도를 불러오는 중...</div>}
                    </div>

                    {/* 실시간 운행 목록 */}
                    <div className={styles.tableSection}>
                        <h3>📋 현재 운행 현황 ({liveTrips.length}건)</h3>

                        {liveTrips.length === 0 && !loading ? (
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
                                        <th>차량ID</th>
                                        <th>컨테이너</th>
                                        <th>타입</th>
                                        <th>특이사항</th>
                                        <th>시작시각</th>
                                        <th>마지막 위치</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liveTrips.map(trip => (
                                        <tr key={trip.id}>
                                            <td>
                                                <span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>
                                                    {getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}
                                                </span>
                                            </td>
                                            <td><strong>{trip.driver_name}</strong></td>
                                            <td>{trip.vehicle_number}</td>
                                            <td style={{ fontSize: '0.78rem', color: '#64748b', letterSpacing: '0.5px' }}>{trip.vehicle_id || '-'}</td>
                                            <td>{trip.container_number || '-'}</td>
                                            <td>{trip.container_type}</td>
                                            <td style={{ color: trip.special_notes ? '#ef4444' : '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {trip.special_notes || '-'}
                                            </td>
                                            <td>{formatTime(trip.started_at)}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                                {trip.lastLocation
                                                    ? `${trip.lastLocation.lat.toFixed(4)}, ${trip.lastLocation.lng.toFixed(4)}`
                                                    : '위치 없음'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* ═══ 탭 2: 운행 기록 관리 ═══ */}
            {activeTab === 'records' && (
                <>
                    {/* 검색/필터 바 */}
                    <div className={styles.filterBar}>
                        <select
                            className={styles.filterSelect}
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="all">전체 상태</option>
                            <option value="driving">🟢 운행 중</option>
                            <option value="paused">🟡 일시중지</option>
                            <option value="completed">⚪ 운행 완료</option>
                        </select>

                        <input
                            className={styles.filterInput}
                            placeholder="이름 / 차량번호 / 컨테이너"
                            value={filterKeyword}
                            onChange={e => setFilterKeyword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />

                        <input
                            className={styles.filterDateInput}
                            type="date"
                            value={filterFrom}
                            onChange={e => setFilterFrom(e.target.value)}
                        />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>~</span>
                        <input
                            className={styles.filterDateInput}
                            type="date"
                            value={filterTo}
                            onChange={e => setFilterTo(e.target.value)}
                        />

                        <button className={styles.filterSearchBtn} onClick={handleSearch}>검색</button>
                        <button className={styles.filterResetBtn} onClick={() => { handleReset(); setTimeout(fetchRecords, 100); }}>초기화</button>
                    </div>

                    {/* 기록 테이블 */}
                    <div className={styles.tableSection}>
                        <h3>📋 운행 기록 ({recordsTotal}건)</h3>

                        {records.length === 0 && !recordsLoading ? (
                            <div className={styles.emptyState}>
                                <span>📋</span>
                                검색 조건에 맞는 운행 기록이 없습니다.
                            </div>
                        ) : (
                            <table className={styles.tripTable}>
                                <thead>
                                    <tr>
                                        <th>상태</th>
                                        <th>운전원</th>
                                        <th>전화번호</th>
                                        <th>차량번호</th>
                                        <th>차량ID</th>
                                        <th>컨테이너</th>
                                        <th>씰넘버</th>
                                        <th>타입</th>
                                        <th>특이사항</th>
                                        <th>시작</th>
                                        <th>종료</th>
                                        <th>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map(trip => (
                                        <tr key={trip.id}>
                                            <td>
                                                <span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>
                                                    {getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}
                                                </span>
                                            </td>
                                            <td><strong>{trip.driver_name}</strong></td>
                                            <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{trip.driver_phone || '-'}</td>
                                            <td>{trip.vehicle_number}</td>
                                            <td style={{ fontSize: '0.78rem', color: '#64748b', letterSpacing: '0.5px' }}>{trip.vehicle_id || '-'}</td>
                                            <td>{trip.container_number || '-'}</td>
                                            <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{trip.seal_number || '-'}</td>
                                            <td>{trip.container_type}</td>
                                            <td style={{ color: trip.special_notes ? '#ef4444' : '#94a3b8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {trip.special_notes || '-'}
                                            </td>
                                            <td style={{ fontSize: '0.78rem' }}>{formatDateTime(trip.started_at)}</td>
                                            <td style={{ fontSize: '0.78rem' }}>{formatDateTime(trip.completed_at)}</td>
                                            <td>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={() => handleDeleteRecord(trip.id)}
                                                    title="삭제"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
