'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './tracking.module.css';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@/constants/vehicleTracking';

export default function VehicleTrackingPage() {
    // 탭 상태
    const [activeTab, setActiveTab] = useState('live'); // 'live' | 'records'
    const [isFullscreen, setIsFullscreen] = useState(false);

    // 상세 조회 상태
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [selectedTripLocations, setSelectedTripLocations] = useState([]);
    const [tripLogs, setTripLogs] = useState([]);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // 실시간 관제 데이터
    const [liveTrips, setLiveTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const polylineRef = useRef(null);
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

    // ─── 0. 지도 리사이즈 및 탭 전환 대응 ───
    useEffect(() => {
        if (mapInstanceRef.current && mapReady) {
            const timer = setTimeout(() => {
                naver.maps.Event.trigger(mapInstanceRef.current, 'resize');
                if (activeTab === 'live' && liveTrips.length > 0) {
                    const bounds = new naver.maps.LatLngBounds();
                    liveTrips.forEach(t => { if(t.lastLocation) bounds.extend(new naver.maps.LatLng(t.lastLocation.lat, t.lastLocation.lng)); });
                    if (!bounds.isEmpty()) mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
                }
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [isFullscreen, mapReady, activeTab, liveTrips.length]);

    // ─── 1. 전역 관제 ───
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

    // ─── 2. 상세 경로 조회 ───
    const drawTripPath = (locations) => {
        if (!mapInstanceRef.current || !locations.length) return;
        const map = mapInstanceRef.current;
        if (polylineRef.current) polylineRef.current.setMap(null);
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];

        const path = locations.map(l => new naver.maps.LatLng(l.lat, l.lng));
        const polyline = new naver.maps.Polyline({
            map: map, path: path, strokeColor: '#2563eb', strokeWeight: 5,
            strokeOpacity: 0.8, strokeStyle: 'solid', strokeLineCap: 'round', strokeLineJoin: 'round'
        });
        polylineRef.current = polyline;

        const bounds = new naver.maps.LatLngBounds();
        path.forEach(p => bounds.extend(p));

        const start = locations[0];
        const end = locations[locations.length - 1];
        const startMarker = new naver.maps.Marker({
            position: new naver.maps.LatLng(start.lat, start.lng), map,
            icon: { content: '<div style="width:24px;height:24px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;">S</div>', anchor: new naver.maps.Point(12, 12) }
        });
        markersRef.current.push(startMarker);

        if (end) {
            const endMarker = new naver.maps.Marker({
                position: new naver.maps.LatLng(end.lat, end.lng), map,
                icon: { content: '<div style="width:24px;height:24px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;">E</div>', anchor: new naver.maps.Point(12, 12) }
            });
            markersRef.current.push(endMarker);
        }
        map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    };

    const handleSelectTrip = async (trip) => {
        setSelectedTrip(trip);
        setIsDetailLoading(true);
        setSelectedTripLocations([]);
        setTripLogs([]); // 초기화
        try {
            // 경로 데이터와 수정 로그를 동시에 가져옴
            const [locRes, logRes] = await Promise.all([
                fetch(`/api/vehicle-tracking/trips/${trip.id}/locations`),
                fetch(`/api/vehicle-tracking/trips/${trip.id}/logs`)
            ]);
            
            const locData = await locRes.json();
            if (locData.locations) {
                setSelectedTripLocations(locData.locations);
                drawTripPath(locData.locations);
            }
            
            const logData = await logRes.json();
            if (logData.logs) {
                setTripLogs(logData.logs);
            }
        } catch (e) {
            console.error('상세 정보 조회 실패:', e);
        } finally {
            setIsDetailLoading(false);
        }
    };

    // 네이버맵 초기화
    useEffect(() => {
        const handleInit = () => {
            if (!mapRef.current || mapInstanceRef.current) return;
            const map = new naver.maps.Map(mapRef.current, {
                center: new naver.maps.LatLng(36.5, 127.0),
                zoom: 7, zoomControl: true,
                zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
            });
            mapInstanceRef.current = map;
            setMapReady(true);
        };

        if (window.naver?.maps) {
            handleInit();
        } else {
            const script = document.createElement('script');
            script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`;
            script.async = true;
            script.onload = () => handleInit();
            document.head.appendChild(script);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    // 실시간 fetch
    useEffect(() => {
        if (selectedTrip) return;
        fetchLiveTrips();
        intervalRef.current = setInterval(fetchLiveTrips, 30000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchLiveTrips, selectedTrip]);

    // 실시간 마커 업데이트
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || selectedTrip || activeTab !== 'live') return;
        const map = mapInstanceRef.current;
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
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
            const vNum = trip.vehicle_number || '';
            const vLabel = vNum.length >= 4 ? vNum.slice(-4) : '';

            const marker = new naver.maps.Marker({
                position: pos, map,
                icon: {
                    content: `<div style="min-width:38px;height:24px;padding:0 6px;background:${markerColor};border:2px solid #fff;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:0.5px;">${vLabel || '───'}</div>`,
                    anchor: new naver.maps.Point(22, 12),
                },
            });

            const infoHtml = `<div style="padding:10px 12px;min-width:200px;font-size:13px;line-height:1.6;"><strong>${trip.driver_name}</strong><br/><span style="color:#64748b;">🚛 ${trip.vehicle_number}</span><br/>📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</div>`;
            const infoWindow = new naver.maps.InfoWindow({ content: infoHtml, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' });

            naver.maps.Event.addListener(marker, 'click', () => {
                if (infoWindowRef.current) infoWindowRef.current.close();
                infoWindow.open(map, marker);
                infoWindowRef.current = infoWindow;
                // 클릭 시 배율 줌 및 센터링
                map.setZoom(16);
                map.setCenter(pos);
            });
            markersRef.current.push(marker);
        });
    }, [liveTrips, mapReady, selectedTrip, activeTab]);

    // 운행 기록 검색
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
        } catch (e) { console.error('기록 조회 실패:', e); }
        finally { setRecordsLoading(false); }
    }, [filterStatus, filterKeyword, filterFrom, filterTo]);

    useEffect(() => { if (activeTab === 'records') fetchRecords(); }, [activeTab, fetchRecords]);

    const handleSearch = () => fetchRecords();
    const handleReset = () => { setFilterStatus('all'); setFilterKeyword(''); setFilterFrom(''); setFilterTo(''); };

    const handleDeleteRecord = async (id) => {
        if (!confirm('이 운행 기록을 삭제하시겠습니까?')) return;
        try {
            await fetch(`/api/vehicle-tracking/trips/${id}`, { method: 'DELETE' });
            setRecords(prev => prev.filter(t => t.id !== id));
        } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    const handleDownloadZip = async (trip) => {
        if (!trip) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${trip.id}/zip`);
            if (!res.ok) throw new Error('다운로드 실패');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const disposition = res.headers.get('Content-Disposition');
            let filename = `trip-${trip.id}.zip`;
            if (disposition && disposition.indexOf('filename=') !== -1) { filename = decodeURIComponent(disposition.split('filename=')[1].replace(/"/g, '')); }
            a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { alert('오류: ' + e.message); }
    };

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
            <div className={styles.titleBar}>
                <h2><span>🚛</span> 차량위치관제 {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}</h2>
                <div className={styles.titleBtns}>
                    <button className={styles.refreshBtn} onClick={() => { setLoading(true); fetchLiveTrips(); if (activeTab === 'records') fetchRecords(); }}>🔄 새로고침</button>
                    <button className={styles.driverLinkBtn} onClick={() => window.open('/driver-app', 'DriverApp', 'width=420,height=800')}>📱 차량용 웹 페이지 (팝업)</button>
                </div>
            </div>
            
            <div className={styles.missionDashboard}>
                <div className={styles.statCard}><div className={styles.statLabel}>📡 실시간 운행차량</div><div className={styles.statValue} style={{color: '#10b981'}}>{activeCount} <span className={styles.statUnit}>대</span></div></div>
                <div className={styles.statCard}><div className={styles.statLabel}>⏸️ 일시정지</div><div className={styles.statValue} style={{color: '#f59e0b'}}>{liveTrips.filter(t => t.status === 'paused').length} <span className={styles.statUnit}>대</span></div></div>
                <div className={styles.statCard}><div className={styles.statLabel}>🗓️ {new Date().getMonth() + 1}월 전체 운행</div><div className={styles.statValue}>{recordsTotal} <span className={styles.statUnit}>건</span></div></div>
            </div>

            <div className={styles.tabNav}>
                <button className={`${styles.tab} ${activeTab === 'live' ? styles.tabActive : ''}`} onClick={() => setActiveTab('live')}>📡 실시간 관제</button>
                <button className={`${styles.tab} ${activeTab === 'records' ? styles.tabActive : ''}`} onClick={() => setActiveTab('records')}>📋 운행 기록 관리</button>
            </div>

            <div style={{ display: activeTab === 'live' ? 'block' : 'none' }}>
                <div className={`${styles.mapContainer} ${isFullscreen ? styles.mapFullscreen : ''}`}>
                    <button className={styles.fullscreenBtn} onClick={() => setIsFullscreen(!isFullscreen)}>{isFullscreen ? '↩️ 전체화면 해제' : '⛶ 지도 전체화면'}</button>
                    <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                    {!mapReady && <div className={styles.mapLoading}>지도를 불러오는 중...</div>}
                </div>
                <div className={styles.tableSection}>
                    <h3>📋 현재 운행 현황 ({liveTrips.length}건)</h3>
                    <table className={styles.tripTable}>
                        <thead><tr><th>상태</th><th>기사명</th><th>차량번호</th><th>컨테이너</th><th>타입</th><th>관리</th></tr></thead>
                        <tbody>
                            {liveTrips.map(trip => (
                                <tr key={trip.id}>
                                    <td><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td><strong>{trip.driver_name}</strong></td>
                                    <td>{trip.vehicle_number}</td>
                                    <td>{trip.container_number || '-'}</td>
                                    <td>{trip.container_type}</td>
                                    <td><button className={styles.filterSearchBtn} onClick={() => handleSelectTrip(trip)}>상세보기</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ display: activeTab === 'records' ? 'block' : 'none' }}>
                <div className={styles.filterBar}>
                    <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="all">전체 상태</option><option value="driving">🟢 운행 중</option><option value="paused">🟡 일시중지</option><option value="completed">⚪ 운행 완료</option>
                    </select>
                    <input className={styles.filterInput} placeholder="이름/차량/컨테이너" value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} />
                    <button className={styles.filterSearchBtn} onClick={handleSearch}>검색</button>
                    <button className={styles.filterResetBtn} onClick={handleReset}>초기화</button>
                </div>
                <div className={styles.tableSection}>
                    <h3>📋 운행 기록 ({recordsTotal}건)</h3>
                    <table className={styles.tripTable}>
                        <thead><tr><th>상태</th><th>기사명</th><th>차량번호</th><th>컨테이너</th><th>시작</th><th>종료</th><th>관리</th></tr></thead>
                        <tbody>
                            {records.map(trip => (
                                <tr key={trip.id}>
                                    <td><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td><strong>{trip.driver_name}</strong></td>
                                    <td>{trip.vehicle_number}</td>
                                    <td>{trip.container_number || '-'}</td>
                                    <td>{formatDateTime(trip.started_at)}</td>
                                    <td>{formatDateTime(trip.completed_at)}</td>
                                    <td>
                                        <button className={styles.filterSearchBtn} onClick={() => handleSelectTrip(trip)}>보기</button>
                                        <button className={styles.deleteBtn} onClick={() => handleDeleteRecord(trip.id)}>🗑️</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedTrip && (
                <div className={styles.detailOverlay}>
                    <div className={styles.detailHeader}><h3>운행 상세 정보</h3><button className={styles.closeBtn} onClick={() => setSelectedTrip(null)}>✕</button></div>
                    <div className={styles.detailContent}>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>기본 정보</div>
                            <div className={styles.detailInfoGrid}>
                                <div><div className={styles.infoLabel}>드라이버</div><div className={styles.infoValue}>{selectedTrip.driver_name}</div></div>
                                <div><div className={styles.infoLabel}>차량번호</div><div className={styles.infoValue}>{selectedTrip.vehicle_number}</div></div>
                                <div><div className={styles.infoLabel}>컨테이너</div><div className={styles.infoValue}>{selectedTrip.container_number || '-'}</div></div>
                                <div><div className={styles.infoLabel}>씰 넘버</div><div className={styles.infoValue}>{selectedTrip.seal_number || '-'}</div></div>
                            </div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>증빙 사진 ({selectedTrip.photos?.length || 0}) {selectedTrip.photos?.length > 0 && <button className={styles.zipDownloadBtn} style={{width:'auto', height:24, padding:'0 10px', fontSize:'0.7rem'}} onClick={() => handleDownloadZip(selectedTrip)}>📦 ZIP 다운로드</button>}</div>
                         <div className={styles.photoGallery}>{selectedTrip.photos?.map((p, i) => {
                                const finalUrl = p.key ? `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(p.key)}` : p.url;
                                return (
                                    <div key={i} className={styles.photoWrapper} onClick={() => window.open(finalUrl, '_blank')}>
                                        <img src={finalUrl} alt="photo" />
                                    </div>
                                );
                            })}</div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>이동 경로 ({selectedTripLocations.length})</div>
                            <div className={styles.locationList}>
                                {selectedTripLocations.slice().reverse().map((loc, i) => (
                                    <div key={i} className={styles.locationItem} onClick={() => { mapInstanceRef.current?.setCenter(new naver.maps.LatLng(loc.lat, loc.lng)); mapInstanceRef.current?.setZoom(16); }}>
                                        <div className={styles.locTime}>{new Date(loc.recorded_at).toLocaleTimeString()}</div>
                                        <div className={styles.locAddress}>{loc.address || '주소 정보 없음'}</div>
                                    </div>
                                ))}
                            </div>
                            {/* 수정 이력 로그 섹션 추가 */}
                            <div className={styles.detailSection} style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 20 }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    📋 운송 기록 수정 이력 (Logs)
                                </h3>
                                
                                <div className={styles.logList}>
                                    {tripLogs.length > 0 ? (
                                        tripLogs.map((log, li) => (
                                            <div key={li} className={styles.logItem}>
                                                <div className={styles.logHeader}>
                                                    <span className={styles.logField}>{
                                                        {
                                                            'container_number': '📦 컨테이너 번호',
                                                            'seal_number': '🔒 씰 넘버',
                                                            'container_type': '📏 타입',
                                                            'container_kind': '🚚 종류',
                                                            'special_notes': '📝 특이사항'
                                                        }[log.field_name] || log.field_name
                                                    }</span>
                                                    <span className={styles.logTime}>{new Date(log.created_at).toLocaleString()}</span>
                                                </div>
                                                <div className={styles.logChange}>
                                                    <span className={styles.logOld}>{log.old_value}</span>
                                                    <span className={styles.logArrow}>→</span>
                                                    <span className={styles.logNew}>{log.new_value}</span>
                                                </div>
                                                <div className={styles.logUser}>수정자: {log.modified_by}</div>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.9rem' }}>
                                            수정 이력이 없습니다.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
