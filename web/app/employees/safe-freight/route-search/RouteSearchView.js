'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx-js-style';
import Script from 'next/script';
import styles from './route-search.module.css';
import LocationBlock, { TERMINAL_LIST, TERMINAL_COORDS } from './LocationBlock';

/* ═══════════════════════════════════════════════════
   상수 정의
   ═══════════════════════════════════════════════════ */

const CAR_TYPES = [
    { id: 1, label: '소형차 (1종)', mileage: 12 },
    { id: 2, label: '중형차 (2종)', mileage: 8 },
    { id: 3, label: '대형차 (3종)', mileage: 5 },
    { id: 4, label: '소형화물차 (4종)', mileage: 6 },
    { id: 5, label: '중형화물차 (5종)', mileage: 4.5 },
    { id: 6, label: '대형화물차 (6종)', mileage: 3.5 },
];

/** Directions 15 API 경로 옵션 (최대 3개씩 요청 가능) — 네이버 웹 지도와 유사한 명칭 */
const ROUTE_OPTIONS = [
    { id: 'trafast', label: '실시간 추천', desc: '실시간 추천 경로', color: '#2563eb' },
    { id: 'tracomfort', label: '큰길우선', desc: '큰길 우선 경로', color: '#059669' },
    { id: 'traoptimal', label: '최적경로', desc: '최적 경로', color: '#d97706' },
    { id: 'traavoidtoll', label: '무료우선', desc: '무료도로 우선', color: '#7c3aed' },
    { id: 'traavoidcaronly', label: '전용도로회피', desc: '자동차전용도로 회피', color: '#dc2626' },
];

/** 고시 내 항만/터미널 정보 (안내용 — 거리 추가 X, 고시 거리에 이미 포함됨) */
const TERMINAL_INFO = {
    '부산북항': { full: '부산북항(신선대터미널)', km: 3.3 },
    '부산신항': { full: '부산신항(HMMPSA, HPNT)', km: 3.3 },
    '인천항': { full: '인천항(ICT)', km: 1 },
    '인천신항': { full: '인천신항(한진인천컨테이너터미널)', km: 2 },
    '광양항': { full: '광양항컨테이너터미널', km: 4 },
    '평택항': { full: '평택항(평택컨테이너터미널)', km: 2 },
    '울산구항': { full: '울산구항', km: 1 },
    '울산신항': { full: '울산신항', km: 2 },
    '포항항': { full: '포항항', km: 1.5 },
    '군산항': { full: '군산항', km: 2 },
    '마산항': { full: '마산항', km: 1.2 },
    '대산항': { full: '대산항', km: 1 },
    '의왕ICD': { full: '의왕ICD (의왕역 등)', km: 2 },
};



/** 터미널 키워드 매칭 — 입력 텍스트에서 터미널 좌표 자동 교정 */
function matchTerminalCoords(text) {
    if (!text) return null;
    for (const [key, info] of Object.entries(TERMINAL_COORDS)) {
        for (const alias of (info.aliases || [])) {
            if (text.includes(alias)) {
                return { name: info.name, lng: info.lng, lat: info.lat, terminalKey: key };
            }
        }
    }
    return null;
}

/** 관련 법규 정보 */
const LEGAL_REFS = [
    { title: '화물자동차 운수사업법 제5조의9', desc: '안전운임제 근거', url: '' },
    { title: '2026년 적용 화물자동차 안전운임 고시', desc: '컨테이너·시멘트 안전운임 기준', url: '' },
    { title: '고시 제32조 (경로)', desc: '네이버 지도(거리우선, 5종 4축 이상), 06:00 기준', url: '' },
    { title: '고시 제33조 (거리 산정)', desc: '전 구간(터미널 내 운송거리 포함)을 km 단위, 반올림', url: '' },
    { title: '고시 제35조 (터미널)', desc: '항만별 터미널 내 운송거리 고시 기준 포함', url: '' },
    { title: '고시 별표6', desc: '거리(km)별 컨테이너 안전운임표 (왕복·편도)', url: '' },
];

const TEMP_RESULTS_KEY = 'safeFreightRouteSearchResults';

const DEFAULT_MAP_CENTER = [127.8, 36.0];
const DEFAULT_MAP_ZOOM = 7;

/* ═══════════════════════════════════════════════════
   유틸리티
   ═══════════════════════════════════════════════════ */

/** 터미널 정보 매칭 (거리 추가 X, 안내용)
 *  교정 전 원본 텍스트 + 교정 후 텍스트 모두 체크 */
function findTerminalInfo(text, originalText) {
    if (!text && !originalText) return null;
    const candidates = [text, originalText].filter(Boolean);
    for (const [key, val] of Object.entries(TERMINAL_INFO)) {
        for (const t of candidates) {
            if (t.includes(key)) return val;
        }
    }
    // TERMINAL_COORDS aliases 역매핑 (교정된 이름으로도 매칭)
    for (const [key, coord] of Object.entries(TERMINAL_COORDS)) {
        for (const t of candidates) {
            if (t === coord.name || coord.aliases.some(a => t.includes(a))) {
                return TERMINAL_INFO[key] || null;
            }
        }
    }
    return null;
}

/** 미터 → km (반올림) */
function metersToKm(m) { return Math.round(m / 1000); }

