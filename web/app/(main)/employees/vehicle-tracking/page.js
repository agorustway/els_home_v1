'use client';

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// [신규] 에디터 동적 로딩 (SSR 방지)
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';
import styles from './tracking.module.css';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@/constants/vehicleTracking';
import { createClient } from '@/utils/supabase/client';
import { displaySpeedKmh, filterRouteLocations, haversineKm, prepareLiveTrips, toTripTime } from '@/utils/vehicleLocation.mjs';
import { extractYouTubeUrls, parseEducationLogTitle, toYouTubeEmbedUrl } from '@/utils/vehicleEducation.mjs';
import { cargoTypeLabel, contractTypeLabel } from '@/utils/vehicleCargoOptions.mjs';

const supabase = createClient();
const ADDRESS_CACHE = new Map(); // [신규] 중복 조회 방지용 캐시 (토큰 절약)
const LIVE_DEFAULT_ZOOM = 13;
const LIVE_FOCUS_ZOOM = 15;
const RECORDS_PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_RECORDS_PAGE_SIZE = 20;
const DETAIL_LOCATION_LIST_LIMIT = 60;

function animateMarker(marker, fromLat, fromLng, toLat, toLng, duration = 650) {
    const start = performance.now();
    const step = (now) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const lat = fromLat + (toLat - fromLat) * ease;
        const lng = fromLng + (toLng - fromLng) * ease;
        marker.setPosition(new naver.maps.LatLng(lat, lng));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function setMarkerPositionSmooth(marker, pos, duration = 650) {
    const prev = marker.getPosition?.();
    if (!prev) {
        marker.setPosition(pos);
        return;
    }
    const prevLat = prev.lat();
    const prevLng = prev.lng();
    const nextLat = pos.lat();
    const nextLng = pos.lng();
    const dist = Math.abs(prevLat - nextLat) + Math.abs(prevLng - nextLng);
    if (dist > 0.000001 && dist < 0.5) animateMarker(marker, prevLat, prevLng, nextLat, nextLng, duration);
    else marker.setPosition(pos);
}

export default function VehicleTrackingPage() {
    // 탭 상태
    const [activeTab, setActiveTab] = useState('live'); // 'live' | 'records' | 'education'
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);

    // 상세 조회 상태
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [selectedTripLocations, setSelectedTripLocations] = useState([]);
    const [selectedMatchedPath, setSelectedMatchedPath] = useState([]);
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
    const liveMarkersRef = useRef(new Map()); // 실시간 운영 차량 마커 (tripId → { marker, infoWindow })
    const liveMarkerZoomRef = useRef({ tripId: null, zoomed: false });
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
    const [cargoGroupFilter, setCargoGroupFilter] = useState('all');
    const [contractGroupFilter, setContractGroupFilter] = useState('all');
    const [partnerCompanyFilter, setPartnerCompanyFilter] = useState('all');

    // [신규] 공지사항/긴급 페이징 상태
    const [noticePage, setNoticePage] = useState(1);
    const [emergencyPage, setEmergencyPage] = useState(1);
    const NOTICE_LIMIT = 3;
    const EM_LIMIT = 3;

    // 모바일 리스트 팝업 토글
    const [isMobileListOpen, setIsMobileListOpen] = useState(false);

    useEffect(() => {
        const syncViewport = () => setIsMobileViewport(window.matchMedia('(max-width: 768px)').matches);
        syncViewport();
        window.addEventListener('resize', syncViewport);
        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    useEffect(() => {
        setIsMobileListOpen(false);
    }, [activeTab]);

    // 운행 기록 (검색/필터)
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [recordsTotal, setRecordsTotal] = useState(0);
    const [recordsPage, setRecordsPage] = useState(1);
    const [recordsPageSize, setRecordsPageSize] = useState(DEFAULT_RECORDS_PAGE_SIZE);
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
                            mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60, maxZoom: 12 });
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
            let res = await fetch(`${baseUrl}/api/vehicle-tracking?mode=active`);
            if (!res.ok && !baseUrl) {
                res = await fetch('/api/vehicle-tracking/trips?mode=active');
            }
            const data = await res.json();
            const rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.trips) ? data.trips : []);
            if (rows.length > 0) {
                setLiveTrips(prepareLiveTrips(rows));
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
                : {
                    id: newNotice.id,
                    title: newNotice.title,
                    content: newNotice.content,
                    target: newNotice.target,
                    category: newNotice.category,
                    status: '공지중',
                    attachments: newNotice.attachments || [],
                    education_url: newNotice.education_url || '',
                };

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
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setLoading(true);
        try {
            const uploaded = [];
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', '/공지사항_첨부');

                const res = await fetch('/api/nas/files', { method: 'POST', body: formData });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || '업로드 실패');
                uploaded.push({ name: file.name, url: `/api/nas/files?download=true&path=${encodeURIComponent(d.path)}&name=${encodeURIComponent(file.name)}`, type: file.type });
            }

            setNewNotice(prev => ({
                ...prev,
                attachments: [...(prev.attachments || []), ...uploaded]
            }));
            alert(`파일 ${uploaded.length}개가 업로드되었습니다.`);
        } catch (e) { alert('파일 업로드 실패: ' + e.message); }
        finally { setLoading(false); e.target.value = ''; }
    };

    // ─── 2. 상세 경로 조회 ───
    const drawTripPath = (locations, retries = 5, options = {}) => {
        // [v4.5.12][Fix] naver 전역 + mapRef 동시 체크 — 미초기화 시 retry
        if (!window.naver?.maps || !mapInstanceRef.current || !locations?.length) {
            if (retries > 0 && locations?.length) {
                setTimeout(() => drawTripPath(locations, retries - 1, options), 300);
            }
            return;
        }
        const map = mapInstanceRef.current;
        if (polylineRef.current) polylineRef.current.setMap(null);
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];

        const filteredLocs = options.alreadyMatched ? locations : filterRouteLocations(locations);
        const isCompletedRoute = options.isCompleted !== false;
        const endMarkerColor = isCompletedRoute ? '#ef4444' : '#2563eb';
        const endMarkerLabel = isCompletedRoute ? 'E' : 'C';

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
            if (options.alreadyMatched && !isStart && !isEnd) return;
            
            // 시작과 끝 마커는 별도 처리, 중간 지점들만 주소 중복 체크
            if (!isStart && !isEnd) {
                const distFromLast = lastMarkedPos ? haversineKm(lastMarkedPos.lat, lastMarkedPos.lng, l.lat, l.lng) : 999;
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
                        `<div style="width:32px;height:32px;background:${endMarkerColor};border:3px solid #fff;border-radius:50%;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:900;z-index:999;">${endMarkerLabel}</div>` :
                        '<div style="width:12px;height:12px;background:#3b82f6;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>',
                    anchor: new naver.maps.Point(isStart || isEnd ? 16 : 6, isStart || isEnd ? 16 : 6)
                },
                zIndex: isStart || isEnd ? 1000 : 100,
                title: l.address || '이동 지점'
            });
            markersRef.current.push(pointMarker);
        });

        if (options.fitBounds !== false) {
            map.fitBounds(bounds, { top: 100, right: 100, bottom: 100, left: 100, maxZoom: options.maxZoom || 14 });
        }
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
                let res = await fetch(`${baseUrl}/api/vehicle-tracking?mode=active`);
                if (!res.ok && !baseUrl) {
                    res = await fetch('/api/vehicle-tracking/trips?mode=active');
                }
                const data = await res.json();
                const rows = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.trips) ? data.trips : []);
                setLiveTrips(prepareLiveTrips(rows));

                // LIVE 중에는 위치 목록만 갱신한다. 경로 재그리기는 카메라를 되돌리므로 완료 운행에서만 수행한다.
                if (tripId && window.location.pathname.includes('/vehicle-tracking')) {
                    const locRes = await fetch(`/api/vehicle-tracking/trips/${tripId}/locations`);
                    const locData = await locRes.json();
                    if (locData.locations && locData.locations.length > 0) {
                        const cleanLocations = filterRouteLocations(locData.locations);
                        setSelectedTripLocations(cleanLocations);
                        setSelectedMatchedPath([]);
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
        setSelectedTrip(trip); // 클릭 즉시 기본 정보로 UI 전환
        setSelectedTripLocations([]);
        setSelectedMatchedPath([]);
        setTripLogs([]);

        try {
            const [tripRes, logRes] = await Promise.all([
                fetch(`/api/vehicle-tracking/trips/${trip.id}`),
                fetch(`/api/vehicle-tracking/trips/${trip.id}/logs`)
            ]);

            const tripData = await tripRes.json();
            const detailTrip = tripData && !tripData.error ? tripData : trip;
            if (tripData && !tripData.error) setSelectedTrip(tripData);

            const isCompletedTrip = detailTrip.status === 'completed';
            const locEndpoint = isCompletedTrip
                ? `/api/vehicle-tracking/trips/${trip.id}/matched-route`
                : `/api/vehicle-tracking/trips/${trip.id}/locations`;
            const locRes = await fetch(locEndpoint);
            const locData = await locRes.json();
            if (locData.locations) {
                const locations = filterRouteLocations(locData.locations);
                const matchedPath = isCompletedTrip && Array.isArray(locData.matchedPath) && locData.matchedPath.length >= 2
                    ? locData.matchedPath
                    : locations;

                setSelectedTripLocations(locations);
                setSelectedMatchedPath(isCompletedTrip ? matchedPath : []);
                if (isCompletedTrip) {
                    drawTripPath(matchedPath, 5, { alreadyMatched: locData.source === 'naver-directions15', isCompleted: true, fitBounds: true });
                } else {
                    if (polylineRef.current) {
                        polylineRef.current.setMap(null);
                        polylineRef.current = null;
                    }
                    markersRef.current.forEach(m => m?.setMap?.(null));
                    markersRef.current = [];
                }

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

            const pathSource = selectedMatchedPath.length >= 2 ? selectedMatchedPath : selectedTripLocations;
            if (!pathSource || !Array.isArray(pathSource) || pathSource.length === 0) return;

            let validLocs = pathSource.filter(l => l && typeof l.lat === 'number' && typeof l.lng === 'number');
            if (validLocs.length === 0) return;

            if (selectedMatchedPath.length < 2) {
                validLocs.sort((a, b) => {
                    const dateA = new Date(a.timestamp || a.recorded_at);
                    const dateB = new Date(b.timestamp || b.recorded_at);
                    return dateA - dateB;
                });
            }

            const filteredLocs = selectedMatchedPath.length >= 2 ? validLocs : filterRouteLocations(validLocs);
            
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
                map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30, maxZoom: 14 });
                miniMapInstanceRef.current._hasFitBounds = true;
            }
        };

        tryDraw();
        return () => {
            if (timerId) clearTimeout(timerId);
            if (miniMapInstanceRef.current) miniMapInstanceRef.current._hasFitBounds = false;
        };
    }, [selectedTrip, selectedTripLocations, selectedMatchedPath, realtimeTarget]);

    // [신규] 안드로이드 뒤로가기 버튼 연동 (Hash를 통한 사이드이펙트 방지)
    useEffect(() => {
        const isModalOpen = selectedTrip !== null;

        if (isModalOpen) {
            if (window.location.hash !== '#detail') {
                window.location.hash = 'detail';
            }

            const handleHashChange = () => {
                if (window.location.hash !== '#detail') {
                    miniMapInstanceRef.current = null;
                    setSelectedTrip(null);
                }
            };

            window.addEventListener('hashchange', handleHashChange);
            
            return () => {
                window.removeEventListener('hashchange', handleHashChange);
                // 모달이 완전히 닫히는 경우에만 뒤로가기 처리 (다른 항목 클릭 시에는 무시)
                if (window.location.hash === '#detail') {
                    window.history.back();
                }
                // [신규] 모달 닫힐 때 미니맵 인스턴스 초기화 (다음 모달에서 지도 깨짐 방지)
                miniMapInstanceRef.current = null;
            };
        }
    }, [selectedTrip !== null]);

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

            const scriptId = 'naver-map-script-v3';
            if (document.getElementById(scriptId)) return;
            const script = document.createElement('script');
            script.id = scriptId;
            // [v4.5.37] ncpClientId -> ncpKeyId 로 변경 (네트워크 페이지와 100% 동일하게 맞춰서 인증 해결)
            script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`;
            script.async = true;
            script.defer = true;
            script.onload = () => { handleInit(); };
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

    // 실시간 마커 업데이트 — Map으로 재활용하여 깜빡임 방지 + 부드러운 위치 이동
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current || activeTab !== 'live') return;
        const map = mapInstanceRef.current;
        const markerMap = liveMarkersRef.current;

        const generateInfoWindowHtml = (trip, loc, markerColor) => `
            <div style="padding:16px; min-width:240px; font-family:'Pretendard',sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <div style="font-size:16px; font-weight:800; color:#1e293b; margin-bottom:2px;">${trip.driver_name}</div>
                        <div style="font-size:11px; font-weight:600; color:#64748b;">${trip.vehicle_number}</div>
                        <div style="font-size:11px; font-weight:700; color:#0284c7; margin-top:2px;">${trip.branch || trip.partner_company || '-'} · ${contractTypeLabel(trip.driver_contract_type || trip.contract_type || 'uncontracted')}</div>
                    </div>
                    <span style="font-size:10px; font-weight:800; padding:3px 8px; border-radius:6px; background:${markerColor}15; color:${markerColor}; border:1px solid ${markerColor}40;">${TRIP_STATUS_LABELS[trip.status]}</span>
                </div>
                <div style="padding:10px; background:#f8fafc; border-radius:10px; font-size:13px; color:#334155; line-height:1.5; border:1px solid #f1f5f9; margin-top:4px;">
                    <span style="display:block; font-weight:800; color:#0ea5e9; font-size:10px; margin-bottom:4px; text-transform:uppercase;">Current Location</span>
                    <div style="font-weight:700; color:#0f172a; margin-bottom:2px;">
                        ${loc.address || '주소 정보 확인 중...'}
                    </div>
                    <div style="font-weight:700; color:#3b82f6; font-size:11px;">
                        현재 속도: ${displaySpeedKmh(loc.speed)} km/h
                    </div>
                </div>
                ${!loc.address ? `<div style="font-size:9px; color:#94a3b8; margin-top:6px; text-align:right;">(좌표: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})</div>` : ''}
            </div>
        `;

        const tripsWithLocation = prepareLiveTrips(liveTrips).filter(t => (
            t.lastLocation &&
            (cargoGroupFilter === 'all' || (t.cargo_type || 'container') === cargoGroupFilter) &&
            (contractGroupFilter === 'all' || (t.driver_contract_type || t.contract_type || 'uncontracted') === contractGroupFilter) &&
            (contractGroupFilter !== 'partner' || partnerCompanyFilter === 'all' || (t.partner_company || '') === partnerCompanyFilter) &&
            (!liveSearchKeyword ||
                (t.vehicle_number || '').includes(liveSearchKeyword) ||
                (t.driver_name || '').includes(liveSearchKeyword) ||
                (t.container_number || '').includes(liveSearchKeyword) ||
                (t.cargo_item || '').includes(liveSearchKeyword))
        ));

        const visibleIds = new Set(tripsWithLocation.map(t => t.id));

        // 사라진 마커 제거
        for (const [id, entry] of markerMap) {
            if (!visibleIds.has(id)) {
                entry.marker.setMap(null);
                markerMap.delete(id);
            }
        }

        const bounds = new naver.maps.LatLngBounds();

        tripsWithLocation.forEach(trip => {
            const loc = trip.lastLocation;
            const pos = new naver.maps.LatLng(loc.lat, loc.lng);
            bounds.extend(pos);
            const isDriving = trip.status === 'driving';
            const isPaused = trip.status === 'paused';
            const markerColor = isDriving ? '#10b981' : (isPaused ? '#f59e0b' : '#6b7280');
            const vNum = trip.vehicle_number || '';
            const vLabel = vNum.length >= 4 ? vNum.slice(-4) : vNum;
            const baseZ = isDriving ? 300000 : (isPaused ? 200000 : 100000);
            const timeVal = (toTripTime(trip) / 10000) % 100000;
            const markerZIndex = Math.floor(baseZ + timeVal);

            const iconHtml = `<div style="min-width:38px;height:24px;padding:0 6px;background:${markerColor};border:2px solid #fff;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;white-space:nowrap;letter-spacing:0.5px;">${vLabel || '───'}</div>`;

            if (markerMap.has(trip.id)) {
                // 기존 마커 재활용 — 위치만 부드럽게 이동
                const entry = markerMap.get(trip.id);
                setMarkerPositionSmooth(entry.marker, pos);
                entry.marker.setIcon({ content: iconHtml, anchor: new naver.maps.Point(22, 12) });
                entry.marker.setZIndex(markerZIndex);
                entry.infoWindow?.setContent(generateInfoWindowHtml(trip, loc, markerColor));
                entry.trip = trip;
                entry.loc = loc;
                entry.markerColor = markerColor;
            } else {
                // 신규 마커 생성
                const marker = new naver.maps.Marker({
                    position: pos, map,
                    zIndex: markerZIndex,
                    icon: { content: iconHtml, anchor: new naver.maps.Point(22, 12) },
                });

                const infoWindow = new naver.maps.InfoWindow({
                    content: generateInfoWindowHtml(trip, loc, markerColor),
                    borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff'
                });
                const entry = { marker, infoWindow, trip, loc, markerColor };

                naver.maps.Event.addListener(marker, 'click', () => {
                    const currentTrip = entry.trip;
                    const currentLoc = entry.loc;
                    const currentMarkerColor = entry.markerColor;
                    const currentPos = new naver.maps.LatLng(currentLoc.lat, currentLoc.lng);
                    if (infoWindowRef.current) infoWindowRef.current.close();
                    handleSelectTrip(currentTrip);
                    if (currentTrip.status === 'driving' || currentTrip.status === 'paused') {
                        startRealtimeTracking(currentTrip.id);
                    }
                    if (!currentLoc.address && window.naver?.maps?.Service) {
                        naver.maps.Service.reverseGeocode({
                            coords: new naver.maps.LatLng(currentLoc.lat, currentLoc.lng),
                            orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
                        }, (status, response) => {
                            if (status === naver.maps.Service.Status.OK) {
                                currentLoc.address = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                                infoWindow.setContent(generateInfoWindowHtml(currentTrip, currentLoc, currentMarkerColor));
                            }
                        });
                    }
                    infoWindow.open(map, marker);
                    infoWindowRef.current = infoWindow;

                    const prevZoomState = liveMarkerZoomRef.current;
                    const isSameFocused = String(prevZoomState.tripId) === String(currentTrip.id) && prevZoomState.zoomed;
                    if (isSameFocused) {
                        map.setZoom(LIVE_DEFAULT_ZOOM);
                        liveMarkerZoomRef.current = { tripId: currentTrip.id, zoomed: false };
                    } else {
                        map.setZoom(LIVE_FOCUS_ZOOM);
                        liveMarkerZoomRef.current = { tripId: currentTrip.id, zoomed: true };
                    }
                    map.panTo(currentPos, { duration: 300, easing: 'easeOutCubic' });
                });

                markerMap.set(trip.id, entry);
            }

            // 실시간 추적 중인 차량이면 지도 중심 부드럽게 따라감 (네비게이션 모드)
            // realtimeTarget은 강조 상태만 유지하고 지도 중심은 사용자의 포커스 버튼에서만 이동한다.
        });
    }, [liveTrips, mapReady, activeTab, cargoGroupFilter, contractGroupFilter, partnerCompanyFilter, liveSearchKeyword, realtimeTarget]);

    // 운행 기록 검색
    const fetchRecords = useCallback(async (pageOverride = recordsPage) => {
        setRecordsLoading(true);
        try {
            const params = new URLSearchParams({ mode: 'all' });
            params.set('page', String(pageOverride));
            params.set('page_size', String(recordsPageSize));
            if (activeTab === 'education') params.set('education_only', '1');
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
    }, [activeTab, filterStatus, filterKeyword, filterFrom, filterTo, recordsPage, recordsPageSize]);

    useEffect(() => {
        setRecordsPage(1);
    }, [activeTab]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);


    const handleSearch = async () => {
        if (recordsPage !== 1) {
            setRecordsPage(1);
            return;
        }
        await fetchRecords(1);
    };
    const handleReset = () => {
        setFilterStatus('all');
        setFilterKeyword('');
        setFilterFrom('');
        setFilterTo('');
        setRecordsPage(1);
    };

    const handleDeleteRecord = async (id) => {
        if (!confirm('이 운행 기록을 삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('삭제 실패');
            setRecords(prev => prev.filter(t => t.id !== id));
            setRecordsTotal(prev => Math.max(0, prev - 1));
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
            setRecordsTotal(prev => Math.max(0, prev - selectedIds.length));
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
        if (filteredRecordIds.length === 0) return;
        const allVisibleSelected = filteredRecordIds.every(id => selectedIds.includes(id));
        if (allVisibleSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredRecordIds);
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
            const speed = displaySpeedKmh(loc.speed);
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
        if (status === 'driving') return '●';
        if (status === 'paused') return '◐';
        return '○';
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

    const getTripDistance = (trip) => {
        const value = Number(trip.distance_km ?? trip.route_distance_km);
        if (!Number.isFinite(value) || value <= 0) return '';
        return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} km`;
    };

    const getTripMaxSpeed = (trip) => {
        const value = Number(trip?.max_speed ?? trip?.maxSpeed);
        if (!Number.isFinite(value) || value <= 0) return '-';
        return `${Math.round(value)} km/h`;
    };

    const formatLocationCoords = (loc) => {
        if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) return '';
        return `${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}`;
    };

    const getTripFinalLocation = (trip) => {
        const loc = trip?.lastLocation || null;
        const address = trip?.last_location_address || loc?.address || '';
        const coords = formatLocationCoords(loc);
        const time = loc?.timestamp || loc?.recorded_at ? formatDateTime(loc.timestamp || loc.recorded_at) : '';
        return {
            title: address || (coords ? `좌표 ${coords}` : '-'),
            meta: [time, coords].filter(Boolean).join(' · '),
        };
    };

    const displayTripLocations = useMemo(() => {
        if (!Array.isArray(selectedTripLocations)) return [];
        return selectedTripLocations.slice(-DETAIL_LOCATION_LIST_LIMIT);
    }, [selectedTripLocations]);
    const hiddenTripLocationCount = Math.max(0, selectedTripLocations.length - displayTripLocations.length);

    const educationRows = useMemo(() => {
        return records.flatMap(trip => (trip.education_logs || []).map(log => ({ trip, log })));
    }, [records]);

    const recordSummary = useMemo(() => {
        const amount = records.reduce((sum, trip) => sum + (Number(trip.billing_amount) || 0), 0);
        const vehicleSet = new Set(records.map(t => t.vehicle_number).filter(Boolean));
        return { count: recordsTotal, pageCount: records.length, amount, vehicles: vehicleSet.size };
    }, [records, recordsTotal]);

    const toggleTripClosed = async (trip) => {
        const nextClosed = !trip.is_closed;
        if (!confirm(nextClosed ? '이 운행기록을 마감 완료 처리할까요? 기사 앱 수정이 제한됩니다.' : '마감을 해제할까요?')) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${trip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_closed: nextClosed, source: 'web', closed_by: 'web' }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || '마감 처리 실패');
            setRecords(prev => prev.map(t => t.id === trip.id ? { ...t, ...data.trip } : t));
            if (selectedTrip?.id === trip.id) setSelectedTrip(prev => ({ ...prev, ...data.trip }));
        } catch (e) {
            alert(e.message);
        }
    };

    const saveBillingAmount = async (trip, rawValue) => {
        const amount = Number(String(rawValue || '').replace(/[^0-9]/g, '')) || null;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${trip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billing_amount: amount, source: 'web', admin_edit: true }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || '금액 수정 실패');
            const adminFields = [...new Set([...(trip.admin_edited_fields || []), 'billing_amount'])];
            setRecords(prev => prev.map(t => t.id === trip.id ? { ...t, billing_amount: amount, admin_edited_fields: adminFields } : t));
            if (selectedTrip?.id === trip.id) setSelectedTrip(prev => ({ ...prev, billing_amount: amount, admin_edited_fields: adminFields }));
        } catch (e) {
            alert(e.message);
        }
    };

    // [v5.10.42] 범용 필드 저장 (관리자 인라인 편집용)
    const saveTripField = async (trip, fieldName, value) => {
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${trip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [fieldName]: value, source: 'web', admin_edit: true }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || '수정 실패');
            const adminFields = [...new Set([...(trip.admin_edited_fields || []), fieldName])];
            setRecords(prev => prev.map(t => t.id === trip.id ? { ...t, [fieldName]: value, admin_edited_fields: adminFields } : t));
            if (selectedTrip?.id === trip.id) setSelectedTrip(prev => ({ ...prev, [fieldName]: value, admin_edited_fields: adminFields }));
        } catch (e) {
            alert(e.message);
        }
    };

    // [신규] 실시간 관제 리스트 줌 이동
    const handleZoomToLiveTrip = (trip) => {
        if (!mapInstanceRef.current || !trip.lastLocation) return;
        const loc = trip.lastLocation;
        const pos = new window.naver.maps.LatLng(loc.lat, loc.lng);
        mapInstanceRef.current.panTo(pos, { duration: 350, easing: 'easeOutCubic' });
        mapInstanceRef.current.setZoom(LIVE_FOCUS_ZOOM);
        liveMarkerZoomRef.current = { tripId: trip.id, zoomed: true };
        window.scrollTo({ top: 0, behavior: 'smooth' }); // 상단 지도로 스크롤
    };

    const activeCount = (liveTrips || []).filter(t => t && t.status === 'driving').length;
    const pausedCount = (liveTrips || []).filter(t => t && t.status === 'paused').length;

    const matchesGroup = (t) => {
        if (!t) return false;
        if (cargoGroupFilter !== 'all' && (t.cargo_type || 'container') !== cargoGroupFilter) return false;
        if (contractGroupFilter !== 'all' && (t.driver_contract_type || t.contract_type || 'uncontracted') !== contractGroupFilter) return false;
        if (contractGroupFilter === 'partner' && partnerCompanyFilter !== 'all' && (t.partner_company || '') !== partnerCompanyFilter) return false;
        return true;
    };

    const filteredLiveTrips = prepareLiveTrips(liveTrips || []).filter(t =>
        matchesGroup(t) && (
            !liveSearchKeyword ||
            (t.vehicle_number || '').includes(liveSearchKeyword) ||
            (t.driver_name || '').includes(liveSearchKeyword) ||
            (t.container_number || '').includes(liveSearchKeyword) ||
            (t.cargo_item || '').includes(liveSearchKeyword)
        )
    );
    const filteredRecords = records.filter(matchesGroup);
    const filteredRecordIds = filteredRecords.map(r => r.id);
    const recordsTotalPages = Math.max(1, Math.ceil(recordsTotal / recordsPageSize));
    const recordsPageStart = recordsTotal === 0 ? 0 : ((recordsPage - 1) * recordsPageSize) + 1;
    const recordsPageEnd = Math.min(recordsPage * recordsPageSize, recordsTotal);
    const recordsPageLabel = recordsTotal === 0
        ? '0건'
        : `${recordsPageStart.toLocaleString('ko-KR')}-${recordsPageEnd.toLocaleString('ko-KR')} / ${recordsTotal.toLocaleString('ko-KR')}건`;
    const currentPageRowCount = activeTab === 'education' ? educationRows.length : filteredRecords.length;
    const goRecordsPage = (nextPage) => {
        const safePage = Math.min(recordsTotalPages, Math.max(1, nextPage));
        if (safePage !== recordsPage) setRecordsPage(safePage);
    };
    useEffect(() => {
        if (recordsPage > recordsTotalPages) setRecordsPage(recordsTotalPages);
    }, [recordsPage, recordsTotalPages]);
    const partnerCompanyOptions = Array.from(new Set([...(liveTrips || []), ...(records || [])].map(t => t.partner_company).filter(Boolean))).sort();
    const now = new Date();
    const currentMonthRecords = records.filter(t => {
        const d = new Date(t.started_at || t.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const GroupButton = ({ active, onClick, children }) => (
        <button
            type="button"
            onClick={onClick}
            style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 8,
                border: active ? '1px solid #2563eb' : '1px solid #dbe3ef',
                background: active ? '#2563eb' : '#fff',
                color: active ? '#fff' : '#334155',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer',
            }}
        >
            {children}
        </button>
    );

    const RecordsPagination = () => (
        <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
                {recordsLoading ? '목록 불러오는 중' : `${recordsPageLabel} · 현재 페이지 ${currentPageRowCount.toLocaleString('ko-KR')}건`}
            </div>
            <div className={styles.paginationControls}>
                <select
                    className={styles.pageSizeSelect}
                    value={recordsPageSize}
                    onChange={(e) => {
                        setRecordsPage(1);
                        setRecordsPageSize(Number(e.target.value));
                    }}
                    aria-label="페이지당 표시 건수"
                >
                    {RECORDS_PAGE_SIZE_OPTIONS.map(size => (
                        <option key={size} value={size}>{size}개씩</option>
                    ))}
                </select>
                <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => goRecordsPage(recordsPage - 1)}
                    disabled={recordsLoading || recordsPage <= 1}
                >
                    이전
                </button>
                <span className={styles.pageIndicator}>{recordsPage} / {recordsTotalPages}</span>
                <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => goRecordsPage(recordsPage + 1)}
                    disabled={recordsLoading || recordsPage >= recordsTotalPages}
                >
                    다음
                </button>
            </div>
        </div>
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
                <h2>차량위치관제 {activeCount > 0 && <span className={styles.activeBadge}>{activeCount}</span>}</h2>
                <div className={styles.titleBtns}>
                    <button className={styles.refreshBtn} onClick={() => { setLoading(true); fetchLiveTrips(); if (activeTab === 'records') fetchRecords(); }}>새로고침</button>
                    <Link className={styles.policyLinkBtn} href="/employees/data-retention#vehicle">보존정책</Link>
                    <button className={styles.filterResetBtn} style={{ height: '36px', fontSize: '0.75rem', padding: '0 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => window.open('/api/debug/view', '_blank')}>실시간 로그</button>
                </div>
            </div>

            <div className={styles.tabNav}>
                <button className={`${styles.tab} ${activeTab === 'live' ? styles.tabActive : ''}`} onClick={() => setActiveTab('live')}>실시간 관제</button>
                <button className={`${styles.tab} ${activeTab === 'records' ? styles.tabActive : ''}`} onClick={() => setActiveTab('records')}>운행 기록</button>
                <button className={`${styles.tab} ${activeTab === 'education' ? styles.tabActive : ''}`} onClick={() => setActiveTab('education')}>교육 이수</button>
            </div>

            <div style={{ display: activeTab === 'live' ? 'block' : 'none' }}>
                <div className={styles.missionDashboard} style={{ gap: '10px', marginBottom: '15px' }}>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>실시간 운행차량</div><div className={styles.statValue} style={{ color: '#10b981', fontSize: '2rem' }}>{activeCount} <span className={styles.statUnit}>대</span></div></div>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>일시정지</div><div className={styles.statValue} style={{ color: '#f59e0b', fontSize: '2rem' }}>{pausedCount} <span className={styles.statUnit}>대</span></div></div>
                    <div className={styles.statCard} style={{ padding: '1rem' }}><div className={styles.statLabel}>{new Date().getMonth() + 1}월 전체 운행</div><div className={styles.statValue} style={{ fontSize: '2rem' }}>{currentMonthRecords.length} <span className={styles.statUnit}>건</span></div></div>
                </div>

                <div className={styles.filterBar} style={{ marginBottom: 12, alignItems: 'center', background: '#fff' }}>
                    <span className={styles.filterLabel} style={{ borderRight: 'none', paddingRight: 0 }}>관제 그룹</span>
                    <GroupButton active={cargoGroupFilter === 'all'} onClick={() => setCargoGroupFilter('all')}>전체</GroupButton>
                    <GroupButton active={cargoGroupFilter === 'container'} onClick={() => setCargoGroupFilter('container')}>컨테이너</GroupButton>
                    <GroupButton active={cargoGroupFilter === 'general'} onClick={() => setCargoGroupFilter('general')}>일반화물</GroupButton>
                    <span style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' }} />
                    <GroupButton active={contractGroupFilter === 'all'} onClick={() => setContractGroupFilter('all')}>전체</GroupButton>
                    <GroupButton active={contractGroupFilter === 'contracted'} onClick={() => setContractGroupFilter('contracted')}>계약</GroupButton>
                    <GroupButton active={contractGroupFilter === 'uncontracted'} onClick={() => setContractGroupFilter('uncontracted')}>미계약</GroupButton>
                    <GroupButton active={contractGroupFilter === 'partner'} onClick={() => setContractGroupFilter('partner')}>협력사</GroupButton>
                    {contractGroupFilter === 'partner' && (
                        <select className={styles.filterSelect} value={partnerCompanyFilter} onChange={e => setPartnerCompanyFilter(e.target.value)}>
                            <option value="all">전체 협력사</option>
                            {partnerCompanyOptions.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    )}
                    <input className={styles.filterInput} placeholder="현재 운행 기사명/차량/컨테이너/화물명 검색" value={liveSearchKeyword} onChange={e => setLiveSearchKeyword(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
                    <button className={styles.filterResetBtn} onClick={() => { setLiveSearchKeyword(''); setCargoGroupFilter('all'); setContractGroupFilter('all'); setPartnerCompanyFilter('all'); }}>초기화</button>
                </div>

                <div className={styles.liveGrid}>
                    <div className={styles.liveGridRight}>
                        <div className={`${styles.mapContainer} ${isFullscreen ? styles.mapFullscreen : ''}`} style={{ height: '100%', margin: 0, borderRadius: '12px' }}>
                            {!isFullscreen && (
                                <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, display: 'flex', flexDirection: 'row', gap: 8 }}>
                                    <button className={styles.fullscreenBtn} style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '6px 12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} onClick={() => setIsFullscreen(true)}>
                                        지도 전체화면
                                    </button>
                                </div>
                            )}
                            {isFullscreen && (
                                <>
                                    <div style={{ position: 'absolute', top: isMobileViewport ? 8 : 12, left: 12, right: isMobileViewport ? 12 : 390, zIndex: 2002, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxHeight: isMobileViewport ? '30dvh' : 'none', overflowY: isMobileViewport ? 'auto' : 'visible', background: 'rgba(255,255,255,0.96)', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', boxShadow: '0 8px 20px rgba(15,23,42,0.12)' }}>
                                        <button className={styles.fullscreenBtn} style={{ position: 'relative', top: 'auto', left: 'auto', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsFullscreen(false)}>
                                            X 전체화면 닫기
                                        </button>
                                        <button className={styles.fullscreenBtn} style={{ position: 'relative', top: 'auto', left: 'auto', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => {
                                            if (!mapInstanceRef.current) return;
                                            if (realtimeTarget || selectedTrip) {
                                                const trip = liveTrips.find(t => t.id === (realtimeTarget || selectedTrip?.id));
                                                if (trip && trip.lastLocation) {
                                                    mapInstanceRef.current.setCenter(new window.naver.maps.LatLng(trip.lastLocation.lat, trip.lastLocation.lng));
                                                    mapInstanceRef.current.setZoom(13);
                                                }
                                            } else {
                                                const bounds = new window.naver.maps.LatLngBounds();
                                                filteredLiveTrips.forEach(t => {
                                                    if (t.lastLocation) bounds.extend(new window.naver.maps.LatLng(t.lastLocation.lat, t.lastLocation.lng));
                                                });
                                                if (!bounds.isEmpty()) {
                                                    mapInstanceRef.current.fitBounds(bounds, { top: 30, right: isMobileViewport ? 30 : 380, bottom: isMobileViewport ? 230 : 30, left: 30, maxZoom: 12 });
                                                }
                                            }
                                        }}>
                                            포커스 맞추기
                                        </button>
                                        <span style={{ width: 1, height: 20, background: '#cbd5e1', margin: '0 4px' }} />
                                        <GroupButton active={cargoGroupFilter === 'all'} onClick={() => setCargoGroupFilter('all')}>전체보기</GroupButton>
                                        <GroupButton active={cargoGroupFilter === 'container'} onClick={() => setCargoGroupFilter('container')}>컨테이너</GroupButton>
                                        <GroupButton active={cargoGroupFilter === 'general'} onClick={() => setCargoGroupFilter('general')}>일반화물</GroupButton>
                                        <span style={{ width: 1, height: 20, background: '#e2e8f0' }} />
                                        <GroupButton active={contractGroupFilter === 'all'} onClick={() => setContractGroupFilter('all')}>전체</GroupButton>
                                        <GroupButton active={contractGroupFilter === 'contracted'} onClick={() => setContractGroupFilter('contracted')}>계약</GroupButton>
                                        <GroupButton active={contractGroupFilter === 'uncontracted'} onClick={() => setContractGroupFilter('uncontracted')}>미계약</GroupButton>
                                        <GroupButton active={contractGroupFilter === 'partner'} onClick={() => setContractGroupFilter('partner')}>협력사</GroupButton>
                                        {contractGroupFilter === 'partner' && (
                                            <select className={styles.filterSelect} value={partnerCompanyFilter} onChange={e => setPartnerCompanyFilter(e.target.value)} style={{ height: 34 }}>
                                                <option value="all">전체 협력사</option>
                                                {partnerCompanyOptions.map(name => <option key={name} value={name}>{name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div style={{ position: 'absolute', top: isMobileViewport ? 'auto' : 12, left: isMobileViewport ? 12 : 'auto', right: 12, bottom: 12, width: isMobileViewport ? 'auto' : 360, maxHeight: isMobileViewport ? '42dvh' : 'none', zIndex: 2002, background: 'rgba(255,255,255,0.97)', border: '1px solid #dbe3ef', borderRadius: 12, boxShadow: '0 12px 28px rgba(15,23,42,0.16)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0f172a' }}>운행현황</div>
                                            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#2563eb' }}>{filteredLiveTrips.length}대</div>
                                        </div>
                                        <div style={{ padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {filteredLiveTrips.length === 0 ? (
                                                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>표시할 차량이 없습니다.</div>
                                            ) : filteredLiveTrips.map(trip => (
                                                <button
                                                    key={`fs-${trip.id}`}
                                                    type="button"
                                                    onClick={() => { handleZoomToLiveTrip(trip); setRealtimeTarget(trip.id); }}
                                                    style={{ textAlign: 'left', background: realtimeTarget === trip.id ? '#ecfdf5' : '#fff', border: realtimeTarget === trip.id ? '1px solid #86efac' : '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                                        <strong style={{ color: '#0f172a' }}>{trip.vehicle_number || '-'}</strong>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>{contractTypeLabel(trip.driver_contract_type || trip.contract_type || 'uncontracted')}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 800 }}>{trip.driver_name || '-'} · {cargoTypeLabel(trip.cargo_type || 'container')}</div>
                                                    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.74rem', color: '#64748b' }}>
                                                        <span>속도 <b style={{ color: '#2563eb' }}>{displaySpeedKmh(trip.lastLocation?.speed)}km/h</b></span>
                                                        <span>시간 <b style={{ color: '#0f172a' }}>{getElapsedTimeString(trip.started_at, trip.completed_at)}</b></span>
                                                    </div>
                                                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', lineHeight: 1.35 }}>{trip.lastLocation?.address || '위치 정보 없음'}</div>
                                                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                                                        <span onClick={(e) => { e.stopPropagation(); handleSelectTrip(trip); }} style={{ padding: '4px 12px', fontSize: '0.72rem', border: '1px solid #cbd5e1', borderRadius: 4, background: '#f8fafc', color: '#334155', fontWeight: 800 }}>상세보기</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '12px' }} />
                            {!mapReady && <div className={styles.mapLoading}>지도를 불러오는 중...</div>}
                        </div>
                    </div>

                    <div className={styles.liveGridLeft}>
                        {/* 긴급 알림 섹션 */}
                        <div className={styles.noticeSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
                            <div className={styles.noticeHeader} style={{ marginBottom: '10px' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: '0.95rem' }}>긴급 알림</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{emergencyPage} / {totalEmPages}</div>
                                    <button onClick={() => setEmergencyPage(p => Math.max(1, p - 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>◀</button>
                                    <button onClick={() => setEmergencyPage(p => Math.min(totalEmPages, p + 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>▶</button>
                                    <button className={styles.writeNoticeBtn} style={{ height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#ef4444', borderColor: '#ef4444', padding: '0 10px', color: '#fff' }} onClick={() => { setNewNotice({ title: '', content: '', isEmergency: true }); setShowWriteModal(true); }}>글쓰기</button>
                                </div>
                            </div>
                            <div className={styles.tableCard} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                                <table className={styles.adminNoticeTable} style={{ margin: 0 }}>
                                    <thead><tr><th style={{ width: '120px', textAlign: 'center' }}>날짜</th><th>긴급 내용</th></tr></thead>
                                    <tbody>
                                        {paginatedEmergencies.length === 0 ? (
                                            <tr><td colSpan="2" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>발송된 알림이 없습니다.</td></tr>
                                        ) : (
                                            paginatedEmergencies.map(em => (
                                                <tr key={em.id} onClick={() => handleEditNotice(em, true)} style={{ cursor: 'pointer', background: '#fef2f2' }}>
                                                    <td style={{ color: '#dc2626', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '10px 18px' }}>
                                                        {formatDateShort(em.created_at)}{' '}{formatTime(em.created_at)}
                                                    </td>
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
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}>공지사항</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{noticePage} / {totalNoticePages}</div>
                                    <button onClick={() => setNoticePage(p => Math.max(1, p - 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>◀</button>
                                    <button onClick={() => setNoticePage(p => Math.min(totalNoticePages, p + 1))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>▶</button>
                                    <button className={styles.writeNoticeBtn} style={{ height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }} onClick={() => { setNewNotice({ title: '', content: '', target: '전체', isEmergency: false }); setShowWriteModal(true); }}>글쓰기</button>
                                </div>
                            </div>
                            <div className={styles.tableCard} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                                <table className={styles.adminNoticeTable} style={{ margin: 0 }}>
                                    <thead><tr><th style={{ width: '100px', textAlign: 'center' }}>날짜</th><th>제목</th><th style={{ width: '80px', textAlign: 'center' }}>상태</th></tr></thead>
                                    <tbody>
                                        {paginatedNotices.length === 0 ? (
                                            <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>게시된 공지사항이 없습니다.</td></tr>
                                        ) : (
                                            paginatedNotices.map(n => (
                                                <tr key={n.id} onClick={() => handleEditNotice(n, false)} style={{ cursor: 'pointer' }}>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#475569', padding: '8px 12px' }}>{formatDateShort(n.created_at)}</td>
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

                <button className={styles.tableSectionMobileBtn} onClick={() => setIsMobileListOpen(true)}>
                    운행 현황 목록 ({filteredLiveTrips.length}건)
                </button>

                <div className={`${styles.mobilePopupOverlay} ${isMobileListOpen ? styles.showOnMobile : ''}`} onClick={() => setIsMobileListOpen(false)}></div>

                <div className={`${styles.tableSection} ${isMobileListOpen ? styles.showOnMobile : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0 }}>운행 현황 ({filteredLiveTrips.length}건) {realtimeTarget && <span style={{ fontSize: '0.7rem', color: '#10b981', background: '#10b98115', padding: '2px 8px', borderRadius: 10, fontWeight: 800, marginLeft: 8 }}>LIVE 추적중 ({realtimeCountdown}초)</span>}</h3>
                        <button className={styles.closeBtnMobile} onClick={() => setIsMobileListOpen(false)} style={{ display: 'none', background: 'none', border: 'none', fontSize: '1.2rem', color: '#64748b' }}>✕</button>
                    </div>
                    <table className={styles.tripTable}>
                        <thead><tr><th>상태</th><th>구분</th><th>기사명</th><th>소속/계약</th><th>차량번호</th><th>컨테이너/화물</th><th>속도/운행시간</th><th>마지막 수신위치</th><th>관리</th></tr></thead>
                        <tbody>
                            {filteredLiveTrips.map(trip => (
                                <tr key={trip.id} onClick={(e) => {
                                    setIsMobileListOpen(false);
                                    handleSelectTrip(trip);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }} style={{ ...(realtimeTarget === trip.id ? { background: '#10b98110' } : {}), cursor: 'pointer' }}>
                                    <td><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td>{cargoTypeLabel(trip.cargo_type || 'container')}</td>
                                    <td><strong>{trip.driver_name}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 800 }}>{trip.branch || trip.partner_company || '-'}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{contractTypeLabel(trip.driver_contract_type || trip.contract_type || 'uncontracted')}</div>
                                    </td>
                                    <td>{trip.vehicle_number}</td>
                                    <td>{(trip.cargo_type || 'container') === 'general' ? (trip.cargo_item || trip.container_number || '-') : (trip.container_number || '-')}</td>
                                    <td>
                                        <div style={{ fontWeight: 800, color: '#2563eb' }}>{displaySpeedKmh(trip.lastLocation?.speed)} km/h</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{getElapsedTimeString(trip.started_at, trip.completed_at)}</div>
                                    </td>
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

            <div style={{ display: (activeTab === 'records' || activeTab === 'education') ? 'block' : 'none' }}>
                <div className={styles.filterBar}>
                    <div className={styles.filterGroup}>
                        <span className={styles.filterLabel}>상태</span>
                        <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">전체</option><option value="driving">운행 중</option><option value="paused">일시중지</option><option value="completed">운행 완료</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <GroupButton active={cargoGroupFilter === 'all'} onClick={() => setCargoGroupFilter('all')}>전체</GroupButton>
                        <GroupButton active={cargoGroupFilter === 'container'} onClick={() => setCargoGroupFilter('container')}>컨테이너</GroupButton>
                        <GroupButton active={cargoGroupFilter === 'general'} onClick={() => setCargoGroupFilter('general')}>일반화물</GroupButton>
                        <span style={{ width: 1, height: 20, background: '#e2e8f0' }} />
                        <GroupButton active={contractGroupFilter === 'all'} onClick={() => setContractGroupFilter('all')}>전체계약</GroupButton>
                        <GroupButton active={contractGroupFilter === 'contracted'} onClick={() => setContractGroupFilter('contracted')}>계약</GroupButton>
                        <GroupButton active={contractGroupFilter === 'uncontracted'} onClick={() => setContractGroupFilter('uncontracted')}>미계약</GroupButton>
                        <GroupButton active={contractGroupFilter === 'partner'} onClick={() => setContractGroupFilter('partner')}>협력사</GroupButton>
                        {contractGroupFilter === 'partner' && (
                            <select className={styles.filterSelect} value={partnerCompanyFilter} onChange={e => setPartnerCompanyFilter(e.target.value)}>
                                <option value="all">전체 협력사</option>
                                {partnerCompanyOptions.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        )}
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
                    <button className={styles.filterSearchBtn} onClick={handleSearch}>검색</button>
                    <button className={styles.filterResetBtn} onClick={handleReset}>초기화</button>

                    {selectedIds.length > 0 && (
                        <button className={styles.bulkDeleteBtn} onClick={handleBulkDelete}>
                            {selectedIds.length}건 삭제
                        </button>
                    )}
                </div>
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>조회 결과</div><div className={styles.summaryValue}>{recordSummary.count.toLocaleString('ko-KR')}건</div></div>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>현재 페이지</div><div className={`${styles.summaryValue} ${styles.summaryValueBlue}`}>{currentPageRowCount.toLocaleString('ko-KR')}건</div></div>
                    <div className={styles.summaryCard}><div className={styles.summaryLabel}>{activeTab === 'records' ? '페이지 청구금액' : '페이지 차량수'}</div><div className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{activeTab === 'records' ? `${recordSummary.amount.toLocaleString('ko-KR')}원` : `${recordSummary.vehicles.toLocaleString('ko-KR')}대`}</div></div>
                </div>
                <div className={`${styles.tableSection} ${styles.recordsTableSection}`}>
                    <div className={styles.tableHeaderInfo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ display: 'inline-block', marginRight: 15 }}>{activeTab === 'records' ? '운행 기록' : '교육 이수'} ({recordsTotal.toLocaleString('ko-KR')}건)</h3>
                            <span className={styles.tableLegend}>* 첫 화면은 {recordsPageSize}건씩 로딩 · 클릭 시 정렬 가능 (현재 페이지)</span>
                        </div>
                        {activeTab === 'records' && (
                        <div className={styles.tableActions} style={{ display: 'flex', gap: 8 }}>
                            <button className={styles.filterSearchBtn} style={{ background: '#10b981', borderColor: '#10b981', height: '36px', fontSize: '0.78rem', padding: '0 14px' }} onClick={() => window.location.href = `/api/vehicle-tracking/export/excel?from=${filterFrom}&to=${filterTo}&keyword=${filterKeyword}&status=${filterStatus}`}>엑셀 다운로드</button>
                            <button className={styles.filterSearchBtn} style={{ background: '#3b82f6', borderColor: '#3b82f6', height: '36px', fontSize: '0.78rem', padding: '0 14px' }} onClick={() => {
                                if (selectedIds.length === 0) alert('다운로드할 기록을 선택해주세요.');
                                else window.location.href = `/api/vehicle-tracking/export/zip?ids=${selectedIds.join(',')}`;
                            }}>선택건 ZIP</button>
                        </div>
                        )}
                    </div>
                    <RecordsPagination />
                    {activeTab === 'records' ? (
                    <table className={styles.tripTable}>
                        <thead>
                            <tr>
                                <th><input type="checkbox" checked={filteredRecordIds.length > 0 && filteredRecordIds.every(id => selectedIds.includes(id))} onChange={toggleSelectAll} /></th>
                                <th>상태</th>
                                <th>구분</th>
                                <th onClick={() => handleSort('driver_name')} className={styles.sortable}>기사명/차량 {sortConfig.key === 'driver_name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                                <th style={{ minWidth: '130px' }}>컨테이너/화물</th>
                                <th style={{ width: '160px', minWidth: '160px' }}>규격/제원</th>
                                <th style={{ width: '150px', minWidth: '150px' }}>점검여부(브/타/램/적/기)</th>
                                <th style={{ maxWidth: '160px' }}>일보/메모</th>
                                <th style={{ width: '60px' }}>사진</th>
                                <th onClick={() => handleSort('started_at')} className={styles.sortable} style={{ width: '130px' }}>날짜 {sortConfig.key === 'started_at' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                                <th style={{ width: '90px' }}>운행거리</th>
                                <th style={{ width: '90px' }}>최고속도</th>
                                <th style={{ width: '180px' }}>최종위치</th>
                                <th style={{ width: '100px' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recordsLoading ? (
                                <tr><td colSpan="14" style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontWeight: 800 }}>운행 기록을 불러오는 중입니다.</td></tr>
                            ) : filteredRecords.length === 0 ? (
                                <tr><td colSpan="14" style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontWeight: 800 }}>조회된 운행 기록이 없습니다.</td></tr>
                            ) : filteredRecords.map(trip => (
                                <Fragment key={`trip-row-${trip.id}`}>
                                <tr key={trip.id} className={selectedIds.includes(trip.id) ? styles.selectedRow : ''} onClick={(e) => { if (selectedTrip) handleSelectTrip(trip); }} style={{ cursor: selectedTrip ? 'pointer' : 'default' }}>
                                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(trip.id)} onChange={() => toggleSelect(trip.id)} /></td>
                                    <td data-label="상태"><span className={`${styles.statusBadge} ${getStatusClass(trip.status)}`}>{getStatusIcon(trip.status)} {TRIP_STATUS_LABELS[trip.status]}</span></td>
                                    <td data-label="구분" style={{ fontSize: '0.78rem', fontWeight: 800, color: (trip.cargo_type || 'container') === 'general' ? '#7c3aed' : '#2563eb' }} onClick={(e) => e.stopPropagation()}>
                                        <span className={styles.tripTypeInline}>{cargoTypeLabel(trip.cargo_type || 'container')} · {contractTypeLabel(trip.driver_contract_type || trip.contract_type || 'uncontracted')}</span>
                                    </td>
                                    <td data-label="기사/차량">
                                        <div><strong>{trip.driver_name}</strong></div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{trip.vehicle_number}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: 2 }}>{trip.branch || trip.partner_company || '-'} · {contractTypeLabel(trip.driver_contract_type || trip.contract_type || 'uncontracted')}</div>
                                    </td>
                                    <td data-label="화물" onClick={(e) => e.stopPropagation()}>
                                        <div><input defaultValue={(trip.cargo_type || 'container') === 'general' ? (trip.cargo_item || trip.container_number || '') : (trip.container_number || '')} placeholder={(trip.cargo_type || 'container') === 'general' ? '화물명' : '컨테이너'} onBlur={(e) => saveTripField(trip, (trip.cargo_type || 'container') === 'general' ? 'cargo_item' : 'container_number', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontWeight: 600, color: (trip.admin_edited_fields || []).includes('container_number') ? '#2563eb' : '#1e293b' }} /></div>
                                        <div style={{ marginTop: 2 }}><input defaultValue={(trip.cargo_type || 'container') === 'general' ? (trip.cargo_order_number || trip.seal_number || '') : (trip.seal_number || '')} placeholder={(trip.cargo_type || 'container') === 'general' ? '오더번호' : '씰넘버'} onBlur={(e) => saveTripField(trip, (trip.cargo_type || 'container') === 'general' ? 'cargo_order_number' : 'seal_number', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontSize: '0.7rem', color: (trip.admin_edited_fields || []).includes('seal_number') ? '#2563eb' : '#64748b' }} /></div>
                                    </td>
                                    <td data-label="규격" className={styles.containerSpecCell} onClick={(e) => e.stopPropagation()}>
                                        {(trip.cargo_type || 'container') === 'general' ? (
                                            <div style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                                                <div>{trip.general_vehicle_type || '-'}</div>
                                                <div style={{ color: '#64748b' }}>{trip.general_payload || trip.cargo_weight || '-'} / {trip.general_body_type || '-'}</div>
                                            </div>
                                        ) : (<>
                                        <select defaultValue={trip.container_type || '40FT'} onChange={(e) => saveTripField(trip, 'container_type', e.target.value)} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontSize: '0.8rem', color: (trip.admin_edited_fields || []).includes('container_type') ? '#2563eb' : '#1e293b', fontWeight: (trip.admin_edited_fields || []).includes('container_type') ? 700 : 400 }}>
                                            <option value="20FT">20FT</option><option value="40FT">40FT</option>
                                        </select>
                                        <select defaultValue={trip.container_kind || 'DRY'} onChange={(e) => saveTripField(trip, 'container_kind', e.target.value)} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 4px', fontSize: '0.7rem', marginTop: 2, color: (trip.admin_edited_fields || []).includes('container_kind') ? '#2563eb' : '#64748b' }}>
                                            <option value="DRY">DRY</option><option value="REEFER">REEFER</option><option value="TANK">TANK</option><option value="OPEN_TOP">OPEN TOP</option><option value="FLAT">FLAT RACK</option>
                                        </select>
                                        </>)}
                                    </td>
                                    <td data-label="점검" className={styles.checkCell}>
                                        <span title="브레이크" style={{ marginRight: 2 }}>{trip.chk_brake ? 'OK' : '-'}</span>
                                        <span title="타이어" style={{ marginRight: 2 }}>{trip.chk_tire ? 'OK' : '-'}</span>
                                        <span title="경광등/램프" style={{ marginRight: 2 }}>{trip.chk_lamp ? 'OK' : '-'}</span>
                                        <span title="적재물" style={{ marginRight: 2 }}>{trip.chk_cargo ? 'OK' : '-'}</span>
                                        <span title="기사숙지">{trip.chk_driver ? 'OK' : '-'}</span>
                                    </td>
                                    <td data-label="일보/메모" style={{ fontSize: '0.75rem', maxWidth: '160px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${trip.transport_type || '왕복'} / ${trip.billing_amount ? Number(trip.billing_amount).toLocaleString('ko-KR') + '원' : '-'} / ${trip.work_site || '-'} / ${trip.special_notes || '-'}`} onClick={(e) => e.stopPropagation()}>
                                        <div>{trip.transport_type || '왕복'} · <input defaultValue={trip.billing_amount ? Number(trip.billing_amount).toLocaleString('ko-KR') : ''} placeholder="금액" onBlur={(e) => saveBillingAmount(trip, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: 86, border: '1px solid #dbeafe', borderRadius: 4, padding: '2px 4px', color: (trip.admin_edited_fields || []).includes('billing_amount') ? '#2563eb' : '#1e293b', fontWeight: (trip.admin_edited_fields || []).includes('billing_amount') ? 800 : 600, textAlign: 'right' }} />원</div>
                                        <div style={{ color: '#64748b' }}>{trip.work_site || trip.special_notes || '-'}</div>
                                    </td>
                                    <td data-label="사진" style={{ textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>{trip.photos?.length || 0}장</td>
                                    <td data-label="날짜" style={{ fontSize: '0.8rem' }}>
                                        <div className={styles.dateStack}>
                                            <div style={{ color: '#1e293b' }}>{formatDateTime(trip.started_at)}</div>
                                            <div style={{ color: '#64748b' }}>{formatDateTime(trip.completed_at)}</div>
                                        </div>
                                    </td>
                                    <td data-label="운행거리" style={{ fontSize: '0.78rem', fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap' }}>
                                        {getTripDistance(trip) || '-'}
                                    </td>
                                    <td data-label="최고속도" style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ef4444', whiteSpace: 'nowrap' }}>
                                        {getTripMaxSpeed(trip)}
                                    </td>
                                    <td data-label="최종위치" title={getTripFinalLocation(trip).title} style={{ whiteSpace: 'normal', wordBreak: 'keep-all', fontSize: '0.8rem', lineHeight: '1.3', color: '#374151', maxWidth: '180px' }}>
                                        <div className={styles.finalLocationText}>{getTripFinalLocation(trip).title}</div>
                                        {getTripFinalLocation(trip).meta && <div className={styles.finalLocationMeta}>{getTripFinalLocation(trip).meta}</div>}
                                    </td>
                                    <td className={styles.actionCol} onClick={(e) => e.stopPropagation()}>
                                        <button className={styles.viewIconBtn} onClick={() => handleSelectTrip(trip)}>상세보기</button>
                                        <button className={styles.viewIconBtn} style={{ borderColor: trip.is_closed ? '#ef4444' : '#10b981', color: trip.is_closed ? '#ef4444' : '#10b981' }} onClick={() => toggleTripClosed(trip)}>{trip.is_closed ? '마감해제' : '마감완료'}</button>
                                        <button className={styles.deleteIconBtn} onClick={() => handleDeleteRecord(trip.id)}>삭제</button>
                                    </td>
                                </tr>

                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                    ) : activeTab === 'education' ? (
                    <table className={styles.tripTable}>
                        <thead>
                            <tr>
                                <th><input type="checkbox" /></th>
                                <th>상태</th>
                                <th>기사명/차량</th>
                                <th colSpan={3}>교육 제목 / 내용</th>
                                <th>상태</th>
                                <th>-</th>
                                <th>날짜</th>
                                <th>처리자</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recordsLoading ? (
                                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '20px' }}>교육 이수 기록을 불러오는 중입니다.</td></tr>
                            ) : educationRows.length === 0 ? (
                                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '20px' }}>조회된 교육 이수 기록이 없습니다.</td></tr>
                            ) : (
                                educationRows.map(({ trip, log }) => (
                                    <tr key={`edu-${log.id}`} style={{ background: '#f0fdf4' }}>
                                        <td></td>
                                        <td data-label="상태"><span className={styles.statusBadge} style={{ color: '#047857', borderColor: '#86efac', background: '#dcfce7' }}>교육 이수</span></td>
                                        <td data-label="기사/차량"><strong>{trip.driver_name}</strong><div style={{ fontSize: '0.75rem', color: '#64748b' }}>{trip.vehicle_number}</div></td>
                                        <td data-label="교육" colSpan={3} style={{ color: '#047857', fontWeight: 800 }}>
                                            <div>{parseEducationLogTitle(log.new_value)}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>공지/교육 내용 이수 기록</div>
                                        </td>
                                        <td data-label="상태" style={{ color: '#047857', fontWeight: 800 }}>수료완료</td>
                                        <td>-</td>
                                        <td data-label="날짜"><div>{new Date(log.created_at).toLocaleString('ko-KR')}</div><div style={{ color: '#64748b' }}>수강/수료</div></td>
                                        <td data-label="처리자">처리자: {log.modified_by || '-'}</td>
                                        <td><button className={styles.viewIconBtn} onClick={() => handleSelectTrip(trip)}>연결 운행</button></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    ) : null}
                    <RecordsPagination />
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
                                    {String(realtimeTarget) === String(selectedTrip.id) ? `추적중지 (${realtimeCountdown}s)` : '실시간 추적 시작'}
                                </button>
                            )}
                        </div>
                        <button className={styles.closeBtn} onClick={() => {
                            setSelectedTrip(null);
                        }}>✕</button>
                    </div>
                    <div className={styles.detailContent}>
                        <div className={styles.detailHero}>
                            <div>
                                <div className={styles.detailKicker}>{cargoTypeLabel(selectedTrip.cargo_type || 'container')} · {contractTypeLabel(selectedTrip.driver_contract_type || selectedTrip.contract_type || 'uncontracted')}</div>
                                <div className={styles.detailHeroTitle}>{selectedTrip.vehicle_number || '-'} / {selectedTrip.driver_name || '-'}</div>
                                <div className={styles.detailHeroMeta}>{selectedTrip.last_location_address || selectedTrip.lastLocation?.address || selectedTripLocations[selectedTripLocations.length - 1]?.address || '마지막 위치 확인 중'}</div>
                            </div>
                            <div className={styles.detailMetricStrip}>
                                <div><span>상태</span><strong>{TRIP_STATUS_LABELS[selectedTrip.status] || '-'}</strong></div>
                                <div><span>운행시간</span><strong>{getElapsedTimeString(selectedTrip.started_at, selectedTrip.completed_at)}</strong></div>
                                <div><span>운행거리</span><strong>{getTripDistance(selectedTrip) || '-'}</strong></div>
                                <div><span>최고속도</span><strong>{getTripMaxSpeed(selectedTrip)}</strong></div>
                            </div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>기본 정보</div>
                            <div className={styles.detailInfoGrid}>
                                <div><div className={styles.infoLabel}>드라이버</div><div className={styles.infoValue}>{selectedTrip.driver_name}</div></div>
                                <div><div className={styles.infoLabel}>차량번호</div><div className={styles.infoValue}>{selectedTrip.vehicle_number}</div></div>
                                <div><div className={styles.infoLabel}>업무유형</div><div className={styles.infoValue} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span>{cargoTypeLabel(selectedTrip.cargo_type || 'container')} · {contractTypeLabel(selectedTrip.driver_contract_type || selectedTrip.contract_type || 'uncontracted')}</span></div></div>
                                
                                <div className={styles.detailWideField}>
                                    <div className={styles.infoLabel}>{(selectedTrip.cargo_type || 'container') === 'general' ? '화물명' : '컨테이너 / 씰 넘버'}</div>
                                    <div className={`${styles.infoValue} ${styles.detailSplitInputs}`}>
                                        <input defaultValue={(selectedTrip.cargo_type || 'container') === 'general' ? (selectedTrip.cargo_item || selectedTrip.container_number || '') : (selectedTrip.container_number || '')} placeholder={(selectedTrip.cargo_type || 'container') === 'general' ? '화물명' : '컨테이너 번호'} onBlur={(e) => saveTripField(selectedTrip, (selectedTrip.cargo_type || 'container') === 'general' ? 'cargo_item' : 'container_number', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: '0.9rem' }} />
                                        {(selectedTrip.cargo_type || 'container') !== 'general' && (
                                            <input defaultValue={selectedTrip.seal_number || ''} placeholder="씰 넘버" onBlur={(e) => saveTripField(selectedTrip, 'seal_number', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: '0.9rem' }} />
                                        )}
                                    </div>
                                </div>
                                
                                <div><div className={styles.infoLabel}>{(selectedTrip.cargo_type || 'container') === 'general' ? '오더/관리번호' : '운송구분'}</div><div className={styles.infoValue}>
                                    {(selectedTrip.cargo_type || 'container') === 'general' ? (
                                        <input defaultValue={selectedTrip.cargo_order_number || selectedTrip.seal_number || ''} placeholder="오더번호" onBlur={(e) => saveTripField(selectedTrip, 'cargo_order_number', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem' }} />
                                    ) : (
                                        <select defaultValue={selectedTrip.transport_type || '왕복'} onChange={(e) => saveTripField(selectedTrip, 'transport_type', e.target.value)} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem' }}>
                                            <option value="왕복">왕복</option><option value="편도">편도</option><option value="복화">복화</option><option value="기타">기타</option>
                                        </select>
                                    )}
                                </div></div>
                                <div><div className={styles.infoLabel}>규격/타입</div><div className={styles.infoValue}>
                                    {(selectedTrip.cargo_type || 'container') === 'general' ? (
                                        <div>{selectedTrip.general_vehicle_type || '-'} / {selectedTrip.general_payload || selectedTrip.cargo_weight || '-'} / {selectedTrip.general_body_type || '-'}</div>
                                    ) : (<>
                                    <select defaultValue={selectedTrip.container_type || '40FT'} onChange={(e) => saveTripField(selectedTrip, 'container_type', e.target.value)} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <option value="20FT">20FT</option><option value="40FT">40FT</option>
                                    </select>
                                    <select defaultValue={selectedTrip.container_kind || 'DRY'} onChange={(e) => saveTripField(selectedTrip, 'container_kind', e.target.value)} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem' }}>
                                        <option value="DRY">DRY</option><option value="REEFER">REEFER</option><option value="TANK">TANK</option><option value="OPEN_TOP">OPEN TOP</option><option value="FLAT">FLAT RACK</option>
                                    </select>
                                    </>)}
                                </div></div>
                                <div><div className={styles.infoLabel}>청구금액</div><div className={styles.infoValue}><input defaultValue={selectedTrip.billing_amount ? Number(selectedTrip.billing_amount).toLocaleString('ko-KR') : ''} placeholder="금액" onBlur={(e) => saveTripField(selectedTrip, 'billing_amount', e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem' }} /></div></div>
                                <div><div className={styles.infoLabel}>작업지</div><div className={styles.infoValue}><input defaultValue={selectedTrip.work_site || ''} placeholder="작업지" onBlur={(e) => saveTripField(selectedTrip, 'work_site', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem' }} /></div></div>
                                <div><div className={styles.infoLabel}>마감여부</div><div className={styles.infoValue} style={{ color: selectedTrip.is_closed ? '#ef4444' : '#10b981' }}>{selectedTrip.is_closed ? '마감완료' : '미마감'}</div></div>
                                <div className={styles.detailTotalTimeBox}>
                                    <div className={styles.infoLabel} style={{ color: '#0369a1' }}>총 소요 운행 시간</div>
                                    <div className={styles.infoValue} style={{ color: '#0284c7', fontSize: '1.1rem', fontWeight: 800 }}>{getElapsedTimeString(selectedTrip.started_at, selectedTrip.completed_at)}</div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>증빙 사진 ({selectedTrip.photos?.length || 0}) {selectedTrip.photos?.length > 0 && <button className={styles.zipDownloadBtn} style={{ width: 'auto', height: 24, padding: '0 10px', fontSize: '0.7rem' }} onClick={() => handleDownloadZip(selectedTrip)}>ZIP 다운</button>}</div>
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
                                <span>이동 경로 ({selectedTripLocations.length}{hiddenTripLocationCount > 0 ? ` · 최근 ${displayTripLocations.length}개 표시` : ''})</span>
                                <div className={styles.detailActionRow}>
                                    <button className={styles.filterSearchBtn} style={{ background: '#10b981', borderColor: '#10b981', padding: '0 10px', fontSize: '0.75rem', height: '26px', borderRadius: '6px' }} onClick={handleDownloadLocationsCsv}>엑셀 다운로드</button>
                                    <button className={styles.resetZoomBtn} onClick={() => {
                                        const bounds = new window.naver.maps.LatLngBounds();
                                        selectedTripLocations.filter(l => l.lat > 33 && l.lat < 40 && l.lng > 124 && l.lng < 132).forEach(l => bounds.extend(new window.naver.maps.LatLng(l.lat, l.lng)));
                                        miniMapInstanceRef.current?.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30, maxZoom: 14 });
                                    }}>전체보기</button>
                                </div>
                            </div>

                            <div className={styles.detailMiniMapWrap}>
                                <div ref={miniMapRef} className={styles.detailMiniMap} />
                                {selectedTripLocations.length === 0 && (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600, background: 'rgba(241,245,249,0.7)', borderRadius: '8px', zIndex: 10 }}>
                                        해당 운행건의 위치 기록이 존재하지 않습니다.
                                    </div>
                                )}
                            </div>

                            <div className={styles.locationList} style={{ maxHeight: '250px', overflowX: 'auto', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' }}>
                                <table className={styles.desktopLocationTable} style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'center' }}>
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
                                            displayTripLocations.slice().reverse().map((loc, i) => {
                                                const realIndex = selectedTripLocations.length - 1 - i;
                                                const hasAddr = loc.address && loc.address !== '주소 정보 없음';
                                                const d = new Date(loc.timestamp || loc.recorded_at);
                                                const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                                                return (
                                                    <tr key={i} onClick={() => { const mInstance = miniMapInstanceRef.current || mapInstanceRef.current; if (mInstance) { mInstance.setCenter(new window.naver.maps.LatLng(loc.lat, loc.lng)); mInstance.setZoom(16); } }} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                                                        <td style={{ padding: '4px', color: '#475569', fontWeight: 500, letterSpacing: '-0.5px' }}>{dateStr}</td>
                                                        <td style={{ padding: '4px', color: '#3b82f6', fontWeight: 700 }}>{displaySpeedKmh(loc.speed)}</td>
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
                                <div className={styles.mobileLocationTimeline}>
                                    {selectedTripLocations.length === 0 ? (
                                        <div className={styles.mobileEmptyState}>위치 기록 데이터가 없습니다.</div>
                                    ) : (
                                        displayTripLocations.slice().reverse().map((loc, i) => {
                                            const realIndex = selectedTripLocations.length - 1 - i;
                                            const hasAddr = loc.address && loc.address !== '주소 정보 없음';
                                            const d = new Date(loc.timestamp || loc.recorded_at);
                                            const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                                            return (
                                                <div
                                                    key={`mobile-loc-${i}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    className={styles.mobileLocationCard}
                                                    onClick={() => {
                                                        const mInstance = miniMapInstanceRef.current || mapInstanceRef.current;
                                                        if (mInstance) {
                                                            mInstance.setCenter(new window.naver.maps.LatLng(loc.lat, loc.lng));
                                                            mInstance.setZoom(16);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            const mInstance = miniMapInstanceRef.current || mapInstanceRef.current;
                                                            if (mInstance) {
                                                                mInstance.setCenter(new window.naver.maps.LatLng(loc.lat, loc.lng));
                                                                mInstance.setZoom(16);
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <span className={styles.mobileLocationHead}>
                                                        <strong>{dateStr}</strong>
                                                        <em>{displaySpeedKmh(loc.speed)} km/h</em>
                                                    </span>
                                                    <span className={styles.mobileLocationAddr}>{loc.address || '주소 확인 필요'}</span>
                                                    <span className={styles.mobileLocationMeta}>{Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}</span>
                                                    {!hasAddr && (
                                                        <button
                                                            type="button"
                                                            className={styles.mobileAddressBtn}
                                                            onClick={(e) => { e.stopPropagation(); fetchMissingAddress(loc, realIndex); }}
                                                        >
                                                            주소 확인
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={styles.detailSection}>
                            <div className={styles.sectionTitle}>운행 기록 ({tripLogs.length})</div>
                            <div className={styles.locationList} style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }}>
                                <table className={styles.desktopLogTable} style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                    <thead style={{ background: '#f8fafc' }}>
                                        <tr><th style={{ padding: 6 }}>시간</th><th style={{ padding: 6 }}>항목</th><th style={{ padding: 6 }}>내용</th><th style={{ padding: 6 }}>처리자</th></tr>
                                    </thead>
                                    <tbody>
                                        {tripLogs.filter(log => log.field_name !== 'safety_education').length === 0 ? (
                                            <tr><td colSpan="4" style={{ padding: 14, textAlign: 'center', color: '#94a3b8' }}>기록이 없습니다.</td></tr>
                                        ) : tripLogs.filter(log => log.field_name !== 'safety_education').map((log, i) => (
                                            <tr key={log.id || i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                                                <td style={{ padding: 6, fontWeight: 800, color: '#475569' }}>{log.field_name}</td>
                                                <td style={{ padding: 6 }}>{`${log.old_value || '-'} → ${log.new_value || '-'}`}</td>
                                                <td style={{ padding: 6 }}>{log.modified_by ? log.modified_by.replace('|admin', '') : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className={styles.mobileLogList}>
                                    {tripLogs.filter(log => log.field_name !== 'safety_education').length === 0 ? (
                                        <div className={styles.mobileEmptyState}>기록이 없습니다.</div>
                                    ) : tripLogs.filter(log => log.field_name !== 'safety_education').map((log, i) => (
                                        <div key={`mobile-log-${log.id || i}`} className={styles.mobileLogCard}>
                                            <div className={styles.mobileLogTop}>
                                                <strong>{log.field_name}</strong>
                                                <span>{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                                            </div>
                                            <div className={styles.mobileLogChange}>{`${log.old_value || '-'} → ${log.new_value || '-'}`}</div>
                                            <div className={styles.mobileLogBy}>{log.modified_by ? log.modified_by.replace('|admin', '') : '-'}</div>
                                        </div>
                                    ))}
                                </div>
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
                            <h3>{newNotice.isEmergency ? (newNotice.id ? '긴급알림 수정' : '긴급알림 발송') : (newNotice.id ? '공지사항 수정' : '새 공지사항 작성')}</h3>
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
                            {!newNotice.isEmergency && newNotice.category === '안전교육' && (
                                <div style={{ marginTop: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>YouTube 교육 영상 주소</label>
                                    <input
                                        className={styles.modalInput}
                                        placeholder="여러 개 입력 가능: https://www.youtube.com/watch?v=... (줄바꿈)"
                                        value={newNotice.education_url || ''}
                                        onChange={e => setNewNotice({ ...newNotice, education_url: e.target.value })}
                                    />
                                    {extractYouTubeUrls(newNotice.education_url || '').length > 0 && (
                                        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                                            {extractYouTubeUrls(newNotice.education_url || '').map((url, i) => (
                                                <iframe key={`${url}-${i}`} title={`교육 영상 ${i + 1}`} src={toYouTubeEmbedUrl(url)} style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 8, background: '#000' }} allowFullScreen />
                                            ))}
                                        </div>
                                    )}
                                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', margin: '10px 0 4px' }}>교육 자료 업로드 (PDF/이미지 등 다중 선택)</label>
                                    <input type="file" multiple accept="image/*,video/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} />
                                    {(newNotice.attachments || []).length > 0 && (
                                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {(newNotice.attachments || []).map((f, i) => (
                                                <span key={i} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#0369a1', textDecoration: 'none' }}>{f.name}</a>
                                                    <button type="button" onClick={() => setNewNotice(prev => ({ ...prev, attachments: (prev.attachments || []).filter((_, idx) => idx !== i) }))} style={{ border: 0, background: 'transparent', color: '#ef4444', fontWeight: 900, cursor: 'pointer' }}>×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
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
                                    <button className={styles.filterResetBtn} onClick={() => handleDeleteNotice(newNotice.id, newNotice.isEmergency)} style={{ height: 44, padding: '0 20px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 8, fontWeight: 700 }}>삭제</button>
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
