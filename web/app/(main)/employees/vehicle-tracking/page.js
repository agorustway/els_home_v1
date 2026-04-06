'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// [신규] 에디터 동적 로딩 (SSR 방지)
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';
import styles from './tracking.module.css';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@/constants/vehicleTracking';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
const ADDRESS_CACHE = new Map(); // [신규] 중복 조회 방지용 캐시 (토큰 절약)

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
    const [notices, setNotices] = useState([]); // 실시간 공지사항 (동적 데이터)
    const [emergencies, setEmergencies] = useState([]); // [신규] 긴급알림 데이터
    const [showWriteModal, setShowWriteModal] = useState(false);
    const [newNotice, setNewNotice] = useState({ title: '', content: '', target: '전체', isEmergency: false, category: '일반공지' });
    const [alertMsg, setAlertMsg] = useState(null); // 모달 내 메시지용
    const [loading, setLoading] = useState(true);
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]); // 경로 상세용 마커
    const liveMarkersRef = useRef([]); // 실시간 운영 차량 마커 (별도 관리)
    const polylineRef = useRef(null);
    const infoWindowRef = useRef(null);
    const intervalRef = useRef(null);
    const miniMapRef = useRef(null);
    const miniMapInstanceRef = useRef(null);
    const miniPolylineRef = useRef(null);
    const miniMarkersRef = useRef([]);
    const realtimeIntervalRef = useRef(null);
    const realtimeTimeoutRef = useRef(null);
    const [realtimeTarget, setRealtimeTarget] = useState(null); // 실시간 추적 대상 trip ID
    const [realtimeCountdown, setRealtimeCountdown] = useState(0); // 남은 초
    const [liveSearchKeyword, setLiveSearchKeyword] = useState(''); // [신규] 실시간 관제 검색어

    // [신규] 공지사항/긴급 페이징 상태
    const [noticePage, setNoticePage] = useState(1);
    const [emergencyPage, setEmergencyPage] = useState(1);
    const NOTICE_LIMIT = 3;
    const EM_LIMIT = 3;

    // 모바일 리스트 팝업 토글
    const [isMobileListOpen, setIsMobileListOpen] = useState(false);

    // 운행 기록 (검색/필터)
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [recordsTotal, setRecordsTotal] = useState(0);
    const [selectedIds, setSelectedIds] = useState([]); // 일괄 삭제용
    const [sortConfig, setSortConfig] = useState({ key: 'started_at', direction: 'desc' }); // 정렬 상태

    // ─── [신규] 사진 뷰어 상태 ───
    const [viewingPhotoUrl, setViewingPhotoUrl] = useState(null);
    const [zoomInfo, setZoomInfo] = useState({ scale: 1, x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    // ─── 0. 지도 리사이즈 및 탭 전환 대응 ───
    useEffect(() => {
                if (window.naver?.maps && mapInstanceRef.current && mapReady) {
                    naver.maps.Event.trigger(mapInstanceRef.current, 'resize');
                    if (activeTab === 'live' && Array.isArray(liveTrips) && liveTrips.length > 0) {
                        const bounds = new naver.maps.LatLngBounds();
                        liveTrips.forEach(t => { 
                            if (t && t.lastLocation && t.lastLocation.lat && t.lastLocation.lng) {
                                bounds.extend(new naver.maps.LatLng(t.lastLocation.lat, t.lastLocation.lng)); 
                            }
                        });
                        // [v4.5.32] isEmpty가 함수인지 한 번 더 체크 (인증 실패 대비)
                        if (typeof bounds.isEmpty === 'function' && !bounds.isEmpty()) {
                            mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
                        }
                    }
                }
    }, [isFullscreen, mapReady, activeTab, liveTrips.length]);

    // ─── 1. 전역 관제 ───
    const fetchLiveTrips = useCallback(async () => {
        try {
            let baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
            // [v4.5.31] 브라우저에서 localhost:2929 접근 불가 대응 (동일 호스트의 2929 포트로 시도)
            if (typeof window !== 'undefined' && baseUrl.includes('localhost')) {
                baseUrl = `http://${window.location.hostname}:2929`;
            }
            const res = await fetch(`${baseUrl}/api/vehicle-tracking?mode=active`);
            const data = await res.json();
            if (data && Array.isArray(data.data)) {
                setLiveTrips(data.data);
            } else {
                setLiveTrips([]); // [안전] 형식이 다르면 빈 배열로 초기화
            }
        } catch (e) {
            console.error('운행 데이터 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // [신규] 공지사항 목록 실 시 간 연동
    const fetchNotices = useCallback(async () => {
        const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20);
        if (!error && data) setNotices(data);

        // [수정] SYSTEM_COMMAND 는 UI에 노출하지 않도록 필터링
        const { data: emData, error: emError } = await supabase.from('emergency_notices').select('*').order('created_at', { ascending: false }).limit(40);
        if (!emError && emData) {
            setEmergencies(emData.filter(em => em.title !== 'SYSTEM_COMMAND').slice(0, 10));
        }
    }, []);

    const showModalAlert = (msg) => {
        setAlertMsg(msg);
        setTimeout(() => setAlertMsg(null), 2500);
    };

    const handleSaveNotice = async () => {
        if (!newNotice.title.trim()) { showModalAlert('제목을 입력해주세요.'); return; }
        if (!newNotice.content.trim()) { showModalAlert('내용을 입력해주세요.'); return; }
        setLoading(true);
        try {
            const endpoint = newNotice.isEmergency ? '/api/vehicle-tracking/emergency' : '/api/vehicle-tracking/notices';
            const method = newNotice.id ? 'PUT' : 'POST';
            const bodyData = newNotice.isEmergency
                ? { id: newNotice.id, title: newNotice.title, message: newNotice.content }
                : { id: newNotice.id, title: newNotice.title, content: newNotice.content, target: newNotice.target, category: newNotice.category, status: '공지중' };

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });

            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || '저장 중 오류가 발생했습니다.');

            showModalAlert(newNotice.id ? '수정되었습니다.' : '등록되었습니다.');
            setTimeout(() => {
                setShowWriteModal(false);
                setNewNotice({ title: '', content: '', target: '전체', isEmergency: false, category: '일반공지' });
                fetchNotices();
            }, 800);
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteNotice = async (id, isEmergency = false) => {
        if (!confirm('삭제하시겠습니까?')) return;
        setLoading(true);
        try {
            const endpoint = isEmergency ? '/api/vehicle-tracking/emergency' : '/api/vehicle-tracking/notices';
            const res = await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || '삭제 중 오류가 발생했습니다.');

            showModalAlert('삭제되었습니다.');
            setTimeout(() => {
                setShowWriteModal(false);
                setNewNotice({ title: '', content: '', target: '전체', isEmergency: false, category: '일반공지' });
                fetchNotices();
            }, 800);
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditNotice = (n, isEmergency = false) => {
        setNewNotice({ ...n, content: isEmergency ? n.message : n.content, isEmergency, category: n.category || '일반공지' });
        setShowWriteModal(true);
    };

    // [신규] 첨부파일 업로드 (NAS 연동 권장하지만 일단 Supabase Storage 또는 S3 Presigned 이용 가능하도록 틀만 구성)
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', '/공지사항_첨부');

            const res = await fetch('/api/nas/files', { method: 'POST', body: formData });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '업로드 실패');

            setNewNotice(prev => ({
                ...prev,
                attachments: [...(prev.attachments || []), { name: file.name, url: `/api/nas/files?download=true&path=${encodeURIComponent(d.path)}&name=${encodeURIComponent(file.name)}` }]
            }));
            alert('파일이 업로드되었습니다.');
        } catch (e) { alert('파일 업로드 실패: ' + e.message); }
        finally { setLoading(false); }
    };

    // ─── 2. 상세 경로 조회 ───
    const drawTripPath = (locations, retries = 5) => {
        // [v4.5.12][Fix] naver 전역 + mapRef 동시 체크 — 미초기화 시 retry
        if (!window.naver?.maps || !mapInstanceRef.current || !locations?.length) {
            if (retries > 0 && locations?.length) {
                setTimeout(() => drawTripPath(locations, retries - 1), 300);
            }
            return;
        }
        const map = mapInstanceRef.current;
        if (polylineRef.current) polylineRef.current.setMap(null);
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];

        const haversine = (lat1, lng1, lat2, lng2) => {
            const p = 0.017453292519943295;
            const c = Math.cos;
            const a = 0.5 - c((lat2 - lat1) * p) / 2 +
                c(lat1 * p) * c(lat2 * p) * (1 - c((lng2 - lng1) * p)) / 2;
            return 12742 * Math.asin(Math.sqrt(a));
        };

        // [v4.5.38] 경로 필터링 강화 및 마커 가독성 업그레이드
        const filteredLocs = [];
        const SPEED_LIMIT_KMH = 150; 
        
        for (let i = 0; i < locations.length; i++) {
            const curr = locations[i];
            if (filteredLocs.length === 0) { filteredLocs.push(curr); continue; }

            const prev = filteredLocs[filteredLocs.length - 1];
            const distPrev = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
            const timePrev = (new Date(curr.timestamp || curr.recorded_at) - new Date(prev.timestamp || prev.recorded_at)) / 1000;
            
            const speed = timePrev > 0 ? (distPrev / (timePrev / 3600)) : 0;
            if (timePrev > 0 && speed > SPEED_LIMIT_KMH) continue; // 시속 150km 이상 튀는 포인트 제거

            if (i < locations.length - 1) {
                const next = locations[i + 1];
                const distNext = haversine(curr.lat, curr.lng, next.lat, next.lng);
                const distPrevNext = haversine(prev.lat, prev.lng, next.lat, next.lng);
                
                const spikeThreshold = ((prev.speed ?? 0) < 5) ? 0.05 : 0.5;
                if (distPrev > spikeThreshold && distNext > spikeThreshold && distPrevNext < (spikeThreshold * 0.8)) {
                    continue; // 뾰족하게 튀었다가 돌아오는 지그재그 데이터 제거
                }
            }

            const moveThreshold = ((prev.speed ?? 0) < 5) ? 0.03 : 0.02;
            if (distPrev < moveThreshold) continue; // 너무 인접한 데이터 합치기
            
            filteredLocs.push(curr);
        }

        if (locations.length > 0 && filteredLocs[filteredLocs.length - 1] !== locations[locations.length - 1]) {
            filteredLocs.push(locations[locations.length - 1]); // 도착점 보존
        }

        if (filteredLocs.length === 0) return;
        const path = filteredLocs.map(l => new naver.maps.LatLng(l.lat, l.lng));
        const polyline = new naver.maps.Polyline({
            map: map, path: path, strokeColor: '#2563eb', strokeWeight: 6,
            strokeOpacity: 0.8, strokeStyle: 'solid', strokeLineCap: 'round', strokeLineJoin: 'round'
        });
        polylineRef.current = polyline;

        const bounds = new naver.maps.LatLngBounds();
        path.forEach(p => bounds.extend(p));

        // 중간 경유지 마커 (주소가 바뀌거나 5km 이상 이동 시에만 표시)
        let lastMarkedAddr = "";
        let lastMarkedPos = null;

        filteredLocs.forEach((l, idx) => {
            const isStart = idx === 0;
            const isEnd = idx === filteredLocs.length - 1;
            
            // 시작과 끝 마커는 별도 처리, 중간 지점들만 주소 중복 체크
            if (!isStart && !isEnd) {
                const distFromLast = lastMarkedPos ? haversine(lastMarkedPos.lat, lastMarkedPos.lng, l.lat, l.lng) : 999;
                if (l.address === lastMarkedAddr && distFromLast < 3) return; // 동일 주소이거나 3km 이하면 스킵
            }
            
            lastMarkedAddr = l.address;
            lastMarkedPos = { lat: l.lat, lng: l.lng };

            const pointMarker = new naver.maps.Marker({
                position: new naver.maps.LatLng(l.lat, l.lng),
                map: map,
                icon: {
                    content: isStart ? 
                        '<div style="width:32px;height:32px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:900;z-index:999;">S</div>' :
                        isEnd ? 
                        '<div style="width:32px;height:32px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:900;z-index:999;">E</div>' :
                        '<div style="width:12px;height:12px;background:#3b82f6;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>',
                    anchor: new naver.maps.Point(isStart || isEnd ? 16 : 6, isStart || isEnd ? 16 : 6)
                },
                zIndex: isStart || isEnd ? 1000 : 100,
                title: l.address || '이동 지점'
            });
            markersRef.current.push(pointMarker);
        });


        if (end) {
            const endMarker = new naver.maps.Marker({
                position: new naver.maps.LatLng(end.lat, end.lng), map,
                zIndex: 100, // 가장 위
                icon: { content: '<div style="width:24px;height:24px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:900;">E</div>', anchor: new naver.maps.Point(12, 12) }
            });
            markersRef.current.push(endMarker);
        }
        map.fitBounds(bounds, { top: 100, right: 100, bottom: 100, left: 100 });
    };

    // [공통] 주소 역지오코딩 헬퍼 (캐시 적용)
    const fetchAddressForLocation = useCallback(async (lat, lng) => {
        if (!window.naver?.maps?.Service) return null;
        const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (ADDRESS_CACHE.has(cacheKey)) return ADDRESS_CACHE.get(cacheKey);

        return new Promise((resolve) => {
            naver.maps.Service.reverseGeocode({
                coords: new naver.maps.LatLng(lat, lng),
                orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
            }, (status, response) => {
                if (status === naver.maps.Service.Status.OK) {
                    const addr = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                    ADDRESS_CACHE.set(cacheKey, addr);
                    resolve(addr);
                } else {
                    resolve(null);
                }
            });
        });
    }, []);

    // 단건 주소 수동 조회 (상세보기 위치 목록의 "주소 확인" 버튼용)
    const fetchMissingAddress = useCallback(async (loc, index) => {
        if (!window.naver?.maps?.Service) return;
        const addr = await fetchAddressForLocation(loc.lat, loc.lng);
        if (addr) {
            setSelectedTripLocations(prev => prev.map((l, idx) => idx === index ? { ...l, address: addr } : l));
        }
    }, [fetchAddressForLocation]);

    // [중복 제거] 실시간/기록 탭 통합 주소 배치 로더
    const backfillAddresses = useCallback(async (targetList, setter) => {
        if (!mapReady || !targetList?.length || !window.naver?.maps?.Service) return;

        const missing = targetList.filter(t => t.lastLocation && !t.lastLocation.address && !t.last_location_address);
        if (missing.length === 0) return;

        for (const trip of missing) {
            const loc = trip.lastLocation;
            if (!loc) continue;

            const addr = await fetchAddressForLocation(loc.lat, loc.lng);
            if (addr) {
                setter(prev => prev.map(t => t.id === trip.id ? { ...t, lastLocation: { ...t.lastLocation, address: addr }, last_location_address: addr } : t));
            }
            await new Promise(r => setTimeout(r, 200)); // API Throttle 방지
        }
    }, [mapReady, fetchAddressForLocation]);

    // [신규] 실시간 추적 모드 (3초 간격, 최대 2분)
    const startRealtimeTracking = useCallback(async (tripId) => {
        // 기존 실시간 추적 정리
        if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
        if (realtimeTimeoutRef.current) clearTimeout(realtimeTimeoutRef.current);

        setRealtimeTarget(tripId);
        setRealtimeCountdown(60); // 1분 = 60초

        // [추가] 앱에 신호 보내기 (긴급공지 활용)
        try {
            await fetch('/api/vehicle-tracking/emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'SYSTEM_COMMAND',
                    message: `REALTIME_ON:${tripId}`
                })
            });
        } catch (e) { console.error('앱 실시간 명령 전송 실패:', e); }

        // 카운트다운 타이머
        const countdownTimer = setInterval(() => {
            setRealtimeCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownTimer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // 3초 간격 fetch
        realtimeIntervalRef.current = setInterval(async () => {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
                const res = await fetch(`${baseUrl}/api/vehicle-tracking?mode=active`);
                const data = await res.json();
                if (data.data) setLiveTrips(data.data);

                // [추가] 상세보기와 동기화 (LIVE 동안 상세 지도의 경로와 위치 리스트 최신화)
                if (tripId && window.location.pathname.includes('/vehicle-tracking')) {
                    const baseUrl = process.env.NEXT_PUBLIC_ELS_BACKEND_URL || '';
                    const locRes = await fetch(`${baseUrl}/api/vehicle-tracking/${tripId}/locations`);
                    const locData = await locRes.json();
                    if (locData.locations && locData.locations.length > 0) {
                        setSelectedTripLocations(locData.locations);
                        drawTripPath(locData.locations);
                    }
                }
            } catch (e) { console.error('실시간 추적 오류:', e); }
        }, 3000);

        // 1분 후 자동 종료
        realtimeTimeoutRef.current = setTimeout(() => {
            if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
            clearInterval(countdownTimer);
            realtimeIntervalRef.current = null;
            setRealtimeTarget(null);
            setRealtimeCountdown(0);
        }, 60000); // 1분
    }, []);

    const stopRealtimeTracking = useCallback((manualTripId = null) => {
        if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
        if (realtimeTimeoutRef.current) clearTimeout(realtimeTimeoutRef.current);
        realtimeIntervalRef.current = null;
        realtimeTimeoutRef.current = null;

        const tripToStop = manualTripId || realtimeTarget;
        setRealtimeTarget(null);
        setRealtimeCountdown(0);

        if (tripToStop) {
            try {
                fetch('/api/vehicle-tracking/emergency', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: 'SYSTEM_COMMAND',
                        message: `REALTIME_OFF:${tripToStop}`
                    })
                });
            } catch (e) { }
        }
    }, [realtimeTarget]);

    const handleSelectTrip = async (trip) => {
        setIsDetailLoading(true);
        setSelectedTripLocations([]);
        setTripLogs([]);

        // [제거] 상세보기 시 자동 실시간 추적 시작 로직은 사용자의 명시적 요청을 위해 제거합니다.
        /*
        if (trip.status === 'driving' || trip.status === 'paused') {
            startRealtimeTracking(trip.id);
        }
        */

        try {
            const [tripRes, locRes, logRes] = await Promise.all([
                fetch(`/api/vehicle-tracking/trips/${trip.id}`),
                fetch(`/api/vehicle-tracking/trips/${trip.id}/locations`),
                fetch(`/api/vehicle-tracking/trips/${trip.id}/logs`)
            ]);

            const tripData = await tripRes.json();
            if (tripData) setSelectedTrip(tripData);
            else setSelectedTrip(trip);

            const locData = await locRes.json();
            if (locData.locations) {
                const locations = locData.locations;
                setSelectedTripLocations(locations);
                drawTripPath(locations);

                if (locations.length > 0) {
                    // 시작/종료 주소만 즉시 조회 (상세보기용)
                    fetchAddressForLocation(locations[0].lat, locations[0].lng).then(addr => {
                        if (addr) setSelectedTripLocations(prev => prev.map((l, idx) => idx === 0 ? { ...l, address: addr } : l));
                    });
                    if (locations.length > 1) {
                        fetchAddressForLocation(locations[locations.length - 1].lat, locations[locations.length - 1].lng).then(addr => {
                            if (addr) setSelectedTripLocations(prev => prev.map((l, idx) => idx === locations.length - 1 ? { ...l, address: addr } : l));
                        });
                    }
                }
            }

            const logData = await logRes.json();
            if (logData && logData.logs) {
                setTripLogs(logData.logs);
            } else {
                setTripLogs([]);
            }
        } catch (e) {
            console.error('상세 정보 조회 실패:', e);
            setSelectedTrip(trip);
            setTripLogs([]);
        } finally {
            setIsDetailLoading(false);
        }
    };

    // [신규] 상세 모달용 미니맵 초기화 및 경로 정렬 그리기
    // [v4.5.12][Fix] selectedTripLocations 또는 miniMapRef 준비 시점 불일치 문제 해결:
    // selectedTripLocations 상태 변화 + miniMapRef DOM 마운트 타이밍이 안 맞을 수 있으므로,
    // 둘 다 준비될 때까지 300ms씩 최대 10회 재시도하는 retry 로직 내장.
    useEffect(() => {
        if (!selectedTrip) return;
        let retries = 10;
        let timerId = null;

        const tryDraw = () => {
            // [안전] 이미 모달이 닫혔거나 지도가 없으면 중단
            if (!selectedTrip || !miniMapRef.current || !window.naver?.maps) {
                if (retries-- > 0 && selectedTrip) {
                    timerId = setTimeout(tryDraw, 300);
                }
                return;
            }

            let map = miniMapInstanceRef.current;
            if (!map) {
                map = new window.naver.maps.Map(miniMapRef.current, {
                    center: new window.naver.maps.LatLng(36.5, 127.0),
                    zoom: 13, zoomControl: true, zoomControlOptions: { position: window.naver.maps.Position.TOP_RIGHT }
                });
                miniMapInstanceRef.current = map;
            }

            if (miniPolylineRef.current) miniPolylineRef.current.setMap(null);
            miniMarkersRef.current.forEach(m => { if (m) m.setMap(null); });
            miniMarkersRef.current = [];

            if (!selectedTripLocations || !Array.isArray(selectedTripLocations) || selectedTripLocations.length === 0) return;

            let validLocs = selectedTripLocations.filter(l => l && typeof l.lat === 'number' && typeof l.lng === 'number');
            if (validLocs.length === 0) return;

            validLocs.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.recorded_at);
                const dateB = new Date(b.timestamp || b.recorded_at);
                return dateA - dateB;
            });

            const distance = (lat1, lng1, lat2, lng2) => {
                const p = 0.017453292519943295;
                const c = Math.cos;
                const a = 0.5 - c((lat2 - lat1) * p) / 2 +
                    c(lat1 * p) * c(lat2 * p) *
                    (1 - c((lng2 - lng1) * p)) / 2;
                return 12742 * Math.asin(Math.sqrt(a));
            };

            const filteredLocs = [];
            const SPEED_LIMIT_KMH = 120;

            for (let i = 0; i < validLocs.length; i++) {
                const curr = validLocs[i];
                if (filteredLocs.length === 0) { filteredLocs.push(curr); continue; }
                const prev = filteredLocs[filteredLocs.length - 1];
                const distPrev = distance(prev.lat, prev.lng, curr.lat, curr.lng);
                const timePrev = (new Date(curr.timestamp || curr.recorded_at) - new Date(prev.timestamp || prev.recorded_at)) / 1000;
                const speed = timePrev > 0 ? (distPrev / (timePrev / 3600)) : 0;
                if (timePrev > 0 && speed > SPEED_LIMIT_KMH) continue;
                filteredLocs.push(curr);
            }
            
            const path = filteredLocs.map(l => new window.naver.maps.LatLng(l.lat, l.lng));
            const polyline = new window.naver.maps.Polyline({
                map: map, path: path, strokeColor: '#2563eb', strokeWeight: 5,
                strokeOpacity: 0.8, strokeStyle: 'solid', strokeLineCap: 'round', strokeLineJoin: 'round'
            });
            miniPolylineRef.current = polyline;

            const bounds = new window.naver.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            // fitBounds는 중복 실행 방지
            if (path.length > 0 && !miniMapInstanceRef.current._hasFitBounds) {
                map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
                miniMapInstanceRef.current._hasFitBounds = true;
            }
        };

        tryDraw();
        return () => {
            if (timerId) clearTimeout(timerId);
            if (miniMapInstanceRef.current) miniMapInstanceRef.current._hasFitBounds = false;
        };
    }, [selectedTrip, selectedTripLocations, realtimeTarget]);

    // [신규] 안드로이드 뒤로가기 버튼 연동 (Hash를 통한 사이드이펙트 방지)
    useEffect(() => {
        if (!selectedTrip) return;

        // 브라우저 주소창 뒤에 #detail 을 붙여서 히스토리 항목을 하나 생성
        window.location.hash = 'detail';

        const handleHashChange = () => {
            if (window.location.hash !== '#detail') {
                // 사용자가 스마트폰 뒤로가기 버튼을 눌러서 #detail 이 사라졌을 때
                miniMapInstanceRef.current = null;
                setSelectedTrip(null);
                if (typeof stopRealtimeTracking === 'function') stopRealtimeTracking(selectedTrip.id);
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
            // 만약 모달이 컴포넌트 내부에서 그냥 닫혔다면 (X 버튼 등)
            if (window.location.hash === '#detail') {
                // 뒤로가기를 1회 소모해서 주소창을 원상복구
                window.history.back();
            }
        };
    }, [selectedTrip]);

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
            console.log("[Naver Map] 스크립트 로드 시도... ID: " + process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID);
            const scriptId = 'naver-map-script-v3';
            if (document.getElementById(scriptId)) return;
            const script = document.createElement('script');
            script.id = scriptId;
            // [v4.5.37] ncpClientId -> ncpKeyId 로 변경 (네트워크 페이지와 100% 동일하게 맞춰서 인증 해결)
            script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`;
            script.async = true;
            script.defer = true;
            script.onload = () => { console.log("[Naver Map] 스크립트 로드 완료!"); handleInit(); };
            script.onerror = () => { console.error("[Naver Map] 스크립트 로드 실패!"); setMapReady(false); };
            document.head.appendChild(script);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    // 실시간 fetch
    useEffect(() => {
        fetchLiveTrips();
        fetchNotices(); // 공지사항 초기 로드
        intervalRef.current = setInterval(() => { fetchLiveTrips(); fetchNotices(); }, 30000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchLiveTrips, fetchNotices]);

    // [최적화] 실시간 운행차량 주소 자동 전체 로드
    useEffect(() => {
        if (activeTab === 'live') backfillAddresses(liveTrips, setLiveTrips);
    }, [liveTrips.length, activeTab, backfillAddresses]);

    // [최적화] 운행기록 탭 주소 자동 로드
    useEffect(() => {
        if (activeTab === 'records') backfillAddresses(records, setRecords);
    }, [records.length, activeTab, backfillAddresses]);

    // 실시간 마커 업데이트 (selectedTrip 여부와 무관하게 항상 live 탭에서 렌더링)
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || activeTab !== 'live') return;
        const map = mapInstanceRef.current;
        // live 마커만 초기화 (경로 상세 마커 markersRef는 건드리지 않음)
        liveMarkersRef.current.forEach(m => m.setMap(null));
        liveMarkersRef.current = [];
        if (infoWindowRef.current) infoWindowRef.current.close();

        const tripsWithLocation = liveTrips.filter(t => t.lastLocation);
        if (tripsWithLocation.length === 0) return;

        const bounds = new naver.maps.LatLngBounds();
        const generateInfoWindowHtml = (trip, loc, markerColor) => `
            <div style="padding:16px; min-width:240px; font-family:'Pretendard',sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <div style="font-size:16px; font-weight:800; color:#1e293b; margin-bottom:2px;">${trip.driver_name}</div>
                        <div style="font-size:11px; font-weight:600; color:#64748b;">🚛 ${trip.vehicle_number}</div>
                    </div>
                    <span style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; background:${markerColor}15; color:${markerColor}; border:1px solid ${markerColor}40;">${TRIP_STATUS_LABELS[trip.status]}</span>
                </div>
                <div style="padding:10px; background:#f8fafc; border-radius:10px; font-size:13px; color:#334155; line-height:1.5; border:1px solid #f1f5f9; margin-top:4px;">
                    <span style="display:block; font-weight:800; color:#0ea5e9; font-size:10px; margin-bottom:4px; text-transform:uppercase;">Current Location</span>
                    <div style="font-weight:700; color:#0f172a; margin-bottom:2px;">
                        ${loc.address || '주소 정보 확인 중...'}
                    </div>
                    <div style="font-weight:700; color:#3b82f6; font-size:11px;">
                        💨 현재 속도: ${Math.round(loc.speed || 0)} km/h
                    </div>
                </div>
                ${!loc.address ? `<div style="font-size:9px; color:#94a3b8; margin-top:6px; text-align:right;">(좌표: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})</div>` : ''}
            </div>
        `;

        tripsWithLocation.forEach(trip => {
            const loc = trip.lastLocation;
            const pos = new naver.maps.LatLng(loc.lat, loc.lng);
            bounds.extend(pos);
            const isDriving = trip.status === 'driving';
            const isPaused = trip.status === 'paused';
            const markerColor = isDriving ? '#10b981' : (isPaused ? '#f59e0b' : '#6b7280');
            const vNum = trip.vehicle_number || '';
            const vLabel = vNum.length >= 4 ? vNum.slice(-4) : vNum;
            const markerZIndex = isDriving ? 300 : (isPaused ? 200 : 100);

            const marker = new naver.maps.Marker({
                position: pos, map,
                zIndex: markerZIndex,
                icon: {
                    content: `<div style="min-width:38px;height:24px;padding:0 6px;background:${markerColor};border:2px solid #fff;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:0.5px;">${vLabel || '───'}</div>`,
                    anchor: new naver.maps.Point(22, 12),
                },
            });

            const infoWindow = new naver.maps.InfoWindow({
                content: generateInfoWindowHtml(trip, loc, markerColor),
                borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff'
            });

            naver.maps.Event.addListener(marker, 'click', () => {
                if (infoWindowRef.current) infoWindowRef.current.close();

                // [요청 반영] 마커 클릭 시 차량 경로 전체 표시 및 상세정보 모달 열기
                handleSelectTrip(trip);

                // [신규] 마커 클릭 시 실시간 추적 모드 ON (운행중/일시정지만)
                if (trip.status === 'driving' || trip.status === 'paused') {
                    startRealtimeTracking(trip.id);
                }

                // 마커 클릭 시 주소가 없으면 바로 조회 시도
                if (!loc.address && window.naver?.maps?.Service) {
                    naver.maps.Service.reverseGeocode({
                        coords: new naver.maps.LatLng(loc.lat, loc.lng),
                        orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
                    }, (status, response) => {
                        if (status === naver.maps.Service.Status.OK) {
                            loc.address = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                            infoWindow.setContent(generateInfoWindowHtml(trip, loc, markerColor));
                        }
                    });
                }

                infoWindow.open(map, marker);
                infoWindowRef.current = infoWindow;
                map.setZoom(16);
                map.setCenter(pos);
            });
            liveMarkersRef.current.push(marker);
        });
    }, [liveTrips, mapReady, activeTab]);

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
                // 각 트립의 마지막 위치 주소 가져오기 (필요한 경우)
                setRecords(data.trips);
                setRecordsTotal(data.total || data.trips.length);
                setSelectedIds([]); // 검색 시 선택 초기화
            }
        } catch (e) { console.error('기록 조회 실패:', e); }
        finally { setRecordsLoading(false); }
    }, [filterStatus, filterKeyword, filterFrom, filterTo]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);


    const handleSearch = () => fetchRecords();
    const handleReset = () => { setFilterStatus('all'); setFilterKeyword(''); setFilterFrom(''); setFilterTo(''); };

    const handleDeleteRecord = async (id) => {
        if (!confirm('이 운행 기록을 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('삭제 실패');
            setRecords(prev => prev.filter(t => t.id !== id));
            setSelectedIds(prev => prev.filter(sid => sid !== id));
        } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`선택한 ${selectedIds.length}건의 기록을 모두 삭제하시겠습니까?`)) return;

        try {
            // 순차적 또는 병렬로 삭제 처리 (서버에서 bulk delete API 지원하면 더 좋음)
            const deletePromises = selectedIds.map(id => fetch(`/api/vehicle-tracking/trips/${id}`, { method: 'DELETE' }));
            await Promise.all(deletePromises);
            setRecords(prev => prev.filter(t => !selectedIds.includes(t.id)));
            setSelectedIds([]);
            alert('삭제되었습니다.');
        } catch (e) {
            alert('일부 삭제 중 오류가 발생했습니다.');
        }
    };

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });

        const sortedRecords = [...records].sort((a, b) => {
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        setRecords(sortedRecords);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === records.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(records.map(r => r.id));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };


    // handleOpenNaverMap removed

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

    const handleDownloadLocationsCsv = () => {
        if (!selectedTripLocations.length) return;
        let csvContent = '\uFEFF';
        csvContent += '시간,속도(km/h),주소,위도,경도,이벤트\n';

        selectedTripLocations.forEach(loc => {
            const timeStr = new Date(loc.timestamp || loc.recorded_at).toLocaleString('ko-KR');
            const speed = Math.round(loc.speed || 0);
            const address = `"${(loc.address || '').replace(/"/g, '""')}"`;
            const lat = (loc.lat || 0).toFixed(6);
            const lng = (loc.lng || 0).toFixed(6);
            const event = `"${((loc.source || '').includes('gyro') ? '강한 흔들림 (자이로)' : (loc.marker_type || ''))}"`;
            csvContent += `${timeStr},${speed},${address},${lat},${lng},${event}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `차량이동경로_${selectedTrip?.driver_name || '이동경로'}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // [v4.5.32] 중복 선언 방지를 위해 상위에서 통합 관리 (기존 라인 삭제)
    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const formatDateShort = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
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

    // [신규] 운행 소요 시간 계산 헬퍼
    const getElapsedTimeString = (start, end) => {
        if (!start) return '-';
        const startTime = new Date(start);
        const endTime = end ? new Date(end) : new Date();
        const diffMs = endTime - startTime;
        if (diffMs < 0) return '0분';

        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);

        if (diffHrs > 0) return `${diffHrs}시간 ${diffMins}분`;
        return `${diffMins}분`;
    };

    // [신규] 실시간 관제 리스트 줌 이동
    const handleZoomToLiveTrip = (trip) => {
        if (!mapInstanceRef.current || !trip.lastLocation) return;
        const loc = trip.lastLocation;
        const pos = new window.naver.maps.LatLng(loc.lat, loc.lng);
        mapInstanceRef.current.setCenter(pos);
        mapInstanceRef.current.setZoom(16);
        window.scrollTo({ top: 0, behavior: 'smooth' }); // 상단 지도로 스크롤
    };

    const activeCount = (liveTrips || []).filter(t => t && t.status === 'driving').length;
    const pausedCount = (liveTrips || []).filter(t => t && t.status === 'paused').length;

    const filteredLiveTrips = (liveTrips || []).filter(t =>
        t && (
            (t.vehicle_number || '').includes(liveSearchKeyword) ||
            (t.driver_name || '').includes(liveSearchKeyword) ||
            (t.container_number || '').includes(liveSearchKeyword)
        )
    );

    // [v4.5.31] 안전한 페이징 연산 (undefined 방지)
    const safeNotices = Array.isArray(notices) ? notices : [];
    const totalNoticePages = Math.max(1, Math.ceil(safeNotices.length / NOTICE_LIMIT));
    const paginatedNotices = safeNotices.slice((noticePage - 1) * NOTICE_LIMIT, noticePage * NOTICE_LIMIT);

    const safeEmergencies = Array.isArray(emergencies) ? emergencies : [];
    const totalEmPages = Math.max(1, Math.ceil(safeEmergencies.length / EM_LIMIT));
    const paginatedEmergencies = safeEmergencies.slice((emergencyPage - 1) * EM_LIMIT, emergencyPage * EM_LIMIT);

    return (
        <div className={styles.trackingPage}>
            <div className={styles.titleBar}>
                <h2><span>🚛</span> 차량위치관제 {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}</h2>
                <div className={styles.titleBtns}>
                    <button className={styles.refreshBtn} onClick={() => { setLoading(true); fetchLiveTrips(); if (activeTab === 'records') fetchRecords(); }}>🔄 새로고침</button>
                    <button className={styles.filterResetBtn} style={{ height: '36px', fontSize: '0.75rem', padding: '0 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => window.open('/api/debug/view', '_blank')}>📋 실시간 로그</button>
                </div>
            </div>

            <div className={styles.tabNav}>
                <button className={`${styles.tab} ${activeTab === 'live' ? styles.tabActive : ''}`} onClick={() => setActiveTab('live')}>📡 실시간 관제</button>
                <button className={`${styles.tab} ${activeTab === 'records' ? styles.tabActive : ''}`} onClick={() => setActiveTab('records')}>📋 운행 기록 관리</button>
            </div>

            <div style={{ display: activeTab === 'live' ? 'block' : 'none' }}>
                <div className={styles.missionDashboard} style={{ gap: '10px', marginBottom: '15px' }}>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>📡 실시간 운행차량</div><div className={styles.statValue} style={{ color: '#10b981', fontSize: '2rem' }}>{activeCount} <span className={styles.statUnit}>대</span></div></div>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>⏸️ 일시정지</div><div className={styles.statValue} style={{ color: '#f59e0b', fontSize: '2rem' }}>{pausedCount} <span className={styles.statUnit}>대</span></div></div>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>🗓️ {new Date().getMonth() + 1}월 전체 운행</div><div className={styles.statValue} style={{ fontSize: '2rem' }}>{recordsTotal} <span className={styles.statUnit}>건</span></div></div>
                </div>

                <div className={styles.liveGrid}>
                    <div className={styles.liveGridRight}>
                        <div className={`${styles.mapContainer} ${isFullscreen ? styles.mapFullscreen : ''}`} style={{ height: '100%', margin: 0, borderRadius: '12px' }}>
                            <button className={styles.fullscreenBtn} onClick={() => setIsFullscreen(!isFullscreen)}>{isFullscreen ? '↩️ 전체화면 해제' : '⛶ 지도 전체화면'}</button>
                            <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '12px' }} />
                            {!mapReady && <div className={styles.mapLoading}>지도를 불러오는 중...</div>}
                        </div>
                    </div>

                    <div className={styles.liveGridLeft}>
                        {/* 긴급 알림 섹션 */}
                        <div className={styles.noticeSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
                            <div className={styles.noticeHeader} style={{ marginBottom: '10px' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: '1rem' }}>🚨 긴급 알림</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{emergencyPage} / {totalEmPages}</div>
                                    <button onClick={() => setEmergencyPage(p => Math.max(1, p - 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>◀</button>
                                    <button onClick={() => setEmergencyPage(p => Math.min(totalEmPages, p + 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>▶</button>
                                    <button className={styles.writeNoticeBtn} style={{ height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#ef4444', borderColor: '#ef4444', padding: '0 10px', color: '#fff' }} onClick={() => { setNewNotice({ title: '', content: '', isEmergency: true }); setShowWriteModal(true); }}>글쓰기</button>
                                </div>
                            </div>
                            <div className={styles.tableCard} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                                <table className={styles.adminNoticeTable} style={{ margin: 0 }}>
                                    <thead><tr><th style={{ width: '80px', textAlign: 'center' }}>날짜</th><th>긴급 내용</th></tr></thead>
                                    <tbody>
                                        {paginatedEmergencies.length === 0 ? (
                                            <tr><td colSpan="2" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>발송된 알림이 없습니다.</td></tr>
                                        ) : (
                                            paginatedEmergencies.map(em => (
                                                <tr key={em.id} onClick={() => handleEditNotice(em, true)} style={{ cursor: 'pointer', background: '#fef2f2' }}>
                                                    <td style={{ color: '#dc2626', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{formatDateShort(em.created_at)}<br />{new Date(em.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                                                    <td style={{ fontWeight: 600, color: '#991b1b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{em.title}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 공지사항 섹션 */}
                        <div className={styles.noticeSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
                            <div className={styles.noticeHeader} style={{ marginBottom: '10px' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>📣 공지사항</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{noticePage} / {totalNoticePages}</div>
                                    <button onClick={() => setNoticePage(p => Math.max(1, p - 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>◀</button>
                                    <button onClick={() => setNoticePage(p => Math.min(totalNoticePages, p + 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>▶</button>
                                    <button className={styles.writeNoticeBtn} style={{ height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }} onClick={() => { setNewNotice({ title: '', content: '', target: '전체', isEmergency: false }); setShowWriteModal(true); }}>글쓰기</button>
                                </div>
                            </div>
                            <div className={styles.tableCard} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                                <table className={styles.adminNoticeTable} style={{ margin: 0 }}>
                                    <thead><tr><th style={{ width: '80px', textAlign: 'center' }}>날짜</th><th>제목</th><th style={{ width: '80px', textAlign: 'center' }}>상태</th></tr></thead>
                                    <tbody>
                                        {paginatedNotices.length === 0 ? (
                                            <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>게시된 공지사항이 없습니다.</td></tr>
                                        ) : (
                                            paginatedNotices.map(n => (
                                                <tr key={n.id} onClick={() => handleEditNotice(n, false)} style={{ cursor: 'pointer' }}>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#475569' }}>{formatDateShort(n.created_at)}</td>
                                                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{n.title}</td>
                                                    <td style={{ textAlign: 'center' }}><span className={styles.statusDriving} style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', display: 'inline-block' }}>{n.status}</span></td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.filterBar} style={{ marginBottom: 10, marginTop: 15 }}>
                    <input className={styles.filterInput} placeholder="현재 운행 기사명/차량/컨테이너 검색" value={liveSearchKeyword} onChange={e => setLiveSearchKeyword(e.target.value)} style={{ flex: 1 }} />
                    <button className={styles.filterResetBtn} onClick={() => setLiveSearchKeyword('')}>초기화</button>
                </div>

                <button className={styles.tableSectionMobileBtn} onClick={() => setIsMobileListOpen(true)}>
                    📋 현재 운행 현황 목록 보기 ({filteredLiveTrips.length}건)
                </button>

                <div className={`${styles.mobilePopupOverlay} ${isMobileListOpen ? styles.showOnMobile : ''}`} onClick={() => setIsMobileListOpen(false)}></div>

                <div className={`${styles.tableSection} ${isMobileListOpen ? styles.showOnMobile : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0 }}>📋 현재 운행 현황 ({filteredLiveTrips.length}건) {realtimeTarget && <span style={{ fontSize: '0.7rem', color: '#10b981', background: '#10b98115', padding: '2px 8px', borderRadius: 10, fontWeight: 800, marginLeft: 8 }}>🔴 LIVE 추적중 ({realtimeCountdown}초)</span>}</h3>
                        <button className={styles.closeBtnMobile} onClick={() => setIsMobileListOpen(false)} style={{ display: 'none', background: 'none', border: 'none', fontSize: '1.2rem', color: '#64748b' }}>✕</button>
                    </div>
                    <table className={styles.tripTable}>
                        <thead><tr><th>상태</th><th>기사명</th><th>차량번호</th><th>컨테이너</th><th>마지막 수신위치</th><th>관리</th></tr></thead>
                        <tbody>
                            {filteredLiveTrips.map(trip => (
                                <tr key={trip.id} onClick={(e) => {
                                    setIsMobileListOpen(false);
                                    handleSelectTrip(trip);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }} style={{ ...(realtimeTarget === trip.id ? { background: '#10b98110' } : {}), cursor: 'pointer' }}>
                                    <td><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td><strong>{trip.driver_name}</strong></td>
                                    <td>{trip.vehicle_number}</td>
                                    <td>{trip.container_number || '-'}</td>
                                    <td title={trip.lastLocation?.address || '주소 정보 없음'} style={{ whiteSpace: 'normal', wordBreak: 'keep-all', maxWidth: '220px' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem', lineHeight: '1.3' }}>{trip.lastLocation?.address || '-'}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>{formatDateTime(trip.lastLocation?.timestamp || trip.lastLocation?.recorded_at)}</div>
                                    </td>
                                    <td className={styles.actionCol}>
                                        <button className={styles.viewIconBtn} onClick={(e) => { e.stopPropagation(); setIsMobileListOpen(false); handleSelectTrip(trip); }}>상세보기</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ display: activeTab === 'records' ? 'block' : 'none' }}>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup}>
                        <span className={styles.filterLabel}>상태</span>
                        <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">전체</option><option value="driving">🟢 운행 중</option><option value="paused">🟡 일시중지</option><option value="completed">⚪ 운행 완료</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <span className={styles.filterLabel}>기간</span>
                        <input type="date" className={styles.filterDateInput} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                        <span>~</span>
                        <input type="date" className={styles.filterDateInput} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                    </div>
                    <div className={styles.filterGroup}>
                        <input className={styles.filterInput} placeholder="이름/차량/컨테이너" value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} />
                    </div>
                    <button className={styles.filterSearchBtn} onClick={handleSearch}>🔍 검색</button>
                    <button className={styles.filterResetBtn} onClick={handleReset}>초기화</button>

                    {selectedIds.length > 0 && (
                        <button className={styles.bulkDeleteBtn} onClick={handleBulkDelete}>
                            🗑️ {selectedIds.length}건 삭제
                        </button>
                    )}
                </div>
                <div className={styles.tableSection}>
                    <div className={styles.tableHeaderInfo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ display: 'inline-block', marginRight: 15 }}>📋 운행 기록 ({recordsTotal}건)</h3>
                            <span className={styles.tableLegend}>* 클릭 시 정렬 가능 (시작/종료)</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className={styles.filterSearchBtn} style={{ background: '#10b981', borderColor: '#10b981', height: '44px', fontSize: '0.85rem', padding: '0 16px' }} onClick={() => window.location.href = `/api/vehicle-tracking/export/excel?from=${filterFrom}&to=${filterTo}&keyword=${filterKeyword}&status=${filterStatus}`}>📊 엑셀 다운로드</button>
                            <button className={styles.filterSearchBtn} style={{ background: '#3b82f6', borderColor: '#3b82f6', height: '44px', fontSize: '0.85rem', padding: '0 16px' }} onClick={() => {
                                if (selectedIds.length === 0) alert('다운로드할 기록을 선택해주세요.');
                                else window.location.href = `/api/vehicle-tracking/export/zip?ids=${selectedIds.join(',')}`;
                            }}>📦 선택건 사진 다운로드</button>
                        </div>
                    </div>
                    <table className={styles.tripTable}>
                        <thead>
                            <tr>
                                <th><input type="checkbox" checked={records.length > 0 && selectedIds.length === records.length} onChange={toggleSelectAll} /></th>
                                <th>상태</th>
                                <th onClick={() => handleSort('driver_name')} className={styles.sortable}>기사명/차량 {sortConfig.key === 'driver_name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                                <th style={{ minWidth: '130px' }}>컨테이너/씰넘버</th>
                                <th>규격/종류</th>
                                <th>점검여부(브/타/램/적/기)</th>
                                <th style={{ maxWidth: '120px' }}>메모</th>
                                <th style={{ width: '60px' }}>사진</th>
                                <th onClick={() => handleSort('started_at')} className={styles.sortable} style={{ width: '130px' }}>날짜 {sortConfig.key === 'started_at' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                                <th style={{ width: '220px' }}>최종위치(최고속도)</th>
                                <th style={{ width: '100px' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map(trip => (
                                <tr key={trip.id} className={selectedIds.includes(trip.id) ? styles.selectedRow : ''}>
                                    <td><input type="checkbox" checked={selectedIds.includes(trip.id)} onChange={() => toggleSelect(trip.id)} /></td>
                                    <td><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td>
                                        <div><strong>{trip.driver_name}</strong></div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{trip.vehicle_number}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{trip.container_number || '-'}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>씰: {trip.seal_number || '-'}</div>
                                    </td>
                                    <td style={{ fontSize: '0.85rem' }}>
                                        <div>{trip.container_type || '-'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{trip.container_kind || '-'}</div>
                                    </td>
                                    <td style={{ fontSize: '12px', letterSpacing: '-0.5px' }}>
                                        <span title="브레이크" style={{ marginRight: 2 }}>{trip.chk_brake ? '✅' : '❌'}</span>
                                        <span title="타이어" style={{ marginRight: 2 }}>{trip.chk_tire ? '✅' : '❌'}</span>
                                        <span title="경광등/램프" style={{ marginRight: 2 }}>{trip.chk_lamp ? '✅' : '❌'}</span>
                                        <span title="적재물" style={{ marginRight: 2 }}>{trip.chk_cargo ? '✅' : '❌'}</span>
                                        <span title="기사숙지">{trip.chk_driver ? '✅' : '❌'}</span>
                                    </td>
                                    <td style={{ fontSize: '0.75rem', color: '#475569', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={trip.special_notes || '-'}>
                                        {trip.special_notes || '-'}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>{trip.photos?.length || 0}장</td>
                                    <td style={{ fontSize: '0.8rem' }}>
                                        <div style={{ color: '#1e293b' }}>{formatDateTime(trip.started_at)}</div>
                                        <div style={{ color: '#64748b' }}>{formatDateTime(trip.completed_at)}</div>
                                    </td>
                                    <td title={trip.last_location_address || '주소 정보 없음'} style={{ whiteSpace: 'normal', wordBreak: 'keep-all', fontSize: '0.8rem', lineHeight: '1.3', color: '#374151', maxWidth: '220px' }}>
                                        <div>{trip.last_location_address || '-'}</div>
                                        {trip.max_speed > 0 && <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, marginTop: 2 }}>최고속도: {trip.max_speed} km/h</div>}
                                    </td>
                                    <td className={styles.actionCol}>
                                        <button className={styles.viewIconBtn} onClick={() => handleSelectTrip(trip)}>상세보기</button>
                                        <button className={styles.deleteIconBtn} onClick={() => handleDeleteRecord(trip.id)}>🗑️</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedTrip && (
                <div className={styles.detailOverlay}>
                    <div className={styles.detailHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h3>운행 상세 정보</h3>
                            {(selectedTrip.status === 'driving' || selectedTrip.status === 'paused') && (
                                <button
                                    className={`${styles.trackingBtn} ${String(realtimeTarget) === String(selectedTrip.id) ? styles.trackingStop : ''}`}
                                    style={{ padding: '4px 12px', fontSize: '0.75rem', height: '28px' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        String(realtimeTarget) === String(selectedTrip.id) ? stopRealtimeTracking(selectedTrip.id) : startRealtimeTracking(selectedTrip.id);
                                    }}
                                >
                                    {String(realtimeTarget) === String(selectedTrip.id) ? `추적중지 (${realtimeCountdown}s)` : '🚀 실시간 추적 시작'}
                                </button>
                            )}
                        </div>
                        <button className={styles.closeBtn} onClick={() => {
                            setSelectedTrip(null);
                        }}>✕</button>
                    </div>
                    <div className={styles.detailContent}>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>기본 정보</div>
                            <div className={styles.detailInfoGrid}>
                                <div><div className={styles.infoLabel}>드라이버</div><div className={styles.infoValue}>{selectedTrip.driver_name}</div></div>
                                <div><div className={styles.infoLabel}>차량번호</div><div className={styles.infoValue}>{selectedTrip.vehicle_number}</div></div>
                                <div><div className={styles.infoLabel}>컨테이너</div><div className={styles.infoValue}>{selectedTrip.container_number || '-'}</div></div>
                                <div><div className={styles.infoLabel}>씰 넘버</div><div className={styles.infoValue}>{selectedTrip.seal_number || '-'}</div></div>
                                <div style={{ gridColumn: 'span 2', background: '#f0f9ff', padding: '8px 12px', borderRadius: 8, border: '1px solid #bae6fd' }}>
                                    <div className={styles.infoLabel} style={{ color: '#0369a1' }}>총 소요 운행 시간</div>
                                    <div className={styles.infoValue} style={{ color: '#0284c7', fontSize: '1.1rem', fontWeight: 800 }}>{getElapsedTimeString(selectedTrip.started_at, selectedTrip.completed_at)}</div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>증빙 사진 ({selectedTrip.photos?.length || 0}) {selectedTrip.photos?.length > 0 && <button className={styles.zipDownloadBtn} style={{ width: 'auto', height: 24, padding: '0 10px', fontSize: '0.7rem' }} onClick={() => handleDownloadZip(selectedTrip)}>📦 ZIP 다운로드</button>}</div>
                            <div className={styles.photoGallery}>{selectedTrip.photos?.map((p, i) => {
                                const finalUrl = p.key ? `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(p.key)}` : p.url;
                                return (
                                    <div key={i} className={styles.photoWrapper} onClick={() => {
                                        setViewingPhotoUrl(finalUrl);
                                        setZoomInfo({ scale: 1, x: 0, y: 0 });
                                    }}>
                                        <img src={finalUrl} alt="photo" />
                                    </div>
                                );
                            })}</div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>
                                <span>이동 경로 ({selectedTripLocations.length})</span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className={styles.filterSearchBtn} style={{ background: '#10b981', borderColor: '#10b981', padding: '0 10px', fontSize: '0.75rem', height: '26px', borderRadius: '6px' }} onClick={handleDownloadLocationsCsv}>📊 엑셀 다운로드</button>
                                    <button className={styles.resetZoomBtn} onClick={() => {
                                        const bounds = new window.naver.maps.LatLngBounds();
                                        selectedTripLocations.filter(l => l.lat > 33 && l.lat < 40 && l.lng > 124 && l.lng < 132).forEach(l => bounds.extend(new window.naver.maps.LatLng(l.lat, l.lng)));
                                        miniMapInstanceRef.current?.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
                                    }}>🎯 전체보기</button>
                                </div>
                            </div>

                            <div style={{ position: 'relative', width: '100%', height: '240px', marginBottom: '12px' }}>
                                <div ref={miniMapRef} style={{ width: '100%', height: '100%', borderRadius: '8px', background: '#f1f5f9' }} />
                                {selectedTripLocations.length === 0 && (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600, background: 'rgba(241,245,249,0.7)', borderRadius: '8px', zIndex: 10 }}>
                                        해당 운행건의 위치 기록이 존재하지 않습니다.
                                    </div>
                                )}
                            </div>

                            <div className={styles.locationList} style={{ maxHeight: '250px', overflowX: 'auto', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' }}>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'center' }}>
                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <th style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>기록시간</th>
                                            <th style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>속도</th>
                                            <th style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>주소</th>
                                            <th style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>위경도</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedTripLocations.length === 0 ? (
                                            <tr><td colSpan="4" style={{ padding: '20px', color: '#94a3b8' }}>위치 기록 데이터가 없습니다.</td></tr>
                                        ) : (
                                            selectedTripLocations.slice().reverse().map((loc, i) => {
                                                const realIndex = selectedTripLocations.length - 1 - i;
                                                const hasAddr = loc.address && loc.address !== '주소 정보 없음';
                                                const d = new Date(loc.timestamp || loc.recorded_at);
                                                const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                                                return (
                                                    <tr key={i} onClick={() => { const mInstance = miniMapInstanceRef.current || mapInstanceRef.current; if (mInstance) { mInstance.setCenter(new window.naver.maps.LatLng(loc.lat, loc.lng)); mInstance.setZoom(16); } }} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                                                        <td style={{ padding: '4px', color: '#475569', fontWeight: 500, letterSpacing: '-0.5px' }}>{dateStr}</td>
                                                        <td style={{ padding: '4px', color: '#3b82f6', fontWeight: 700 }}>{Math.round(loc.speed || 0)}</td>
                                                        <td style={{ padding: '4px', textAlign: 'left', color: hasAddr ? '#334155' : '#94a3b8', fontSize: '0.7rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={loc.address || '주소 확인 필요'}>{loc.address || '확인 필요'}</span>
                                                                {!hasAddr && (
                                                                    <button style={{ padding: '2px 4px', fontSize: '0.65rem', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); fetchMissingAddress(loc, realIndex); }}>확인</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '4px', color: '#cbd5e1', fontSize: '0.65rem', letterSpacing: '-0.5px' }}>
                                                            {loc.lat.toFixed(4)}<br />{loc.lng.toFixed(4)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* 공지 작성 모달 팝업 위치 변경 (하단으로 옮김) */}
            {showWriteModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalBox} style={{ maxWidth: '700px', width: '95%', position: 'relative' }}>
                        {alertMsg && (
                            <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: '#fff', padding: '10px 20px', borderRadius: '8px', zIndex: 99999, fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                {alertMsg}
                            </div>
                        )}
                        <div className={styles.modalHeader}>
                            <h3>{newNotice.isEmergency ? (newNotice.id ? '🚨 긴급알림 수정' : '🚨 긴급알림 발송') : (newNotice.id ? '📝 공지사항 수정' : '📝 새 공지사항 작성')}</h3>
                            <button onClick={() => { setShowWriteModal(false); setNewNotice({ title: '', content: '', target: '전체', isEmergency: false, category: '일반공지' }); }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                        </div>
                        <div className={styles.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '80vh', overflowY: 'auto' }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{newNotice.isEmergency ? '긴급알림 제목' : '공지 제목'}</label>
                                <input
                                    className={styles.modalInput}
                                    placeholder="제목을 입력하세요"
                                    value={newNotice.title}
                                    onChange={e => setNewNotice({ ...newNotice, title: e.target.value })}
                                />
                            </div>

                            {!newNotice.isEmergency && (
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>분류 (카테고리)</label>
                                        <select
                                            className={styles.modalSelect}
                                            value={newNotice.category || '일반공지'}
                                            onChange={e => setNewNotice({ ...newNotice, category: e.target.value })}
                                        >
                                            <option value="일반공지">일반공지</option>
                                            <option value="작업안내">작업안내</option>
                                            <option value="안전교육">안전교육</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>공지 대상</label>
                                        <select
                                            className={styles.modalSelect}
                                            value={newNotice.target}
                                            onChange={e => setNewNotice({ ...newNotice, target: e.target.value })}
                                        >
                                            <option value="전체">전체 (모든 기사)</option>
                                            <option value="계약차량">계약차량 (소속 운전원)</option>
                                            <option value="미계약차량">미계약차량 (외부 기사)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>{newNotice.isEmergency ? '긴급 메시지' : '공지 내용'}</label>
                                <ReactQuill
                                    theme="snow"
                                    value={newNotice.content}
                                    onChange={val => setNewNotice({ ...newNotice, content: val })}
                                    style={{ height: 250, marginBottom: 40 }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button className={styles.saveBtn} onClick={handleSaveNotice} style={{ flex: 1, background: newNotice.isEmergency ? '#ef4444' : '#2563eb', height: 44 }}>
                                    {newNotice.id ? '수정 완료' : (newNotice.isEmergency ? '긴급알림 발송' : '공지작성')}
                                </button>
                                <button className={styles.filterResetBtn} onClick={() => { setShowWriteModal(false); setNewNotice({ title: '', content: '', target: '전체', isEmergency: false, category: '일반공지' }); }} style={{ height: 44, padding: '0 20px', borderRadius: 8 }}>닫기</button>
                                {newNotice.id && (
                                    <button className={styles.filterResetBtn} onClick={() => handleDeleteNotice(newNotice.id, newNotice.isEmergency)} style={{ height: 44, padding: '0 20px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 8, fontWeight: 700 }}>🗑️ 삭제</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isDetailLoading && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className={styles.loading}><div className={styles.spinner}></div></div>
                    <div style={{ marginTop: 10, fontWeight: 700, color: '#1e293b' }}>데이터를 불러오는 중입니다...</div>
                </div>
            )}

            {/* 신규 사진 원본 뷰어 팝업 */}
            {viewingPhotoUrl && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 99999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden'
                    }}
                    onWheel={(e) => {
                        const dir = Math.sign(e.deltaY) * -1;
                        setZoomInfo(prev => ({ ...prev, scale: Math.min(Math.max(1, prev.scale + dir * 0.1), 5) }));
                    }}
                    onMouseDown={(e) => {
                        isDraggingRef.current = true;
                        dragStartRef.current = { x: e.clientX - zoomInfo.x, y: e.clientY - zoomInfo.y };
                    }}
                    onMouseMove={(e) => {
                        if (!isDraggingRef.current) return;
                        setZoomInfo(prev => ({ ...prev, x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }));
                    }}
                    onMouseUp={() => { isDraggingRef.current = false; }}
                    onMouseLeave={() => { isDraggingRef.current = false; }}
                >
                    <button
                        style={{ position: 'absolute', top: 20, right: 30, fontSize: '2.5rem', color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 100000 }}
                        onClick={() => { setViewingPhotoUrl(null); setZoomInfo({ scale: 1, x: 0, y: 0 }); }}
                    >×</button>
                    <button
                        style={{ position: 'absolute', top: 30, right: 90, fontSize: '0.9rem', fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '6px 14px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer', zIndex: 100000 }}
                        onClick={() => { setZoomInfo({ scale: 1, x: 0, y: 0 }); }}
                    >초기화</button>
                    <img
                        src={viewingPhotoUrl}
                        style={{
                            transform: `translate(${zoomInfo.x}px, ${zoomInfo.y}px) scale(${zoomInfo.scale})`,
                            transition: isDraggingRef.current ? 'none' : 'transform 0.1s ease-out',
                            maxHeight: '90vh', maxWidth: '90vw',
                            objectFit: 'contain', cursor: isDraggingRef.current ? 'grabbing' : 'grab',
                            pointerEvents: 'none', userSelect: 'none'
                        }}
                        alt="Zoomed"
                        draggable={false}
                    />
                </div>
            )}
        </div>
    );
}