/** 밀리초 → 시간:분 */
function msToTime(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 금액 포맷 */
function formatWon(val) {
    if (!val || val === 0) return '-';
    return val.toLocaleString();
}

/** 가장 최근 과거 06:00 날짜 계산 + departtime 문자열 생성 */
function getRecent0600() {
    const now = new Date();
    // 오늘 06시 이전이면 어제 06시, 이후면 오늘 06시
    const target = new Date(now);
    target.setHours(6, 0, 0, 0);
    if (now < target) target.setDate(target.getDate() - 1);

    const y = target.getFullYear();
    const mo = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return {
        label: `${Number(mo)}월 ${Number(d)}일 06:00`,
        departtime: `${y}-${mo}-${d}T06:00:00`,
    };
}

/** 현재 시각 departtime */
function buildDepartTimeNow() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${d}T${h}:${m}:00`;
}

/** 카카오 검색 결과에서 행정복지센터 우선 정렬 */
function prioritizeAdminCenter(results) {
    if (!results?.length) return results;
    const priority = ['행정복지센터', '주민자치센터', '주민센터', '면사무소', '읍사무소', '동사무소', '시청', '군청', '구청'];
    return [...results].sort((a, b) => {
        const aP = priority.findIndex(k => (a.name || '').includes(k));
        const bP = priority.findIndex(k => (b.name || '').includes(k));
        if (aP >= 0 && bP >= 0) return aP - bP;
        if (aP >= 0) return -1;
        if (bP >= 0) return 1;
        return 0;
    });
}

/** 시도 명칭 매핑 (API → 안전운임 데이터 표준) — 구간별운임과 동일 */
const SIDO_MAP = {
    '서울특별시': '서울시', '부산광역시': '부산시', '대구광역시': '대구시',
    '인천광역시': '인천시', '광주광역시': '광주시', '대전광역시': '대전시',
    '울산광역시': '울산시', '세종특별자치시': '세종시', '경기도': '경기도',
    '강원특별자치도': '강원도', '강원도': '강원도', '충청북도': '충북',
    '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북',
    '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
    '제주특별자치도': '제주도', '제주도': '제주도',
    '경기': '경기도', '강원': '강원도', '충북': '충북', '충남': '충남',
    '전북': '전북', '전남': '전남', '경북': '경북', '경남': '경남', '제주': '제주도',
    '서울': '서울시', '부산': '부산시', '대구': '대구시', '인천': '인천시',
    '광주': '광주시', '대전': '대전시', '울산': '울산시', '세종': '세종시'
};

const SIDO_MAP_SHORT = {
    '서울특별시': '서울시', '인천광역시': '인천시', '부산광역시': '부산시', '대전광역시': '대전시',
    '대구광역시': '대구시', '울산광역시': '울산시', '광주광역시': '광주시', '세종특별자치시': '세종시',
    '경기도': '경기도', '강원도': '강원도', '충청북도': '충북', '충청남도': '충남',
    '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주도',
    '경기': '경기도', '강원': '강원도', '충북': '충북', '충남': '충남',
    '전북': '전북', '전남': '전남', '경북': '경북', '경남': '경남', '제주': '제주도',
    '서울': '서울시', '부산': '부산시', '대구': '대구시', '인천': '인천시',
    '광주': '광주시', '대전': '대전시', '울산': '울산시', '세종': '세종시'
};

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════════════ */

export default function RouteSearchView({ options, period, onBack }) {
    // ── 입력 상태 ────
    const [origin, setOrigin] = useState({ text: '', lng: null, lat: null, r1: '', r2: '', r3: '', terminalKey: '' });
    const [destination, setDestination] = useState({ text: '', lng: null, lat: null, r1: '', r2: '', r3: '', terminalKey: '' });
    const [waypoints, setWaypoints] = useState([]); // [{text, lng, lat, r1, r2, r3, terminalKey}]
    const [cartype, setCartype] = useState(6);
    const [timeMode, setTimeMode] = useState('scheduled'); // 'scheduled' | 'realtime'
    const [selectedOptions, setSelectedOptions] = useState(['trafast', 'tracomfort', 'traoptimal', 'traavoidtoll', 'traavoidcaronly']);
    const [tripMode, setTripMode] = useState('round');
    const [displayPeriod, setDisplayPeriod] = useState(period || '26.02월');

    // ── 검색 결과 ────
    const [routeResult, setRouteResult] = useState(null); // Directions 15 응답 (합산)
    const [selectedRouteKey, setSelectedRouteKey] = useState(null);
    const [distFareResult, setDistFareResult] = useState(null);     // 거리별운임 (항상)
    const [sectionFareResult, setSectionFareResult] = useState(null); // 구간별운임 (있으면)
    const [sectionFareOneWay, setSectionFareOneWay] = useState(null); // 수도권 편도 (있으면)
    const [terminalInfo, setTerminalInfo] = useState({ origin: null, dest: null });

    // ── UI 상태 ────
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);
    const [showLegalPopup, setShowLegalPopup] = useState(false);

    // ── 유가 정보 (오피넷) ────
    const [fuelPriceData, setFuelPriceData] = useState(null);
    const [selectedFuel, setSelectedFuel] = useState('diesel');

    // ── 임시 저장 내역 (History) ────
    const [savedResults, setSavedResults] = useState([]);

    // ── 장소 검색 드롭다운 (네이버 지역검색) ────
    const [activeField, setActiveField] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchTimerRef = useRef(null);

    // ── 지도 ────
    const mapContainerRef = useRef(null);
    const mapInstance = useRef(null);
    const mapMarkersRef = useRef([]);
    const mapPolylinesRef = useRef([]);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(false);

    // ── 06:00 날짜 표기 ────
    const recent0600 = useMemo(() => getRecent0600(), []);

    // ── 현재 차종의 연비 ────
    const currentMileage = useMemo(() => {
        const ct = CAR_TYPES.find(c => c.id === cartype);
        return ct?.mileage || 3.5;
    }, [cartype]);

    // ── 출발지 드롭다운 데이터 (options.regions 활용) ────
    const regionsData = useMemo(() => options?.regions || {}, [options]);

    /* ─── 세션 스토리지에서 이전 내역 로드 ─── */
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(TEMP_RESULTS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setSavedResults(parsed);
            }
        } catch (_) { }
    }, []);

    /* ─── 오피넷 유가 조회 (최초 1회) ─── */
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/opinet/fuel-price');
                const data = await res.json();
                if (data.diesel) {
                    setFuelPriceData(data);
                }
            } catch (e) {
                console.warn('OPINET fuel price fetch failed:', e);
            }
        })();
    }, []);

    /* ─── 지도 초기화 ─── */
    useEffect(() => {
        if (window.naver && window.naver.maps) {
            initMap();
            return;
        }

        window.navermap_authFailure = () => {
            setMapError(true);
        };

        const scriptId = 'naver-map-script-route15';
        if (document.getElementById(scriptId)) {
            const checkReady = setInterval(() => {
                if (window.naver && window.naver.maps) {
                    clearInterval(checkReady);
                    initMap();
                }
            }, 200);
            return () => clearInterval(checkReady);
        }

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`;
        script.async = true;
        script.onload = () => setTimeout(initMap, 150);
        script.onerror = () => setMapError(true);
        document.head.appendChild(script);
    }, []);

    const initMap = useCallback(() => {
        if (!mapContainerRef.current || mapInstance.current) return;
        if (!window.naver?.maps) {
            setTimeout(initMap, 200);
            return;
        }
        try {
            mapInstance.current = new window.naver.maps.Map(mapContainerRef.current, {
                center: new window.naver.maps.LatLng(DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]),
                zoom: DEFAULT_MAP_ZOOM,
                minZoom: 6,
                zoomControl: true,
                scrollWheel: true,
                draggable: true,
                pinchZoom: true,
                mapTypeControl: true,
                scaleControl: true,
            });
            setMapReady(true);
            window.naver.maps.Event.addListener(mapInstance.current, 'click', handleMapClick);
        } catch (e) {
            console.error('Map init error:', e);
            setMapError(true);
        }
    }, []);

    /* ─── 지도 클릭 → 역지오코딩 ─── */
    const handleMapClick = useCallback(async (e) => {
        const { _lat: lat, _lng: lng } = e.coord;
        try {
            const res = await fetch(`/api/naver-maps/reverse-geocode?coords=${lng},${lat}`);
            const data = await res.json();
            if (data.status?.code === 0 && data.results?.length > 0) {
                const r = data.results[0];
                const area = r.region;
                const addr = [area.area1?.name, area.area2?.name, area.area3?.name].filter(Boolean).join(' ');
                const loc = { text: addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lng: String(lng), lat: String(lat) };

                if (activeField === 'dest') {
                    setDestination(loc);
                } else if (activeField?.startsWith('wp')) {
                    const idx = parseInt(activeField.replace('wp', ''));
                    setWaypoints(prev => {
                        const next = [...prev];
                        next[idx] = loc;
                        return next;
                    });
                } else {
                    setOrigin(loc);
                }
                showToast(`📍 ${loc.text}`);
            }
        } catch (err) {
            console.error('Reverse geocode error:', err);
        }
    }, [activeField]);

    useEffect(() => {
        if (!mapInstance.current || !window.naver?.maps) return;
        window.naver.maps.Event.clearListeners(mapInstance.current, 'click');
        window.naver.maps.Event.addListener(mapInstance.current, 'click', handleMapClick);
    }, [handleMapClick]);

    /* ─── 📍 지도를 특정 좌표로 이동 & 줌 ─── */
    const panToLocation = useCallback((lng, lat, zoom = 13) => {
        if (!mapInstance.current || !window.naver?.maps) return;
        const pos = new window.naver.maps.LatLng(Number(lat), Number(lng));
        mapInstance.current.setCenter(pos);
        mapInstance.current.setZoom(zoom);
    }, []);

    /* ─── 지도에 전체 경로 표시 (네이버 웹처럼 전체 경로 동시 표시 + 선택) ─── */
    const drawAllRoutes = useCallback((fullRoute, activeKey) => {
        if (!mapInstance.current || !window.naver?.maps) return;
        clearMapOverlays();

        const naver = window.naver;
        const allBounds = new naver.maps.LatLngBounds();
        let firstSummary = null;

        const entries = Object.entries(fullRoute);

        // ① 비활성 경로를 먼저 그려서 뒤에 배치
        for (const [key, routes] of entries) {
            if (key === activeKey) continue; // 활성 경로는 나중에
            if (!routes?.[0]?.path) continue;
            const route = routes[0];
            if (!firstSummary) firstSummary = route.summary;
            const opt = ROUTE_OPTIONS.find(o => o.id === key);
            const pathCoords = route.path.map(p => new naver.maps.LatLng(p[1], p[0]));

            const polyline = new naver.maps.Polyline({
                map: mapInstance.current,
                path: pathCoords,
                strokeColor: opt?.color || '#94a3b8',
                strokeWeight: 4,
                strokeOpacity: 0.3,
                strokeStyle: 'solid',
                zIndex: 1,
                clickable: true,
            });
            polyline._routeKey = key;
            naver.maps.Event.addListener(polyline, 'click', () => {
                selectRouteOption(key);
            });
            mapPolylinesRef.current.push(polyline);
            pathCoords.forEach(p => allBounds.extend(p));
        }

        // ② 활성 경로를 마지막에 그려서 맨 위에 표시
        const activeRoutes = fullRoute[activeKey];
        if (activeRoutes?.[0]?.path) {
            const route = activeRoutes[0];
            if (!firstSummary) firstSummary = route.summary;
            const opt = ROUTE_OPTIONS.find(o => o.id === activeKey);
            const pathCoords = route.path.map(p => new naver.maps.LatLng(p[1], p[0]));

            const polyline = new naver.maps.Polyline({
                map: mapInstance.current,
                path: pathCoords,
                strokeColor: opt?.color || '#2563eb',
                strokeWeight: 6,
                strokeOpacity: 0.9,
                strokeStyle: 'solid',
                zIndex: 10,
                clickable: true,
            });
            polyline._routeKey = activeKey;
            naver.maps.Event.addListener(polyline, 'click', () => {
                selectRouteOption(activeKey);
            });
            mapPolylinesRef.current.push(polyline);
            pathCoords.forEach(p => allBounds.extend(p));
        }

        // 출발/도착 마커 (활성 경로 기준)
        const activeSummary = fullRoute[activeKey]?.[0]?.summary || firstSummary;
        if (activeSummary) {
            const startMarker = new naver.maps.Marker({
                position: new naver.maps.LatLng(activeSummary.start.location[1], activeSummary.start.location[0]),
                map: mapInstance.current,
                icon: {
                    content: `<div style="background:#2563eb;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">출발</div>`,
                    anchor: new naver.maps.Point(20, 15),
                },
            });
            mapMarkersRef.current.push(startMarker);

            const endMarker = new naver.maps.Marker({
                position: new naver.maps.LatLng(activeSummary.goal.location[1], activeSummary.goal.location[0]),
                map: mapInstance.current,
                icon: {
                    content: `<div style="background:#dc2626;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">도착</div>`,
                    anchor: new naver.maps.Point(20, 15),
                },
            });
            mapMarkersRef.current.push(endMarker);

            if (activeSummary.waypoints) {
                activeSummary.waypoints.forEach((wp, i) => {
                    const wpMarker = new naver.maps.Marker({
                        position: new naver.maps.LatLng(wp.location[1], wp.location[0]),
                        map: mapInstance.current,
                        icon: {
                            content: `<div style="background:#f59e0b;color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">경유${i + 1}</div>`,
                            anchor: new naver.maps.Point(22, 15),
                        },
                    });
                    mapMarkersRef.current.push(wpMarker);
                });
            }
        }

        mapInstance.current.fitBounds(allBounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }, []);

    /** 단일 경로 표시 (fallback) */
    const drawRoute = useCallback((routeData, color = '#2563eb') => {
        if (!mapInstance.current || !window.naver?.maps) return;
        clearMapOverlays();
        const naver = window.naver;
        const pathCoords = routeData.path.map(p => new naver.maps.LatLng(p[1], p[0]));
        const polyline = new naver.maps.Polyline({
            map: mapInstance.current, path: pathCoords,
            strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85, strokeStyle: 'solid',
        });
        mapPolylinesRef.current.push(polyline);
        const bounds = new naver.maps.LatLngBounds(pathCoords[0], pathCoords[0]);
        pathCoords.forEach(p => bounds.extend(p));
        mapInstance.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }, []);

    const clearMapOverlays = useCallback(() => {
        mapMarkersRef.current.forEach(m => m.setMap(null));
        mapMarkersRef.current = [];
        mapPolylinesRef.current.forEach(p => p.setMap(null));
        mapPolylinesRef.current = [];
    }, []);

    /* ─── 장소 검색 (디바운스) ─── */
    const handlePlaceSearch = useCallback((val, field) => {
        if (field === 'origin') setOrigin(prev => ({ ...prev, text: val, lng: null, lat: null }));
        else if (field === 'dest') setDestination(prev => ({ ...prev, text: val, lng: null, lat: null }));
        else if (field.startsWith('wp')) {
            const idx = parseInt(field.replace('wp', ''));
            setWaypoints(prev => {
                const next = [...prev];
                next[idx] = { ...next[idx], text: val, lng: null, lat: null };
                return next;
            });
        }

        setActiveField(field);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (!val || val.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        searchTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/safe-freight/place-search?keyword=${encodeURIComponent(val)}`);
                const data = await res.json();
                // 행정복지센터 우선 정렬 (#7)
                const sorted = prioritizeAdminCenter(data.results || []);
                setSearchResults(sorted);
                setShowDropdown(true);
            } catch (e) {
                console.error('Place search error:', e);
            }
        }, 300);
    }, []);

    /** 검색 결과에서 항목 선택 → 지도 이동 (#2)
     *  기존 state(juso)를 보존하면서 text, lng, lat 업데이트.
     *  + 카카오 좌표->행정동 변환 API 연계하여 r1, r2, r3도 동기화 */
    const selectPlace = useCallback(async (item, field) => {
        let r1 = '', r2 = '', r3 = '';
        if (item.lng && item.lat) {
            try {
                const res = await fetch(`/api/safe-freight/coord2region?x=${item.lng}&y=${item.lat}`);
                const data = await res.json();
                if (data.result) {
                    const r = data.result;
                    r1 = SIDO_MAP_SHORT[r.region_1depth_name] || r.region_1depth_name;
                    r2 = r.region_2depth_name;
                    r3 = r.region_3depth_name;
                }
            } catch (e) {
                console.warn('coord2region check failed:', e);
            }
        }

        const update = (prev) => {
            let defaultName = item.name || item.address;
            // 터미널/항구 관련 검색이 아니면 무조건 "행정동 행정복지센터"로 노출
            if (r3 && !['터미널', '항', 'ICD'].some(k => defaultName.includes(k))) {
                defaultName = `${r3} 행정복지센터`;
            }

            const next = {
                ...prev, // ← 기존 juso 보존
                text: defaultName,
                lng: item.lng,
                lat: item.lat
            };
            if (r1) { // 행정동 API 성공 시 연동
                next.r1 = r1;
                next.r2 = r2;
                next.r3 = r3;
            }
            return next;
        };

        if (field === 'origin') setOrigin(prev => update(prev));
        else if (field === 'dest') setDestination(prev => update(prev));
        else if (field.startsWith('wp')) {
            const idx = parseInt(field.replace('wp', ''));
            setWaypoints(prev => {
                const next = [...prev];
                next[idx] = update(next[idx]);
                return next;
            });
        }

        setShowDropdown(false);
        setSearchResults([]);

        // 📍 지도를 선택한 장소로 줌 (#2)
        if (item.lng && item.lat) {
            panToLocation(item.lng, item.lat, 13);
        }
    }, [panToLocation]);



    /* ─── 경유지 추가/삭제 ─── */
    const addWaypoint = () => {
        if (waypoints.length >= 3) return;
        setWaypoints(prev => [...prev, { text: '', lng: null, lat: null, r1: '', r2: '', r3: '', terminalKey: '' }]);
    };
    const removeWaypoint = (idx) => {
        setWaypoints(prev => prev.filter((_, i) => i !== idx));
    };

    /* ─── 경로 옵션 토글 ─── */
    const toggleOption = (optId) => {
        setSelectedOptions(prev => {
            if (prev.includes(optId)) {
                if (prev.length <= 1) return prev;
                return prev.filter(id => id !== optId);
            }
            return [...prev, optId];
        });
    };

    /* ─── 입력 필드 키보드 핸들러 (Enter/Tab) ─── */
    const handleInputKeyDown = useCallback((e, field) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (showDropdown && searchResults.length > 0) {
                // 드롭다운 열려 있으면 → 첫 번째 결과 선택
                selectPlace(searchResults[0], field);
            } else {
                // 드롭다운 없으면 → 검색 실행
                runSearch();
            }
        } else if (e.key === 'Tab') {
            if (showDropdown && searchResults.length > 0) {
                e.preventDefault();
                // 첫 번째 결과를 선택 후 다음 필드로
                selectPlace(searchResults[0], field);
            }
            // 드롭다운 없으면 기본 Tab 동작 (다음 필드 이동)
        }
    }, [showDropdown, searchResults, selectPlace]);

    /* ─── 토스트 ─── */
    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 2500);
    };

    /* ─── 전체 입력 폼 초기화 ─── */
    const clearAllInputs = () => {
        if (!window.confirm('입력된 모든 주소와 옵션을 초기화하시겠습니까?')) return;
        setOrigin({ text: '', lng: null, lat: null, r1: '', r2: '', r3: '', terminalKey: '', juso: '' });
        setDestination({ text: '', lng: null, lat: null, r1: '', r2: '', r3: '', terminalKey: '', juso: '' });
        setWaypoints([]);
        setSelectedOptions([]);
        setRouteResult(null);
        setSelectedRouteKey(null);
        setDistFareResult(null);
        setSectionFareResult(null);
        setSectionFareOneWay(null);
        setTerminalInfo({ origin: null, dest: null });
        // 지도 초기 위치
        if (mapInstance.current) {
            mapInstance.current.setCenter(new window.naver.maps.LatLng(DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]));
            mapInstance.current.setZoom(7);
        }
        showToast('🔄 모든 입력값이 초기화되었습니다.');
    };

    /* ═══════════════════════════════════════════════
       경로 탐색 실행
       ═══════════════════════════════════════════════ */
    const runSearch = async () => {
        setLoading(true);
        setError(null);
        setRouteResult(null);
        setSelectedRouteKey(null);
        setDistFareResult(null);
        setSectionFareResult(null);
        setSectionFareOneWay(null);

        try {
            // 1. 좌표 확보 (터미널 자동교정 포함)
            const resolveCoords = async (loc) => {
                // 🚀 최우선: 상세 주소(juso)가 입력되어 있다면 해당 지점을 좌표로 우선 변환
                if (loc.juso) {
                    try {
                        const res = await fetch(`/api/naver-maps/geocode?query=${encodeURIComponent(loc.juso)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.addresses?.length > 0) {
                                return { ...loc, text: loc.juso, lng: data.addresses[0].x, lat: data.addresses[0].y };
                            }
                        }
                    } catch (e) {
                        console.warn('Juso geocoding failed, trying secondary...', e);
                    }
                }

                // 2순위: 이미 정확한 좌표가 있는 경우 (터미널 선택 등)
                if (loc.lng && loc.lat) return loc;

                // 3순위: 터미널 키워드 자동 교정
                const termMatch = matchTerminalCoords(loc.text);
                if (termMatch) {
                    return { ...loc, text: termMatch.name, lng: termMatch.lng, lat: termMatch.lat };
                }

                // 4순위: 카카오 place-search → 행정복지센터 우선 검색
                let fallbackText = loc.text || '';
                // text나 juso 값이 하나도 없고, 3번 줄(selectbox)만 선택된 경우
                if (!fallbackText && !loc.juso && loc.r1) {
                    fallbackText = `${loc.r1} ${loc.r2} ${loc.r3}`.trim();
                }

                if (fallbackText) {
                    try {
                        const adminSuffix = /(면|읍|동)$/.test(fallbackText.trim());
                        const searchKeywords = adminSuffix
                            ? [`${fallbackText.trim()} 행정복지센터`, fallbackText]
                            : [fallbackText];

                        for (const keyword of searchKeywords) {
                            const kakaoRes = await fetch(`/api/safe-freight/place-search?keyword=${encodeURIComponent(keyword)}`);
                            const kakaoData = await kakaoRes.json();
                            if (kakaoData.results?.length > 0) {
                                const sorted = prioritizeAdminCenter(kakaoData.results);
                                const first = sorted[0];
                                return { ...loc, text: first.name || first.address || fallbackText, lng: first.lng, lat: first.lat };
                            }
                        }
                    } catch (e) {
                        console.warn('Kakao place search fallback:', e);
                    }

                    // 5순위: 일반 텍스트 네이버 지오코딩
                    try {
                        const res = await fetch(`/api/naver-maps/geocode?query=${encodeURIComponent(fallbackText)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.addresses?.length > 0) {
                                return { ...loc, text: fallbackText, lng: data.addresses[0].x, lat: data.addresses[0].y };
                            }
                        }
                    } catch (e) {
                        console.warn('Naver geocode fallback:', e);
                    }
                }

                throw new Error(`"${fallbackText || '선택한 위치'}" 정보를 좌표로 변환할 수 없습니다. 검색 결과에서 선택해주세요.`);
            };

            const resolvedOrigin = await resolveCoords(origin);
            setOrigin(resolvedOrigin);
            const resolvedDest = await resolveCoords(destination);
            setDestination(resolvedDest);

            // 좌표 확보 시 지도 이동 (#2)
            if (resolvedOrigin.lng && resolvedOrigin.lat) {
                panToLocation(resolvedOrigin.lng, resolvedOrigin.lat, 10);
            }

            const resolvedWps = [];
            for (let i = 0; i < waypoints.length; i++) {
                if (waypoints[i].text.trim()) {
                    const rw = await resolveCoords(waypoints[i]);
                    resolvedWps.push(rw);
                    setWaypoints(prev => {
                        const next = [...prev];
                        next[i] = rw;
                        return next;
                    });
                }
            }

            // 2. Directions 15 호출 — option 최대 3개 제한이므로 2회 분할
            const baseParams = {
                start: `${resolvedOrigin.lng},${resolvedOrigin.lat}`,
                goal: `${resolvedDest.lng},${resolvedDest.lat}`,
                cartype: String(cartype),
                fueltype: 'diesel',
            };

            if (resolvedWps.length > 0) {
                baseParams.waypoints = resolvedWps.map(w => `${w.lng},${w.lat}`).join('|');
            }

            // 출발시간 (#3, #6)
            if (timeMode === 'realtime') {
                // 실시간 = departtime 없이 호출 (현재 시각 기준)
                // API에서 departtime 미전송 시 현재 교통 상황 반영
            } else {
                // 06:00 기준
                baseParams.departtime = recent0600.departtime;
            }

            // 선택된 옵션을 3개씩 분할 (#1)
            const opts = selectedOptions.length > 0 ? selectedOptions : ['trafast', 'tracomfort', 'traoptimal'];
            const chunks = [];
            for (let i = 0; i < opts.length; i += 3) {
                chunks.push(opts.slice(i, i + 3));
            }

            let mergedRoute = {};
            let firstData = null;

            for (const chunk of chunks) {
                const params = new URLSearchParams({
                    ...baseParams,
                    option: chunk.join(':'),
                });

                const res = await fetch(`/api/naver-maps/directions15?${params.toString()}`);
                const data = await res.json();

                if (!res.ok || data.code !== 0) {
                    throw new Error(data.error || data.message || '경로 탐색에 실패했습니다.');
                }

                if (!firstData) firstData = data;
                if (data.route) {
                    mergedRoute = { ...mergedRoute, ...data.route };
                }
            }

            const fullResult = { ...firstData, route: mergedRoute };
            setRouteResult(fullResult);

            // 터미널 정보 (안내용, 거리 추가 X) (#4)
            // 원래 입력 텍스트(origin.text)도 함께 전달 — 교정 후에도 매칭되도록
            const tOrigin = findTerminalInfo(resolvedOrigin.text, origin.text);
            const tDest = findTerminalInfo(resolvedDest.text, destination.text);
            setTerminalInfo({ origin: tOrigin, dest: tDest });

            // 전체 경로 지도에 표시 + 첫 번째 선택
            const routeKeys = Object.keys(fullResult.route || {});
            if (routeKeys.length > 0) {
                const firstKey = routeKeys[0];
                setSelectedRouteKey(firstKey);
                // 전체 경로 동시 표시 (네이버 웹처럼)
                drawAllRoutes(fullResult.route, firstKey);
                const firstRoute = fullResult.route[firstKey]?.[0];
                if (firstRoute) {
                    await lookupFare(firstRoute.summary.distance, destination.text);
                }
            }

        } catch (err) {
            console.error('Route search error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    /* ─── 경로 옵션 클릭 시 전환 (전체 경로 유지, 활성 경로 강조) ─── */
    const selectRouteOption = async (key) => {
        if (!routeResult?.route?.[key]) return;
        setSelectedRouteKey(key);

        // 전체 경로 다시 그리되 활성 경로 강조
        drawAllRoutes(routeResult.route, key);

        const route = routeResult.route[key][0];
        if (!route) return;
        await lookupFare(route.summary.distance, destination.text);
    };

    /* ═══════════════════════════════════════════════
       운임 조회 — 거리별(항상) + 구간별(있으면)
       ═══════════════════════════════════════════════ */
    const lookupFare = async (distanceMeters, destText) => {
        const totalKm = metersToKm(distanceMeters);

        // ── 1) 거리별운임 (항상 조회) ──
        try {
            const params = new URLSearchParams({
                type: 'distance',
                period: displayPeriod,
                km: String(totalKm),
            });
            const res = await fetch(`/api/safe-freight/lookup?${params.toString()}`);
            const data = await res.json();

            if (data.rows?.length > 0) {
                const row = data.rows[0];
                setDistFareResult({
                    totalKm,
                    routeKm: totalKm,
                    period: row.period,
                    matchedKm: row.km,
                    f40위탁: row.f40위탁 || 0,
                    f40운수자: row.f40운수자 || 0,
                    f40안전: row.f40안전 || 0,
                    f20위탁: row.f20위탁 || 0,
                    f20운수자: row.f20운수자 || 0,
                    f20안전: row.f20안전 || 0,
                });
            } else {
                setDistFareResult(null);
            }
        } catch (err) {
            console.error('Distance fare lookup error:', err);
            setDistFareResult(null);
        }

        // ── 2) 구간별운임 — 도착지(기점) + 출발지(행선지) 등 동적 매칭 ──
        setSectionFareResult(null);
        setSectionFareOneWay(null);

        // 어느 것이 터미널(기점)이고 어느 것이 주소(행선지)인지 판단
        let termObj = origin;
        let addrObj = destination;

        if (destination.terminalKey && !origin.terminalKey) {
            termObj = destination;
            addrObj = origin;
        } else if (origin.terminalKey && !destination.terminalKey) {
            termObj = origin;
            addrObj = destination;
        } else {
            // 둘 다 터미널이거나 둘 다 주소인 경우 기존 로직에 따라 도착지를 기점 키워드로 시도
            termObj = destination;
            addrObj = origin;
        }

        const reqR1 = addrObj.r1;
        const reqR2 = addrObj.r2;
        const reqR3 = addrObj.r3;

        if (reqR1 && reqR2 && reqR3) {
            // 터미널 텍스트에서 기점 매칭 시도 (부산신항 → [왕복] 부산신항)
            const originsList = options?.origins || [];
            const termClean = (termObj.text || '').replace(/\s/g, '');
            // 왕복 기점 찾기
            let matchedOrigin = originsList.find(o => {
                const cleanId = o.id.replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
                return termClean.includes(cleanId) || cleanId.includes(termClean);
            });
            // 왕복 우선 매칭
            const roundOrigin = originsList.find(o => {
                const cleanId = o.id.replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
                return o.id.includes('[왕복]') && (termClean.includes(cleanId) || cleanId.includes(termClean));
            });
            if (roundOrigin) matchedOrigin = roundOrigin;

            if (matchedOrigin) {
                try {
                    const sParams = new URLSearchParams({
                        type: 'section',
                        period: displayPeriod,
                        origin: matchedOrigin.id,
                        region1: reqR1,
                        region2: reqR2,
                        region3: reqR3,
                        mode: 'latest',
                    });
                    const sRes = await fetch(`/api/safe-freight/lookup?${sParams.toString()}`);
                    const sData = await sRes.json();

                    if (sRes.ok && sData.rows?.length > 0) {
                        const sRow = sData.rows[0];
                        setSectionFareResult({
                            origin: matchedOrigin.id,
                            destination: `${reqR1} ${reqR2} ${reqR3}`,
                            period: sRow.period,
                            km: sRow.km,
                            f40위탁: sRow.f40위탁 || 0,
                            f40운수자: sRow.f40운수자 || 0,
                            f40안전: sRow.f40안전 || 0,
                            f20위탁: sRow.f20위탁 || 0,
                            f20운수자: sRow.f20운수자 || 0,
                            f20안전: sRow.f20안전 || 0,
                        });
                    }
                } catch (err) {
                    console.warn('Section fare lookup error:', err);
                }

                // ── 3) 수도권 편도 구간 찾기 ──
                const oneWayOrigin = originsList.find(o => {
                    const cleanId = o.id.replace(/\[.*?\]\s*/g, '').replace(/\s/g, '');
                    return o.id.includes('[편도]') && (termClean.includes(cleanId) || cleanId.includes(termClean));
                });
                if (oneWayOrigin) {
                    try {
                        const owParams = new URLSearchParams({
                            type: 'section',
                            period: displayPeriod,
                            origin: oneWayOrigin.id,
                            region1: reqR1,
                            region2: reqR2,
                            region3: reqR3,
                            mode: 'latest',
                        });
                        const owRes = await fetch(`/api/safe-freight/lookup?${owParams.toString()}`);
                        const owData = await owRes.json();

                        if (owRes.ok && owData.rows?.length > 0) {
                            const owRow = owData.rows[0];
                            setSectionFareOneWay({
                                origin: oneWayOrigin.id,
                                destination: `${reqR1} ${reqR2} ${reqR3}`,
                                period: owRow.period,
                                km: owRow.km,
                                f40위탁: owRow.f40위탁 || 0,
                                f40운수자: owRow.f40운수자 || 0,
                                f40안전: owRow.f40안전 || 0,
                                f20위탁: owRow.f20위탁 || 0,
                                f20운수자: owRow.f20운수자 || 0,
                                f20안전: owRow.f20안전 || 0,
                            });
                        }
                    } catch (err) {
                        console.warn('One-way section fare lookup error:', err);
                    }
                }
            }
        }
    };

    /* ─── 결과 저장 ─── */
    /* ─── 결과 저장 ─── */
    const saveResult = () => {
        if (!distFareResult || !routeResult) return;
        const sel = parsedRoutes.find(r => r.key === selectedRouteKey);

        const routeNameMap = {
            'trafast': '실시간 빠른길',
            'tracomfort': '실시간 편안한길',
            'traoptimal': '최적경로',
            'traavoidtoll': '통행료 회피',
            'traavoidcaronly': '이륜차 회피'
        };
        const routeName = routeNameMap[selectedRouteKey] || sel?.desc || selectedRouteKey;

        const createEntry = (fare, isSection, fareTypeLabel) => ({
            id: Date.now() + Math.random(), // 동시 저장 대비
            savedAt: new Date().toISOString(),
            type: 'route',
            typeLabel: fareTypeLabel,
            tripMode,
            fareType: isSection ? '구간제' : '거리제',
            period: fare.period,
            origin: isSection && fare.origin ? fare.origin : origin.text, // 편도/구간 기점 우선
            destination: isSection && fare.destination ? fare.destination : destination.text,
            waypoints: waypoints.filter(w => w.text).map(w => w.text),
            km: Number(distFareResult.routeKm || distFareResult.matchedKm || 0),
            matchedKm: Number(fare.km || distFareResult.matchedKm || 0),
            routeOption: routeName,

            // 안전운임 데이터
            f40위탁: Number(fare.f40위탁 || 0),
            f40운수자: Number(fare.f40운수자 || 0),
            f40안전: Number(fare.f40안전 || 0),
            f20위탁: Number(fare.f20위탁 || 0),
            f20운수자: Number(fare.f20운수자 || 0),
            f20안전: Number(fare.f20안전 || 0),

            // 운행 비용 데이터
            tollFare: Number(sel?.tollFare || 0),
            fuelCost: Number(sel?.fuelCost || 0),
            duration: Number(sel?.duration || 0),
            totalCost: Number(sel?.totalCost || 0),
        });

        const newEntries = [];

        // 1. 거리제 저장
        newEntries.push(createEntry(distFareResult, false, '거리제조회'));

        // 2. 구간제 (왕복 기준) 저장
        if (sectionFareResult) {
            newEntries.push(createEntry(sectionFareResult, true, '구간제조회'));
        }

        // 3. 수도권 편도 구간제 저장
        if (sectionFareOneWay) {
            newEntries.push(createEntry(sectionFareOneWay, true, '수도권편도제'));
        }

        setSavedResults(prev => {
            const next = [...newEntries.reverse(), ...prev];
            try {
                sessionStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(next));
                showToast(`✅ ${newEntries.length}개의 조회 결과가 저장되었습니다.`);
            } catch (_) {
                showToast('저장에 실패했습니다.');
            }
            return next;
        });
    };

    const removeSavedItem = (id) => {
        setSavedResults(prev => {
            const next = prev.filter(x => x.id !== id);
            sessionStorage.setItem(TEMP_RESULTS_KEY, JSON.stringify(next));
            return next;
        });
    };

    const clearSavedResults = () => {
        if (!window.confirm('모든 조회 내역을 삭제하시겠습니까?')) return;
        setSavedResults([]);
        sessionStorage.removeItem(TEMP_RESULTS_KEY);
        showToast('🗑️ 모든 내역이 삭제되었습니다.');
    };

    /* ─── 엑셀 다운로드 ─── */
    const downloadExcel = () => {
        if (!distFareResult && savedResults.length === 0) return;
        const sel = parsedRoutes.find(r => r.key === selectedRouteKey);

        const wb = XLSX.utils.book_new();

        // 헤더용 스타일 핼퍼 함수 (xlsx-js-style 전용)
        const baseStyle = { font: { size: 10, name: '맑은 고딕' }, alignment: { vertical: 'center' } };
        const headerStyle = {
            ...baseStyle,
            fill: { fgColor: { rgb: "F1F5F9" } }, // Slate-100
            font: { bold: true, size: 10, name: '맑은 고딕' },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
                top: { style: 'thin', color: { rgb: '94A3B8' } },
                left: { style: 'thin', color: { rgb: '94A3B8' } },
                bottom: { style: 'thin', color: { rgb: '94A3B8' } },
                right: { style: 'thin', color: { rgb: '94A3B8' } }
            }
        };
        const titleStyle = {
            font: { bold: true, sz: 12, color: { rgb: "2563EB" }, name: '맑은 고딕' },
        };

        // Sheet 1: 현재 운임 조회 결과
        if (distFareResult) {
            const fareRows = [
                ['안전운임 구간조회 결과'],
                [],
                ['항목', '값'],
                ['출발지', origin.text || '-'],
                ['도착지', destination.text || '-'],
                ...(waypoints.filter(w => w.text).map((w, i) => [`경유지${i + 1}`, w.text])),
                ['선택 경로', sel?.desc || selectedRouteKey],
                ['구간거리', `${distFareResult.routeKm}km`],
                ['적용거리 (고시 매칭)', `${distFareResult.matchedKm}km`],
                ['적용기간', distFareResult.period],
                ['왕복/편도', tripMode === 'round' ? '왕복' : '편도'],
                [],
                ['[거리별운임]', '위탁', '운수자', '안전운임'],
                ['40FT', distFareResult.f40위탁, distFareResult.f40운수자, distFareResult.f40안전],
                ['20FT', distFareResult.f20위탁, distFareResult.f20운수자, distFareResult.f20안전],
            ];
            if (sectionFareResult) {
                fareRows.push([], [`[구간별운임] ${sectionFareResult.origin}`, '위탁', '운수자', '안전운임']);
                fareRows.push(['40FT', sectionFareResult.f40위탁, sectionFareResult.f40운수자, sectionFareResult.f40안전]);
                fareRows.push(['20FT', sectionFareResult.f20위탁, sectionFareResult.f20운수자, sectionFareResult.f20안전]);
            }
            if (sectionFareOneWay) {
                fareRows.push([], [`[편도구간] ${sectionFareOneWay.origin}`, '위탁', '운수자', '안전운임']);
                fareRows.push(['40FT', sectionFareOneWay.f40위탁, sectionFareOneWay.f40운수자, sectionFareOneWay.f40안전]);
                fareRows.push(['20FT', sectionFareOneWay.f20위탁, sectionFareOneWay.f20운수자, sectionFareOneWay.f20안전]);
            }

            if (sel) {
                fareRows.push([], ['[운행비용 상세 (편도기준)]']);
                fareRows.push(['소요시간', msToTime(sel.durationOneWay)]);
                fareRows.push(['통행료', `${sel.tollOneWay.toLocaleString()}원`]);
                fareRows.push(['경유단가 (Opinet)', `${dieselPrice.toLocaleString()}원/L (${fuelPriceData?.date || '최근'})`]);
                fareRows.push(['연비 설정', `${currentMileage}km/L`]);
                fareRows.push(['예상 연료량', `${sel.litersOneWay}L`]);
                fareRows.push(['유류비 합계', `${sel.fuelCostOneWay.toLocaleString()}원`]);
                fareRows.push(['운행비용 소계', `${sel.totalCostOneWay?.toLocaleString() || (sel.tollOneWay + sel.fuelCostOneWay).toLocaleString()}원`]);

                if (tripMode === 'round') {
                    fareRows.push([], ['[왕복 운행비용 합계 (x2)]']);
                    fareRows.push(['총 소요시간', msToTime(sel.duration)]);
                    fareRows.push(['총 통행료', `${sel.tollFare.toLocaleString()}원`]);
                    fareRows.push(['총 유류비', `${sel.fuelCost.toLocaleString()}원`]);
                    fareRows.push(['총 연료공급량', `${sel.liters}L`]);
                    fareRows.push(['최종 운행비 합계', `${sel.totalCost.toLocaleString()}원`]);
                }
            }

            const ws1 = XLSX.utils.aoa_to_sheet(fareRows);
            ws1['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 15 }, { wch: 15 }];

            // 스타일 및 틀고정 적용
            const r1 = XLSX.utils.decode_range(ws1['!ref']);
            for (let r = 0; r <= r1.e.r; r++) {
                for (let c = 0; c <= r1.e.c; c++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    if (!ws1[ref]) ws1[ref] = { v: '', t: 's' };
                    ws1[ref].s = { ...baseStyle };
                    if (r === 0) ws1[ref].s = titleStyle;
                    if (fareRows[r]?.[0]?.toString().startsWith('[') || fareRows[r]?.[0] === '항목') {
                        ws1[ref].s = headerStyle;
                    }
                }
            }
            ws1['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }];
            ws1['!autofilter'] = { ref: 'A3:D3' }; // 항목행 필터

            XLSX.utils.book_append_sheet(wb, ws1, '현재조회결과');

            // Sheet 1-2: 전체 경로 비교
            const routeRows = [
                ['전체 경로 대안 비교'],
                [],
                ['경로', '거리(km)', '소요시간', '통행료(원)', '유류비(원)', '예상연료(L)', '운행비합계(원)'],
                ...parsedRoutes.map(r => [
                    r.desc, r.distKm, msToTime(r.duration),
                    r.tollFare, r.fuelCost, r.liters, r.totalCost,
                ]),
            ];
            const ws2 = XLSX.utils.aoa_to_sheet(routeRows);
            ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

            const r2 = XLSX.utils.decode_range(ws2['!ref']);
            for (let r = 0; r <= r2.e.r; r++) {
                for (let c = 0; c <= r2.e.c; c++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    if (!ws2[ref]) ws2[ref] = { v: '', t: 's' };
                    ws2[ref].s = { ...baseStyle };
                    if (r === 2) ws2[ref].s = headerStyle;
                }
            }
            ws2['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft' }];
            ws2['!autofilter'] = { ref: 'A3:G3' };

            XLSX.utils.book_append_sheet(wb, ws2, '경로비교');
        }

        // Sheet 2: 이전 조회 내역 (History)
        if (savedResults.length > 0) {
            const historyRows = [
                ['이전 조회 내역 (임시보존)'],
                [],
                ['순번', '저장시각', '구분', '유형', '적용기간', '구간', '거리(km)', '40FT위탁', '40FT운수자', '40FT안전', '20FT위탁', '20FT운수자', '20FT안전'],
                ...savedResults.map((s, idx) => [
                    savedResults.length - idx,
                    new Date(s.savedAt || s.id).toLocaleString('ko-KR'),
                    s.typeLabel,
                    s.tripMode === 'round' ? '왕복' : '편도',
                    s.period,
                    `${s.origin} → ${s.destination}`,
                    s.km,
                    s.f40위탁, s.f40운수자, s.f40안전,
                    s.f20위탁, s.f20운수자, s.f20안전
                ])
            ];
            const wsHistory = XLSX.utils.aoa_to_sheet(historyRows);
            wsHistory['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

            const rh = XLSX.utils.decode_range(wsHistory['!ref']);
            for (let r = 0; r <= rh.e.r; r++) {
                for (let c = 0; c <= rh.e.c; c++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    if (!wsHistory[ref]) wsHistory[ref] = { v: '', t: 's' };
                    wsHistory[ref].s = { ...baseStyle };
                    if (r === 2) wsHistory[ref].s = headerStyle;
                }
            }
            wsHistory['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft' }];
            wsHistory['!autofilter'] = { ref: 'A3:M3' };

            XLSX.utils.book_append_sheet(wb, wsHistory, '이전조회내역');
        }

        const now = new Date();
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');

        const dateStr = `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
        XLSX.writeFile(wb, `안전운임_구간조회_${dateStr}.xlsx`);
        showToast('📄 엑셀 파일이 다운로드되었습니다.');
    };

    /* ═══════════════════════════════════════════════
       파싱된 경로 목록 (톨비 + 유류비 + 시간 계산)
       — 왕복일 때 톨비/유류비 x2 (#1)
       ═══════════════════════════════════════════════ */
    const fuelInfo = fuelPriceData?.[selectedFuel] || {};
    const currentFuelPrice = fuelInfo?.price || 0;
    const currentFuelDiff = fuelInfo?.diff || 0;
    const weekDiff = fuelInfo?.weekDiff || 0;
    const monthDiff = fuelInfo?.monthDiff || 0;

    const tripMult = tripMode === 'round' ? 2 : 1; // 운행비 왕복 배수
    const parsedRoutes = useMemo(() => {
        if (!routeResult?.route) return [];
        const result = [];
        for (const [key, routes] of Object.entries(routeResult.route)) {
            if (!routes?.[0]) continue;
            const s = routes[0].summary;
            const opt = ROUTE_OPTIONS.find(o => o.id === key);
            const distKm = metersToKm(s.distance);
            // 편도 기준 연료/톨비
            const litersOne = currentMileage > 0 ? distKm / currentMileage : 0;
            const fuelCostOne = currentFuelPrice > 0 ? Math.round(litersOne * currentFuelPrice) : (s.fuelPrice || 0);
            const tollOne = s.tollFare || 0;
            // 왕복일 때 x2
            const liters = Math.round(litersOne * tripMult * 10) / 10;
            const fuelCost = fuelCostOne * tripMult;
            const tollFare = tollOne * tripMult;
            result.push({
                key,
                label: opt?.label || key,
                desc: opt?.desc || key,
                color: opt?.color || '#64748b',
                distance: s.distance,
                distKm,
                duration: s.duration * tripMult,
                durationOneWay: s.duration,
                tollFare,
                tollOneWay: tollOne,
                liters,
                litersOneWay: Math.round(litersOne * 10) / 10,
                fuelCost,
                fuelCostOneWay: fuelCostOne,
                totalCost: tollFare + fuelCost,
            });
        }
        // 법규 적용: 가장 짧은 구간이 기준 → 거리순 정렬 반영
        return result.sort((a,b) => a.distKm - b.distKm);
    }, [routeResult, currentFuelPrice, currentMileage, tripMult]);

    /* ═══════════════════════════════════════════════
       렌더링
       ═══════════════════════════════════════════════ */
    return (
        <div className={styles.wrapper}>
            <Script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js" strategy="afterInteractive" />

            {/* 상단 헤더 & 정보 */}
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <span className={styles.titleIcon}>🗺️</span>
                    구간조회 — 네이버 지도 기반 경로 탐색
                </h2>
                <div className={styles.headerRight}>
                    <button type="button" className={styles.legalBtn} onClick={() => setShowLegalPopup(true)}>
                        📋 관련 법규
                    </button>
                    <button type="button" className={styles.backBtn} onClick={onBack}>
                        ← 운임조회로 돌아가기
                    </button>
                </div>
            </div>

            {/* ━━━ ROW 1: 옵션 바 (풀와이드) ━━━ */}
            <div className={styles.optionBar}>
                <div className={styles.optionItem}>
                    <label className={styles.miniLabel}>차종</label>
                    <select className={styles.miniSelect} value={cartype} onChange={e => setCartype(Number(e.target.value))}>
                        {CAR_TYPES.map(ct => (<option key={ct.id} value={ct.id}>{ct.label}</option>))}
                    </select>
                </div>
                <div className={styles.optionItem}>
                    <label className={styles.miniLabel}>출발시간</label>
                    <div className={styles.timeModeRow}>
                        <button
                            type="button"
                            className={`${styles.timeModeBtn} ${timeMode === 'scheduled' ? styles.timeModeBtnActive : ''}`}
                            onClick={() => setTimeMode('scheduled')}
                        >
                            ⏰ {recent0600.label}
                        </button>
                        <button
                            type="button"
                            className={`${styles.timeModeBtn} ${timeMode === 'realtime' ? styles.timeModeBtnActive : ''}`}
                            onClick={() => setTimeMode('realtime')}
                        >
                            🔴 실시간
                        </button>
                    </div>
                </div>
                <div className={styles.optionItem}>
                    <label className={styles.miniLabel}>운송구분</label>
                    <div className={styles.radioRow}>
                        <label className={styles.radioLabel}>
                            <input type="radio" name="tripModeRoute" value="round" checked={tripMode === 'round'} onChange={() => setTripMode('round')} />
                            왕복
                        </label>
                        <label className={styles.radioLabel}>
                            <input type="radio" name="tripModeRoute" value="oneWay" checked={tripMode === 'oneWay'} onChange={() => setTripMode('oneWay')} />
                            편도
                        </label>
                    </div>
                </div>
                <div className={styles.optionItem}>
                    <label className={styles.miniLabel}>적용기간</label>
                    <select className={styles.miniSelect} value={displayPeriod} onChange={e => setDisplayPeriod(e.target.value)}>
                        {(options?.periods || []).map(p => (
                            <option key={p.id} value={p.id}>{p.label || p.id}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ━━━ ROW 2: 경로입력(좌) + 지도(우) ━━━ */}
            <div className={styles.mainGrid}>
                <div className={styles.leftPanel}>
                    <div className={styles.routeInputs}>
                        <LocationBlock
                            fieldKey="origin"
                            locState={origin}
                            setLocState={setOrigin}
                            placeholder="출발지 (기점 또는 행선지) 입력"
                            dotColor="#2563eb"
                            showTerminal={true}
                            regionsData={options?.regions}
                            handlePlaceSearch={handlePlaceSearch}
                            handleInputKeyDown={handleInputKeyDown}
                            setActiveField={setActiveField}
                            searchResults={activeField === 'origin' ? searchResults : []}
                            showDropdown={activeField === 'origin' ? showDropdown : false}
                            onPlaceSelect={item => selectPlace(item, 'origin')}
                        />

                        {waypoints.map((wp, i) => (
                            <LocationBlock
                                key={`wp${i}`}
                                fieldKey={`wp${i}`}
                                locState={wp}
                                setLocState={val => {
                                    const next = [...waypoints];
                                    next[i] = typeof val === 'function' ? val(next[i]) : val;
                                    setWaypoints(next);
                                }}
                                placeholder={`경유지 ${i + 1}`}
                                dotColor="#f59e0b"
                                showTerminal={false}
                                regionsData={options?.regions}
                                onRemove={() => removeWaypoint(i)}
                                handlePlaceSearch={handlePlaceSearch}
                                handleInputKeyDown={handleInputKeyDown}
                                setActiveField={setActiveField}
                                searchResults={activeField === `wp${i}` ? searchResults : []}
                                showDropdown={activeField === `wp${i}` ? showDropdown : false}
                                onPlaceSelect={item => selectPlace(item, `wp${i}`)}
                            />
                        ))}

                        <LocationBlock
                            fieldKey="dest"
                            locState={destination}
                            setLocState={setDestination}
                            placeholder="도착지 (기점 또는 행선지) 입력"
                            dotColor="#dc2626"
                            showTerminal={true}
                            regionsData={options?.regions}
                            handlePlaceSearch={handlePlaceSearch}
                            handleInputKeyDown={handleInputKeyDown}
                            setActiveField={setActiveField}
                            searchResults={activeField === 'dest' ? searchResults : []}
                            showDropdown={activeField === 'dest' ? showDropdown : false}
                            onPlaceSelect={item => selectPlace(item, 'dest')}
                        />

                        {/* 경유지 추가 */}
                        {waypoints.length < 3 && (
                            <button type="button" className={styles.addWpBtn} onClick={addWaypoint}>
                                + 경유지 추가 (최대 3개)
                            </button>
                        )}


                    </div>

                    {/* 경로 옵션 */}
                    <div className={styles.routeOptionsBar}>
                        <label className={styles.miniLabel}>경로 옵션 (최대 5개, 네이버 지도 기준)</label>
                        <div className={styles.optionChips}>
                            {ROUTE_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    className={`${styles.chip} ${selectedOptions.includes(opt.id) ? styles.chipActive : ''}`}
                                    style={selectedOptions.includes(opt.id) ? { borderColor: opt.color, color: opt.color } : {}}
                                    onClick={() => toggleOption(opt.id)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 검색 버튼 */}
                    <div className={styles.searchActionRow}>
                        <button
                            type="button"
                            className={styles.resetBtn}
                            onClick={clearAllInputs}
                        >
                            🔄 전체 초기화
                        </button>
                        <button
                            type="button"
                            className={styles.searchBtn}
                            onClick={runSearch}
                            disabled={loading || (!origin.text && !origin.juso && !origin.r1) || (!destination.text && !destination.juso && !destination.r1)}
                        >
                            {loading ? '경로 탐색 중...' : '🔍 경로 탐색 및 운임 조회'}
                        </button>
                    </div>

                    {error && <p className={styles.errorText}>{error}</p>}
                </div>

                {/* 우측: 지도 */}
                <div className={styles.rightPanel}>
                    <div className={styles.mapWrap}>
                        <div ref={mapContainerRef} className={styles.mapCanvas} />
                        {!mapReady && !mapError && (
                            <div className={styles.mapLoading}>
                                <div className={styles.spinner} />
                                <span>지도 로딩 중...</span>
                            </div>
                        )}
                        {mapError && (
                            <div className={styles.mapLoading}>
                                <span style={{ color: '#dc2626' }}>⚠️ 네이버 지도 로드 실패</span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                    NCP 콘솔에서 URL 등록을 확인해주세요
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 지도 안내 (풀와이드) */}
            <div className={styles.mapNotice}>
                <strong>안전운임고시 기준:</strong> 네이버 지도(거리우선, 차종 5종 4축 이상)를 이용하여 오전 06:00에 측정하는 것을 기준으로 합니다.
                {timeMode === 'scheduled' && <> (적용 시각: <strong>{recent0600.label}</strong>)</>}
                {timeMode === 'realtime' && <> (현재 <strong>실시간</strong> 교통 반영)</>}
                {' '}지도를 클릭하면 해당 위치가 현재 활성 입력 필드의 주소로 설정됩니다.
            </div>

            {/* ━━━ ROW 3: 결과 영역 (풀와이드 2열) ━━━ */}
            {(parsedRoutes.length > 0 || distFareResult) && (
                <div className={styles.resultSection}>
                    {/* 좌: 경로 대안 카드 */}
                    {parsedRoutes.length > 0 && (
                        <div className={styles.resultRoutes}>
                            <p className={styles.sectionLabel}>
                                탐색된 경로 ({parsedRoutes.length}건)
                                {currentFuelPrice > 0 && (
                                    <span className={styles.fuelPriceGroup}>
                                        <select 
                                            value={selectedFuel} 
                                            onChange={e => setSelectedFuel(e.target.value)}
                                            style={{ marginLeft: 6, marginRight: 4, borderRadius: 4, border: '1px solid #cbd5e1' }}
                                        >
                                            <option value="diesel">경유</option>
                                            <option value="gasoline">휘발유</option>
                                        </select>
                                        <span className={styles.fuelPriceBadge} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', fontSize: 13 }}>
                                            ⛽ {currentFuelPrice.toLocaleString()}원/L 
                                            <span style={{color: currentFuelDiff > 0 ? '#ef4444' : currentFuelDiff < 0 ? '#3b82f6' : '#64748b'}}>({currentFuelDiff > 0 ? '+' : ''}{currentFuelDiff})</span>
                                            <span style={{color: '#64748b', borderLeft: '1px solid #e2e8f0', paddingLeft: 6}}>1주: <b style={{color: weekDiff > 0 ? '#ef4444' : weekDiff < 0 ? '#3b82f6' : '#64748b'}}>{weekDiff > 0 ? '+' : ''}{weekDiff}</b></span>
                                            <span style={{color: '#64748b'}}>1달: <b style={{color: monthDiff > 0 ? '#ef4444' : monthDiff < 0 ? '#3b82f6' : '#64748b'}}>{monthDiff > 0 ? '+' : ''}{monthDiff}</b></span>
                                        </span>
                                    </span>
                                )}
                            </p>
                            {parsedRoutes.map(r => {
                                const isRound = tripMode === 'round';
                                return (
                                    <button
                                        key={r.key}
                                        type="button"
                                        className={`${styles.routeCard} ${selectedRouteKey === r.key ? styles.routeCardActive : ''}`}
                                        style={selectedRouteKey === r.key ? { borderColor: r.color } : {}}
                                        onClick={() => selectRouteOption(r.key)}
                                    >
                                        <span className={styles.routeColor} style={{ background: r.color }} />
                                        <div className={styles.routeCardBody}>
                                            <span className={styles.routeLabel}>{r.desc}</span>
                                            <span className={styles.routeStats}>
                                                {r.distKm}km · {msToTime(r.durationOneWay || r.duration)}
                                                {isRound && ` (왕복 ${msToTime(r.duration)})`}
                                            </span>
                                            <span className={styles.routeCosts}>
                                                {r.tollOneWay > 0 && <>🛣️ 통행료 {r.tollOneWay.toLocaleString()}원</>}
                                                {isRound && r.tollFare > 0 && ` (왕복 ${r.tollFare.toLocaleString()}원)`}
                                                {(r.tollOneWay > 0 || r.tollFare > 0) && r.fuelCostOneWay > 0 && ' · '}
                                                {r.fuelCostOneWay > 0 && <>⛽ 유류비 {r.fuelCostOneWay.toLocaleString()}원</>}
                                                {isRound && r.fuelCost > 0 && ` (왕복 ${r.fuelCost.toLocaleString()}원)`}
                                            </span>
                                        </div>
                                        {selectedRouteKey === r.key && <span className={styles.routeCheck}>✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 우: 운임 결과 */}
                    <div className={styles.resultFare}>
                        <p className={styles.sectionLabel}>안전운임 조회 결과</p>

                        {/* 선택된 경로 운행비용 요약 */}
                        {(() => {
                            const sel = parsedRoutes.find(r => r.key === selectedRouteKey);
                            if (!sel) return null;
                            const isRound = tripMode === 'round';
                            return (
                                <div className={styles.drivingSummary}>
                                    <p className={styles.drivingTitle}>🚛 선택 경로 운행비용 {isRound ? '(왕복 기준 정보 포함)' : '(편도)'}</p>
                                    <div className={styles.drivingGrid}>
                                        <div className={styles.drivingItem}>
                                            <span className={styles.drivingLabel}>거리</span>
                                            <span className={styles.drivingValue}>{sel.distKm}km</span>
                                        </div>
                                        <div className={styles.drivingItem}>
                                            <span className={styles.drivingLabel}>소요시간 (편도)</span>
                                            <span className={styles.drivingValue}>
                                                {msToTime(sel.durationOneWay)}
                                                {isRound && <span className={styles.oneWayNote}> (왕복 {msToTime(sel.duration)})</span>}
                                            </span>
                                        </div>
                                        <div className={styles.drivingItem}>
                                            <span className={styles.drivingLabel}>🛣️ 통행료 (편도)</span>
                                            <span className={styles.drivingValue}>
                                                {sel.tollOneWay > 0 ? `${sel.tollOneWay.toLocaleString()}원` : '무료'}
                                                {isRound && sel.tollFare > 0 && <span className={styles.oneWayNote}> (왕복 {sel.tollFare.toLocaleString()}원)</span>}
                                            </span>
                                        </div>
                                        <div className={styles.drivingItem}>
                                            <span className={styles.drivingLabel}>⛽ 유류비 (편도)</span>
                                            <span className={styles.drivingValue}>
                                                {sel.fuelCostOneWay > 0 ? `${sel.fuelCostOneWay.toLocaleString()}원` : '-'}
                                                {isRound && sel.fuelCost > 0 && <span className={styles.oneWayNote}> (왕복 {sel.fuelCost.toLocaleString()}원)</span>}
                                            </span>
                                        </div>
                                        <div className={styles.drivingItem}>
                                            <span className={styles.drivingLabel}>예상 연료 (편도)</span>
                                            <span className={styles.drivingValue}>
                                                {sel.litersOneWay}L (연비 {currentMileage}km/L)
                                                {isRound && <span className={styles.oneWayNote}> (왕복 {sel.liters}L)</span>}
                                            </span>
                                        </div>
                                        <div className={`${styles.drivingItem} ${styles.drivingItemTotal}`}>
                                            <span className={styles.drivingLabel}>운행비 합계 (편도)</span>
                                            <span className={styles.drivingValueTotal}>{(sel.tollOneWay + sel.fuelCostOneWay).toLocaleString()}원</span>
                                            {isRound && <span className={styles.oneWayNote} style={{ marginLeft: '6px' }}> (왕복 {sel.totalCost.toLocaleString()}원)</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── 거리별운임 (항상 표시) ── */}
                        {distFareResult && (
                            <>
                                <div className={styles.fareSectionHeader}>
                                    <span className={styles.fareSectionBadge} style={{ background: '#2563eb' }}>거리별</span>
                                    거리별운임 ({distFareResult.matchedKm}km 기준)
                                </div>
                                <div className={styles.distanceSummary}>
                                    <div className={styles.distRow}>
                                        <span>구간거리 (네이버 지도)</span>
                                        <strong>{distFareResult.routeKm}km</strong>
                                    </div>
                                    <div className={`${styles.distRow} ${styles.distTotal}`}>
                                        <span>적용 거리 (고시 매칭)</span>
                                        <strong>{distFareResult.matchedKm}km</strong>
                                    </div>
                                    <div className={styles.distRow}>
                                        <span>적용 기간</span>
                                        <strong>{distFareResult.period}</strong>
                                    </div>
                                </div>
                                <table className={styles.fareTable}>
                                    <thead>
                                        <tr><th></th><th>위탁</th><th>운수자</th><th>안전</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚛 40FT</td>
                                            <td>{formatWon(distFareResult.f40위탁)}</td>
                                            <td>{formatWon(distFareResult.f40운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(distFareResult.f40안전)}</td>
                                        </tr>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚚 20FT</td>
                                            <td>{formatWon(distFareResult.f20위탁)}</td>
                                            <td>{formatWon(distFareResult.f20운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(distFareResult.f20안전)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </>
                        )}

                        {/* ── 구간별운임 (있으면만 표시) ── */}
                        {sectionFareResult && (
                            <>
                                <div className={styles.fareSectionHeader} style={{ marginTop: '16px' }}>
                                    <span className={styles.fareSectionBadge} style={{ background: '#059669' }}>구간별</span>
                                    구간별운임 — {sectionFareResult.origin}
                                </div>
                                <div className={styles.distanceSummary}>
                                    <div className={styles.distRow}>
                                        <span>기점</span>
                                        <strong>{sectionFareResult.origin}</strong>
                                    </div>
                                    <div className={styles.distRow}>
                                        <span>행선지</span>
                                        <strong>{sectionFareResult.destination}</strong>
                                    </div>
                                    <div className={styles.distRow}>
                                        <span>고시 거리 / 기간</span>
                                        <strong>{sectionFareResult.km}km · {sectionFareResult.period}</strong>
                                    </div>
                                </div>
                                <table className={styles.fareTable}>
                                    <thead>
                                        <tr><th></th><th>위탁</th><th>운수자</th><th>안전</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚛 40FT</td>
                                            <td>{formatWon(sectionFareResult.f40위탁)}</td>
                                            <td>{formatWon(sectionFareResult.f40운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(sectionFareResult.f40안전)}</td>
                                        </tr>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚚 20FT</td>
                                            <td>{formatWon(sectionFareResult.f20위탁)}</td>
                                            <td>{formatWon(sectionFareResult.f20운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(sectionFareResult.f20안전)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </>
                        )}

                        {/* ── 수도권 편도 구간운임 (있으면만 표시) ── */}
                        {sectionFareOneWay && (
                            <>
                                <div className={styles.fareSectionHeader} style={{ marginTop: '16px' }}>
                                    <span className={styles.fareSectionBadge} style={{ background: '#d97706' }}>편도</span>
                                    수도권 편도구간 — {sectionFareOneWay.origin}
                                </div>
                                <div className={styles.distanceSummary}>
                                    <div className={styles.distRow}>
                                        <span>기점</span>
                                        <strong>{sectionFareOneWay.origin}</strong>
                                    </div>
                                    <div className={styles.distRow}>
                                        <span>행선지</span>
                                        <strong>{sectionFareOneWay.destination}</strong>
                                    </div>
                                    <div className={styles.distRow}>
                                        <span>고시 거리 / 기간</span>
                                        <strong>{sectionFareOneWay.km}km · {sectionFareOneWay.period}</strong>
                                    </div>
                                </div>
                                <table className={styles.fareTable}>
                                    <thead>
                                        <tr><th></th><th>위탁</th><th>운수자</th><th>안전</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚛 40FT</td>
                                            <td>{formatWon(sectionFareOneWay.f40위탁)}</td>
                                            <td>{formatWon(sectionFareOneWay.f40운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(sectionFareOneWay.f40안전)}</td>
                                        </tr>
                                        <tr>
                                            <td className={styles.fareRowLabel}>🚚 20FT</td>
                                            <td>{formatWon(sectionFareOneWay.f20위탁)}</td>
                                            <td>{formatWon(sectionFareOneWay.f20운수자)}</td>
                                            <td className={styles.fareHighlight}>{formatWon(sectionFareOneWay.f20안전)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </>
                        )}

                        {/* 구간별운임 미존재 안내 */}
                        {!sectionFareResult && distFareResult && (
                            <p className={styles.noSectionNote}>
                                ※ 해당 구간은 구간별운임(고시 별표6)에 등록되지 않은 구간입니다. 위 거리별운임을 참고하세요.
                            </p>
                        )}

                        {/* 터미널 안내 */}
                        {(terminalInfo.origin || terminalInfo.dest) && (
                            <div className={styles.terminalInfoBox}>
                                <p className={styles.terminalInfoTitle}>⚓ 터미널 내 운송거리 안내</p>
                                <p className={styles.terminalInfoDesc}>
                                    아래 터미널의 내부 운송거리는 <strong>안전운임 고시 거리에 이미 포함</strong>되어 있습니다.
                                    (고시 제33조, 제35조)
                                </p>
                                {terminalInfo.origin && (
                                    <p className={styles.terminalInfoItem}>
                                        🔵 출발: {terminalInfo.origin.full} (내부 {terminalInfo.origin.km}km 포함)
                                    </p>
                                )}
                                {terminalInfo.dest && (
                                    <p className={styles.terminalInfoItem}>
                                        🔴 도착: {terminalInfo.dest.full} (내부 {terminalInfo.dest.km}km 포함)
                                    </p>
                                )}
                            </div>
                        )}

                        <div className={styles.actionBtnRow}>
                            <button type="button" className={styles.saveBtn} onClick={saveResult}>
                                💾 저장
                            </button>
                            <button type="button" className={styles.excelBtn} onClick={downloadExcel} disabled={!distFareResult && savedResults.length === 0}>
                                📄 엑셀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 이전 조회 내역 (History) ── */}
            {savedResults.length > 0 && (
                <div className={styles.savedSectionFull}>
                    <div className={styles.savedHeader}>
                        <p className={styles.sectionLabel}>이전 조회 내역</p>
                        <button type="button" onClick={clearSavedResults} className={styles.clearBtn}>내역 비우기</button>
                    </div>
                    <ul className={styles.savedList}>
                        {savedResults.map((s, idx) => {
                            const savedAt = new Date(s.savedAt || s.id).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
                            const seqNum = savedResults.length - idx;
                            return (
                                <li key={s.id} className={styles.savedItem}>
                                    <div className={styles.savedHead}>
                                        <div className={styles.savedHeadLeft}>
                                            <span className={styles.sNo}>No.{seqNum}</span>
                                            <span className={styles.sDate}>{savedAt}</span>
                                            <span className={styles.sBadge}>{s.fareType || '거리제'}조회</span>
                                            <span className={s.tripMode === 'round' ? styles.sRound : styles.sOneWay}>
                                                {s.tripMode === 'round' ? '왕복' : '편도'}
                                            </span>
                                        </div>
                                        <button type="button" className={styles.sDel} onClick={() => removeSavedItem(s.id)}>삭제</button>
                                    </div>

                                    <div className={styles.savedBody}>
                                        <div className={styles.sRouteInfo}>
                                            <div className={styles.sRouteLine}>
                                                <strong>{s.origin}</strong> ➔ <strong>{s.destination}</strong>
                                            </div>
                                            <div className={styles.sRouteMeta}>
                                                <span>운임타입: {s.fareType || '거리제'}</span>
                                                <span>경로옵션: {s.routeOption}</span>
                                                <span>지도: {s.km}km / 고시: {s.matchedKm || 0}km</span>
                                                <span>적용월: {s.period}</span>
                                            </div>
                                        </div>

                                        <div className={styles.sDataGrid}>
                                            <div className={styles.sCostBox}>
                                                <div className={styles.sBoxTitle}>⛽ 실제 운행 비용 ({s.tripMode === 'round' ? '왕복' : '편도'})</div>
                                                <div className={styles.sCostTable}>
                                                    <div className={styles.sCostRow}><span>소요시간</span> <strong>{msToTime(s.duration)}</strong></div>
                                                    <div className={styles.sCostRow}><span>통행료</span> <strong>{(s.tollFare || 0).toLocaleString()}원</strong></div>
                                                    <div className={styles.sCostRow}><span>유류비</span> <strong>{(s.fuelCost || 0).toLocaleString()}원</strong></div>
                                                    <div className={styles.sCostRowTotal}><span>합계</span> <strong>{(s.totalCost || 0).toLocaleString()}원</strong></div>
                                                </div>
                                            </div>

                                            <div className={styles.sFareBox}>
                                                <div className={styles.sBoxTitle}>⚖️ 고시 안전운임</div>
                                                <table className={styles.sFareTable}>
                                                    <thead>
                                                        <tr><th>구분</th><th>위탁</th><th>운수자</th><th>안전</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr><td>40FT</td><td>{(s.f40위탁 || 0).toLocaleString()}</td><td>{(s.f40운수자 || 0).toLocaleString()}</td><td className={styles.sHi}>{(s.f40안전 || 0).toLocaleString()}</td></tr>
                                                        <tr><td>20FT</td><td>{(s.f20위탁 || 0).toLocaleString()}</td><td>{(s.f20운수자 || 0).toLocaleString()}</td><td className={styles.sHi}>{(s.f20안전 || 0).toLocaleString()}</td></tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* ── 관련 법규 팝업 ── */}
            {showLegalPopup && (
                <div className={styles.legalOverlay} onClick={() => setShowLegalPopup(false)}>
                    <div className={styles.legalPopup} onClick={e => e.stopPropagation()}>
                        <div className={styles.legalHeader}>
                            <h3>📋 안전운임제 관련 법규</h3>
                            <button type="button" onClick={() => setShowLegalPopup(false)}>✕</button>
                        </div>
                        <div className={styles.legalBody}>
                            {LEGAL_REFS.map((ref, idx) => (
                                <div key={idx} className={styles.legalItem}>
                                    <span className={styles.legalItemTitle}>{ref.title}</span>
                                    <span className={styles.legalItemDesc}>{ref.desc}</span>
                                </div>
                            ))}
                            <div className={styles.legalNote}>
                                <p><strong>터미널 내 운송거리 (고시 별표5)</strong></p>
                                <table className={styles.terminalTable}>
                                    <thead>
                                        <tr><th>항만</th><th>터미널</th><th>거리(km)</th></tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(TERMINAL_INFO).map(([key, val]) => (
                                            <tr key={key}>
                                                <td>{key}</td>
                                                <td>{val.full}</td>
                                                <td>{val.km}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className={styles.terminalTableNote}>
                                    ※ 위 거리는 안전운임 고시 거리(별표6 거리표)에 <strong>이미 포함</strong>되어 있으므로,
                                    별도 가산하지 않습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {toastMessage && <div className={styles.toast}>{toastMessage}</div>}
        </div>
    );
}
