'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './driver.module.css';
import { GPS_INTERVALS, GPS_OPTIONS, CONTAINER_TYPES, CONTAINER_KINDS } from '@/constants/vehicleTracking';
import { Capacitor } from '@capacitor/core';

// Native Plugins
let Haptics, StatusBar, App;
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    Haptics = require('@capacitor/haptics').Haptics;
    StatusBar = require('@capacitor/status-bar').StatusBar;
    App = require('@capacitor/app').App;
}

// Capacitor Custom Plugin for Overlay & Geolocation
const Overlay = (typeof window !== 'undefined' && Capacitor.isNativePlatform()) 
    ? require('@capacitor/core').registerPlugin('Overlay') 
    : null;
const BackgroundGeolocation = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
    ? require('@capacitor/core').registerPlugin('BackgroundGeolocation')
    : null;

/**
 * 🚛 ELS 차량용 운송 관리 (Enhanced Driver App)
 * - 인트라넷 레이아웃 비종속 (Standalone)
 * - 운전원 정보(driver_contacts) 연동 및 차량ID 자동 매칭
 * - Media Session API를 통한 백그라운드 타이머 및 제어
 * - GPS 주기 최적화 (이동 30초, 정지 1분, 대기 2분)
 * - 사진 최대 10장 지원 및 상세 입기
  */

const cleanPhone = (val) => (val || '').replace(/[^0-9]/g, '');

const formatTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatPhone = (val) => {
    const num = (val || '').replace(/[^0-9]/g, '');
    if (num.length <= 3) return num;
    if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
    return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
};

// ─── 이미지 압축 및 리사이징 (Vercel 4.5MB 제한 및 속도 최적화) ───
const resizeImage = (file, maxWidth = 1024, maxHeight = 1024) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                } else {
                    if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    const resizedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(resizedFile);
                }, 'image/jpeg', 0.6); // 압축 퀄리티 0.6으로 더 강화
            };
        };
    });
};

export default function DriverAppPage() {
    // ─── States ───
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [driverId, setDriverId] = useState('');
    const [containerNumber, setContainerNumber] = useState('');
    const [sealNumber, setSealNumber] = useState('');
    const [containerType, setContainerType] = useState('40FT');
    const [containerKind, setContainerKind] = useState('DRY');
    const [specialNotes, setSpecialNotes] = useState('');
    const [photos, setPhotos] = useState([]);
    const [uploading, setUploading] = useState(false);
    
    const [activeTrip, setActiveTrip] = useState(null);
    const [tripStatus, setTripStatus] = useState(null); // 'driving' | 'paused' | null
    const [gpsActive, setGpsActive] = useState(false);
    const [lastCoords, setLastCoords] = useState(null);
    const [sendCount, setSendCount] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isPwa, setIsPwa] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null); // 이력 수정 대상
    const [selectedTripLocations, setSelectedTripLocations] = useState([]); // 상세보기용 위치 데이터
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // [신규] 공지사항 상태
    const [notices, setNotices] = useState([]);
    const [selectedNotice, setSelectedNotice] = useState(null);

    // --- Native App UI States ---
    const [onboardingStep, setOnboardingStep] = useState(0); // 0: Hide, 1: Step1, 2: Step2, 3: Step3(Profile)
    const [activeTab, setActiveTab] = useState('home'); // home, history, settings
    const [overlayGranted, setOverlayGranted] = useState(true);

    const hasInitializedRef = useRef(false);

    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // [신규] 공지사항 데이터 호출
    const fetchNotices = useCallback(async () => {
        try {
            const { createClient } = require('@/utils/supabase/client');
            const supabase = createClient();
            const { data, error } = await supabase
                .from('notices')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);
            if (!error && data) setNotices(data);
        } catch (e) { console.error('Notices Fetch Error:', e); }
    }, []);

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving';

    // ─── 초기화 ───
    useEffect(() => {
        fetchHistory();
        fetchNotices(); // 공지사항 로드
        checkActiveTrip();

        // 주기적 갱신 (3분마다 공지사항 업데이트)
        const noticeInterval = setInterval(fetchNotices, 180000);
        return () => clearInterval(noticeInterval);
    }, [fetchHistory, fetchNotices]);
    // ─── Refs ───
    const gpsIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);
    const speedRef = useRef(0);
    const audioRef = useRef(null);

    const [showFloatingTimer, setShowFloatingTimer] = useState(false);
    const [alertMessage, setAlertMessage] = useState(''); // 커스텀 알림용
    const scrollContainerRef = useRef(null);

    const playSilence = useCallback(() => { if (audioRef.current) audioRef.current.play().catch(() => {}); }, []);
    const stopSilence = useCallback(() => { if (audioRef.current) audioRef.current.pause(); }, []);
    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    const fetchHistory = useCallback(async () => {
        const phone = cleanPhone(driverPhone);
        if (!phone && !vehicleNumber) return;
        
        const params = new URLSearchParams({ mode: 'my', month: historyMonth });
        if (phone) params.append('phone', phone);
        if (vehicleNumber) params.append('vehicle_number', vehicleNumber);
        
        try {
            const res = await fetch(`/api/vehicle-tracking/trips?${params.toString()}`);
            const data = await res.json();
            if (data.trips) setHistory(data.trips);
        } catch { }
    }, [driverPhone, vehicleNumber, historyMonth]);

    const lastWatcherIdRef = useRef(null);

    const sendLocation = useCallback(async (tripId, pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        setLastCoords({ lat, lng, speed: (speed || 0) * 3.6 });
        setGpsActive(true);

        const isMoved = !lastPosRef.current || 
            Math.abs(lastPosRef.current.lat - lat) > 0.0001 || 
            Math.abs(lastPosRef.current.lng - lng) > 0.0001;

        if (isMoved) { idleCountRef.current = 0; lastPosRef.current = { lat, lng }; }
        else { idleCountRef.current += 1; }

        try {
            await fetch('/api/vehicle-tracking/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trip_id: tripId, lat, lng, accuracy, speed }),
            });
            speedRef.current = (speed || 0) * 3.6; // km/h
            setSendCount(prev => prev + 1);
        } catch { }
    }, []);

    const startGPS = useCallback(async (tripId, status) => {
        if (lastWatcherIdRef.current && BackgroundGeolocation) {
            await BackgroundGeolocation.removeWatcher({ id: lastWatcherIdRef.current });
        }

        if (status === 'paused') {
            setGpsActive(false);
            return;
        }

        if (BackgroundGeolocation) {
            // Native Background Geolocation
            try {
                const watcherId = await BackgroundGeolocation.addWatcher({
                    backgroundMessage: "ELS 실시간 운송 관제가 진행 중입니다.",
                    backgroundTitle: "운행 중",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 10 // 10미터 이동 시마다 수집 (선택적)
                }, (location) => {
                    // 속도에 따른 동적 전송 필터링 (클라이언트측)
                    const speedKm = (location.speed || 0) * 3.6;
                    const now = Date.now();
                    const lastSent = lastPosRef.current?.lastSentAt || 0;
                    
                    let minInterval = 30000; // 기본 30초
                    if (speedKm >= 70) minInterval = 30000;
                    else if (speedKm >= 20) minInterval = 60000;
                    else if (speedKm >= 5) minInterval = 180000;
                    else minInterval = 300000;

                    if (now - lastSent >= minInterval) {
                         sendLocation(tripId, location);
                         if (lastPosRef.current) lastPosRef.current.lastSentAt = now;
                    }
                });
                lastWatcherIdRef.current = watcherId;
            } catch (e) {
                console.error('Core Background Geo Error:', e);
            }
        } else {
            // Fallback: Web Geolocation
            if (gpsIntervalRef.current) clearTimeout(gpsIntervalRef.current);
            const tick = () => {
                let interval = 30000;
                const speedKm = speedRef.current;
                if (speedKm >= 70) interval = 30000;
                else if (speedKm >= 20) interval = 60000;
                else if (speedKm >= 5) interval = 180000;
                else interval = 300000;

                navigator.geolocation.getCurrentPosition((pos) => {
                    sendLocation(tripId, pos);
                }, () => {}, GPS_OPTIONS);
                gpsIntervalRef.current = setTimeout(tick, interval);
            };
            tick();
        }
    }, [sendLocation]);

    const stopGPS = useCallback(async () => {
        if (BackgroundGeolocation && lastWatcherIdRef.current) {
            await BackgroundGeolocation.removeWatcher({ id: lastWatcherIdRef.current });
            lastWatcherIdRef.current = null;
        }
        if (gpsIntervalRef.current) {
            clearTimeout(gpsIntervalRef.current);
            gpsIntervalRef.current = null;
        }
        setGpsActive(false);
        idleCountRef.current = 0;
    }, []);

    // ─── 6. 비즈니스 액션 ───
    const checkActiveTrip = useCallback(async (p, v) => {
        setIsRefreshing(true);
        try {
            const params = new URLSearchParams({ mode: 'my' });
            const phone = p ? cleanPhone(p) : cleanPhone(driverPhone);
            const veh = v || vehicleNumber;

            if (phone) params.append('phone', phone);
            if (veh) params.append('vehicle_number', veh);
            
            if (!phone && !veh) {
                setIsRefreshing(false);
                return;
            }

            const res = await fetch(`/api/vehicle-tracking/trips?${params.toString()}`);
            if (!res.ok) throw new Error('서버 데이터를 불러올 수 없습니다.');
            
            const data = await res.json();
            if (data.trips) {
                const active = data.trips.find(t => t.status === 'driving' || t.status === 'paused');
                if (active) {
                    setActiveTrip(active);
                    setTripStatus(active.status);
                    setVehicleNumber(active.vehicle_number);
                    setVehicleId(active.vehicle_id || '');
                    setDriverName(active.driver_name);
                    setDriverPhone(formatPhone(active.driver_phone || ''));
                    setContainerNumber(active.container_number || '');
                    setSealNumber(active.seal_number || '');
                    setContainerType(active.container_type || '40FT');
                    setContainerKind(active.container_kind || 'DRY');
                    setSpecialNotes(active.special_notes || '');
                    
                    const started = new Date(active.started_at);
                    setElapsedSeconds(Math.floor((Date.now() - started.getTime()) / 1000));
                    
                    if (active.photos?.length > 0) setPhotos(active.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
                    if (active.status === 'driving') { 
                        startGPS(active.id, 'driving'); 
                        playSilence(); 
                        
                        // 앱 재접속 시 네이티브 오버레이 다시 띄우기
                        if (Overlay) {
                            Overlay.showOverlay({ 
                                timer: formatTime(elapsedSeconds), 
                                container: `📦 ${active.container_number || '미입력'}`,
                                tripId: active.id,
                                startTimeMillis: new Date(active.started_at).getTime()
                            });
                        }
                    }
                } else {
                    setActiveTrip(null);
                    setTripStatus(null);
                }
                fetchHistory();
            }
        } catch (e) { 
            console.error('CheckActive Error:', e);
        } finally {
            setIsRefreshing(false);
        }
    }, [driverPhone, vehicleNumber, formatPhone, startGPS, playSilence, fetchHistory, cleanPhone]);




    // ─── 3. 정보 갱신 및 이력 수정 로직 ───
    const handleUpdateInfo = async () => {
        const targetId = selectedHistoryId || activeTrip?.id;
        if (!targetId) return;
        
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${targetId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    container_number: containerNumber,
                    seal_number: sealNumber,
                    container_type: containerType,
                    container_kind: containerKind,
                    special_notes: specialNotes,
                    vehicle_number: vehicleNumber,
                    driver_name: driverName,
                    vehicle_id: vehicleId
                }),
            });
            if (res.ok) {
                alert(selectedHistoryId ? '운송 기록이 수정되었습니다. (로그 기록됨)' : '현재 운행 정보가 수정되었습니다.');
                if (!selectedHistoryId) checkActiveTrip(); // 실시간이면 갱신
                else { 
                    fetchHistory();
                    setSelectedHistoryId(null); // 수정 완료 후 해제
                }
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const handleSelectHistory = async (trip) => {
        if (isActive && !confirm('현재 진행 중인 운행이 있습니다. 이력 수정 모드로 전환하시겠습니까? (현재 입력값은 초기화됩니다)')) return;
        
        setSelectedHistoryId(trip.id);
        setVehicleNumber(trip.vehicle_number || '');
        setVehicleId(trip.vehicle_id || '');
        setDriverName(trip.driver_name || '');
        setDriverPhone(formatPhone(trip.driver_phone || ''));
        setContainerNumber(trip.container_number || '');
        setSealNumber(trip.seal_number || '');
        setContainerType(trip.container_type || '40FT');
        setContainerKind(trip.container_kind || 'DRY');
        setSpecialNotes(trip.special_notes || '');
        setPhotos(trip.photos?.map(p => ({ ...p, previewUrl: p.url, uploaded: true })) || []);
        
        // 위치 데이터 가져오기
        setIsDetailLoading(true);
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${trip.id}/locations`);
            const data = await res.json();
            if (data.locations) setSelectedTripLocations(data.locations);
        } catch { } finally { setIsDetailLoading(false); }

        scrollToTop();
    };

    const handleOpenExternalMap = (locations) => {
        if (!locations || locations.length < 2) { alert('이동 경로가 부족합니다.'); return; }
        const start = locations[0];
        const end = locations[locations.length - 1];
        const url = `https://map.naver.com/v5/directions/${start.lng},${start.lat},출발/${end.lng},${end.lat},도착/-/car?c=15,0,0,0,dh`;
        window.open(url, '_blank');
    };

    const handleStart = async () => {
        if (!vehicleNumber.trim() || !driverName.trim()) { alert('차량번호와 이름은 필수입니다.'); return; }
        try {
            const res = await fetch('/api/vehicle-tracking/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driver_name: driverName, driver_phone: cleanPhone(driverPhone),
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                    container_number: containerNumber, seal_number: sealNumber,
                    container_type: containerType, container_kind: containerKind,
                    special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                // 운행 시작 전 추가해둔 사진이 있다면 즉시 업로드
                const localPhotos = photos.filter(p => !p.uploaded && p.file);
                if (localPhotos.length > 0) {
                    setUploading(true);
                    const photoFormData = new FormData();
                    photoFormData.append('trip_id', data.trip.id);
                    localPhotos.forEach(p => photoFormData.append('photos', p.file));
                    try {
                        const photoRes = await fetch('/api/vehicle-tracking/photos', { method: 'POST', body: photoFormData });
                        const photoData = await photoRes.json();
                        if (photoData.photos) {
                            setPhotos(photoData.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
                        } else if (photoData.error) {
                            alert('사진 업로드 실패: ' + photoData.error);
                        }
                    } catch (pe) { 
                        console.error('Photo upload error at start:', pe); 
                        alert('사진 업로드 오류 (네트워크)');
                    }
                    finally { setUploading(false); }
                }

                setActiveTrip(data.trip);
                setTripStatus('driving');
                setElapsedSeconds(0);
                startGPS(data.trip.id, 'driving');
                playSilence();
                
                // Native Overlay & Background GPS Start
                if (Overlay) {
                    Overlay.requestPermission().then(() => {
                        Overlay.showOverlay({ 
                            timer: "00:00:00", 
                            container: `📦 ${containerNumber}`,
                            tripId: data.trip.id,
                            startTimeMillis: Date.now()
                        });
                    });
                }
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const handlePause = async () => {
        if (!activeTrip) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pause' }),
            });
            const data = await res.json();
            if (data.trip) {
                setActiveTrip(data.trip);
                setTripStatus('paused');
                stopGPS();
                startGPS(activeTrip.id, 'paused');
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const handleResume = async () => {
        if (!activeTrip) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'resume', driver_name: driverName, driver_phone: cleanPhone(driverPhone),
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                    container_number: containerNumber, seal_number: sealNumber,
                    container_type: containerType, special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                setActiveTrip(data.trip);
                setTripStatus('driving');
                stopGPS();
                startGPS(activeTrip.id, 'driving');
                playSilence();
                initPipContext(); // PiP 준비
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const handleStop = async () => {
        if (!activeTrip || !confirm('운행을 종료하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'complete', driver_name: driverName, driver_phone: cleanPhone(driverPhone),
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                }),
            });
            if (res.ok) {
                stopGPS(); stopSilence(); setActiveTrip(null); setTripStatus(null); setElapsedSeconds(0);
                fetchHistory();
            }
        } catch (e) { alert('오류: ' + e.message); }
    };


    // ─── 4. MediaSession 설정 (상태바 컨트롤 & 리얼타임 타이머) ───
    const setupMediaSession = useCallback(() => {
        if (!('mediaSession' in navigator) || !activeTrip) return;

        const updateMetadata = () => {
            const statusLabel = tripStatus === 'driving' ? '운행 중' : '일시정지';
            const timeLabel = formatTime(elapsedSeconds);
            
            if (typeof MediaMetadata !== 'undefined') {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: `${statusLabel} [${timeLabel}]`,
                    artist: `${vehicleNumber} (${driverName})`,
                    album: `컨테이너: ${containerNumber || '미입력'} / 씰: ${sealNumber || '-'}`,
                    artwork: [
                        { src: 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png', sizes: '512x512', type: 'image/png' }
                    ]
                });
            }
        };

        updateMetadata();
        navigator.mediaSession.setActionHandler('play', handleResume);
        navigator.mediaSession.setActionHandler('pause', handlePause);

        return updateMetadata;
    }, [tripStatus, activeTrip, elapsedSeconds, vehicleNumber, driverName, containerNumber, sealNumber, handleResume, handlePause]);

    // ─── 모든 Side Effects 모음 (정의된 후 실행) ───

    // PWA & iOS 체크
    useEffect(() => {
        const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
        window.addEventListener('beforeinstallprompt', handler);
        const userAgent = window.navigator.userAgent.toLowerCase();
        setIsIOS(/iphone|ipad|ipod/.test(userAgent));
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // 초기화
    useEffect(() => {
        if (typeof window === 'undefined' || hasInitializedRef.current) return;
        
        // Native UI Init
        if (Capacitor.isNativePlatform() && StatusBar) {
            StatusBar.setBackgroundColor({ color: '#0f172a' });
            StatusBar.setStyle({ style: 'dark' });
        }

        const onboardingDone = localStorage.getItem('els_onboarding_done');
        if (!onboardingDone) setOnboardingStep(1);

        checkOverlayPermission();
        checkBatteryOptimization().then(isIgnoring => {
            if (!isIgnoring && onboardingDone) {
                setAlertMessage('🔋 [애플리케이션 정보] -> [배터리] -> [제한 없음]으로 꼭 변경해 주세요! (안 보이면 ⋮ 메뉴에서 [제한된 설정 허용] 클릭)');
                handleBatteryOptimizationRequest();
            }
        });

        setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
        const storedPhone = localStorage.getItem('els_driver_phone');
        const storedVehicle = localStorage.getItem('els_driver_vehicle');
        const storedId = localStorage.getItem('els_driver_id');
        const storedName = localStorage.getItem('els_driver_name');
        
        if (storedName) setDriverName(storedName);
        if (storedPhone) setDriverPhone(storedPhone);
        if (storedVehicle) setVehicleNumber(storedVehicle);
        if (storedId) setDriverId(storedId);
        
        if (storedPhone || storedVehicle) {
            checkActiveTrip(storedPhone, storedVehicle);
        }
        hasInitializedRef.current = true;
    }, [checkActiveTrip]);

    // 이벤트 리스너 (Scroll)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleScroll = () => {
            const statusEl = document.getElementById('status-section');
            if (statusEl) {
                const rect = statusEl.getBoundingClientRect();
                setShowFloatingTimer(rect.bottom < 0);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // 타이머 및 Native Overlay 업데이트
    useEffect(() => {
        let timer;
        if (isActive && isDriving && activeTrip?.started_at) {
            const started = new Date(activeTrip.started_at).getTime();
            timer = setInterval(() => {
                const now = Date.now();
                const diff = Math.floor((now - started) / 1000);
                setElapsedSeconds(diff);

                // 만약 안드로이드 네이티브라면 오버레이 업데이트
                if (Overlay) {
                    Overlay.updateOverlay({ 
                        timer: formatTime(diff),
                        container: `📦 ${containerNumber || '미입력'}` 
                    }).catch(() => {});
                }
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isActive, isDriving, activeTrip?.started_at, containerNumber]);



    // 로컬 저장
    useEffect(() => {
        if (driverPhone) localStorage.setItem('els_driver_phone', cleanPhone(driverPhone));
        if (vehicleNumber) localStorage.setItem('els_driver_vehicle', vehicleNumber);
        if (vehicleId) localStorage.setItem('els_driver_vehicle_id', vehicleId);
        if (driverName) localStorage.setItem('els_driver_name', driverName);
    }, [driverPhone, vehicleNumber, vehicleId, driverName]);

    // ── 백그라운드 유지 보조용 모션 센서 ──
    useEffect(() => {
        const handleMotion = () => { /* 가속도 사용 알림용 */ };
        window.addEventListener('devicemotion', handleMotion, { passive: true });
        window.addEventListener('deviceorientation', handleMotion, { passive: true });
        return () => {
            window.removeEventListener('devicemotion', handleMotion);
            window.removeEventListener('deviceorientation', handleMotion);
        };
    }, []);

    // 프로필 자동 매칭 및 SW
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
        const phone = cleanPhone(driverPhone);
        if (phone.length >= 10 || vehicleNumber.length >= 4) {
            const timer = setTimeout(async () => {
                try {
                    const params = new URLSearchParams();
                    if (phone) params.append('phone', phone);
                    if (vehicleNumber) params.append('vehicle_number', vehicleNumber);
                    const res = await fetch(`/api/driver-contacts/search?${params.toString()}`);
                    const data = await res.json();
                    if (data.item) {
                        if (!driverName) setDriverName(data.item.name);
                        if (!vehicleId) setVehicleId(data.item.vehicle_id || '');
                    }
                } catch { }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [driverPhone, vehicleNumber]);




    const handlePhotoAdd = async (e) => {
        if (!e.target.files) return;
        const rawFiles = Array.from(e.target.files);
        if (photos.length + rawFiles.length > 10) { alert('사진은 최대 10장까지 가능합니다.'); return; }
        
        // 미리보기 및 업로드 중 상태 표시용 초기 배열 추가
        const tempIndices = [];
        setPhotos(prev => {
            const next = [...prev];
            rawFiles.forEach(f => {
                tempIndices.push(next.length);
                next.push({ previewUrl: URL.createObjectURL(f), uploaded: false, uploading: true, name: f.name });
            });
            return next;
        });

        // 한 장씩 순차적으로 업로드 (Vercel 4.5MB 몸체 제한 우회)
        if (activeTrip) {
            setUploading(true);
            try {
                for (let i = 0; i < rawFiles.length; i++) {
                    const file = rawFiles[i];
                    const compressed = await resizeImage(file);
                    
                    const formData = new FormData();
                    formData.append('trip_id', activeTrip.id);
                    formData.append('photos', compressed);

                    const res = await fetch('/api/vehicle-tracking/photos', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error(`${file.name} 업로드 중 오류 발생`);
                    
                    const data = await res.json();
                    setPhotos(prev => prev.map(p => {
                        const uploadedPhoto = data.photos.find(up => up.name === file.name || up.original_name === file.name);
                        return (p.uploading && (p.name === file.name)) ? { ...p, previewUrl: uploadedPhoto.url, key: uploadedPhoto.key, uploaded: true, uploading: false } : p;
                    }));
                }
            } catch (e) {
                console.error(e);
                alert('사진 전송 오류: ' + e.message);
                setPhotos(prev => prev.filter(p => !p.uploading));
            } finally {
                setUploading(false);
                checkActiveTrip(); // 최종 서버 데이터 동기화
            }
        }
    };

    const handlePhotoDelete = async (photo) => {
        if (!activeTrip) {
            // 아직 서버에 안 올라간 경우 로컬에서만 삭제
            setPhotos(prev => prev.filter(p => p.previewUrl !== photo.previewUrl));
            return;
        }

        if (!confirm('해당 사진을 삭제하시겠습니까?')) return;

        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}/photos`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: photo.key }),
            });
            if (res.ok) {
                setPhotos(prev => prev.filter(p => p.key !== photo.key));
            } else {
                throw new Error('삭제 실패');
            }
        } catch (e) {
            alert('삭제 오류: ' + e.message);
        }
    };

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } else {
            const userAgent = window.navigator.userAgent.toLowerCase();
            const isIos = /iphone|ipad|ipod/.test(userAgent);
            if (isIos) {
                alert('iOS는 Safari에서 "공유 버튼(↑)" -> "홈 화면에 추가"를 눌러 설치해 주세요.');
            } else {
                alert('이미 설치되어 있거나, 브라우저 메뉴의 "홈 화면에 추가"를 선택해 주세요.');
            }
        }
    };





    // --- Native Components & Tab Renders ---
    
    const triggerHaptic = (style = 'MEDIUM') => {
        if (Haptics) {
            const hStyle = style === 'LIGHT' ? 'LIGHT' : style === 'HEAVY' ? 'HEAVY' : 'MEDIUM';
            Haptics.impact({ style: hStyle });
        }
    };

    const handleLocationRequest = async () => {
        if (!navigator.geolocation) return;
        triggerHaptic();
        navigator.geolocation.getCurrentPosition(() => {}, () => {});
        setAlertMessage('위치 권한을 "항상 허용"으로 설정해 주셔야 앱이 꺼져도 관제가 유지됩니다.');
    };

    const handleCameraRequest = async () => {
        triggerHaptic();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            setAlertMessage('카메라 및 갤러리 권한을 허용해 주세요.');
        }
    };

    const checkOverlayPermission = async () => {
        if (Overlay) {
            try {
                const { granted } = await Overlay.checkPermission();
                setOverlayGranted(granted);
                return granted;
            } catch { return true; }
        }
        return true;
    };

    const checkBatteryOptimization = async () => {
        if (Overlay) {
            try {
                const { isIgnoring } = await Overlay.checkBatteryOptimization();
                return isIgnoring;
            } catch { return true; }
        }
        return true;
    };

    const handleBatteryOptimizationRequest = async () => {
        if (Overlay) {
            triggerHaptic();
            await Overlay.requestBatteryOptimization();
            window.addEventListener('focus', () => {
                checkBatteryOptimization();
            }, { once: true });
        }
    };

    const handleOverlayRequest = async () => {
        if (Overlay) {
            triggerHaptic();
            await Overlay.requestPermission();
            // 폰 설정화면 갔다오는 사이 체크를 위해 포커스 이벤트 대기
            window.addEventListener('focus', () => {
                checkOverlayPermission();
            }, { once: true });
        }
    };

    const finishOnboarding = async () => {
        const isGranted = await checkOverlayPermission();
        if (!isGranted) {
            setAlertMessage('🚀 실시간 타이머 표시를 위해 [다른 앱 위에 표시] 권한이 꼭 필요합니다! (안 보이면 ⋮ 메뉴 -> 제한된 설정 허용 클릭)');
            handleOverlayRequest();
            return;
        }
        setOnboardingStep(3); // 프로필 입력 단계로 이동
    };

    const resetOnboarding = () => {
        localStorage.removeItem('els_onboarding_done');
        window.location.reload();
    };

    const saveProfileAndFinish = () => {
        if (!driverName || !driverPhone || !vehicleNumber || !driverId) {
            setAlertMessage('기사 성함, 연락처, 차량 번호, 아이디를 모두 입력해 주세요.');
            return;
        }
        triggerHaptic('HEAVY');
        localStorage.setItem('els_driver_name', driverName);
        localStorage.setItem('els_driver_phone', driverPhone);
        localStorage.setItem('els_driver_vehicle', vehicleNumber);
        localStorage.setItem('els_driver_id', driverId);
        localStorage.setItem('els_onboarding_done', 'true');
        setOnboardingStep(0);
        checkActiveTrip(); 
    };

    const renderOnboarding = () => (
        <AnimatePresence>
            {onboardingStep > 0 && (
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className={styles.onboardingOverlay}
                >
                    {onboardingStep === 1 ? (
                        <div className={styles.onboardingStep}>
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className={styles.onboardingIcon}>👋</motion.div>
                            <h2 className={styles.onboardingTitle}>반가워요, 기사님!</h2>
                            <p className={styles.onboardingText}>
                                ELS 운송관리 전용 앱에 오신 것을 환영합니다.<br/>
                                안전하고 스마트한 운행을 위해<br/>몇 가지 권한 설정이 필요합니다.
                            </p>
                            <div className={styles.onboardingDots}>
                                <div className={`${styles.dot} ${styles.dotActive}`} />
                                <div className={styles.dot} />
                            </div>
                            <button className={styles.onboardingBtn} onClick={() => { triggerHaptic(); setOnboardingStep(2); }}>시작하기</button>
                        </div>
                    ) : (
                        <div className={styles.onboardingStep}>
                            <h2 className={styles.onboardingTitle}>필수 권한 안내</h2>
                            <div className={styles.permissionList}>
                                <div 
                                    className={styles.permissionItem}
                                    onClick={handleLocationRequest}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className={styles.permIcon}>📍</div>
                                    <div className={styles.permInfo}>
                                        <div className={styles.permTitle}>위치 정보 (항상 허용)</div>
                                        <div className={styles.permDesc}>운행 중 백그라운드 경로 추적 및 배차 관리</div>
                                    </div>
                                    <div className={styles.blinkDot} />
                                </div>
                                <div 
                                    className={styles.permissionItem}
                                    onClick={handleCameraRequest}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className={styles.permIcon}>🖼️</div>
                                    <div className={styles.permInfo}>
                                        <div className={styles.permTitle}>카메라 및 갤러리</div>
                                        <div className={styles.permDesc}>상/하차 컨테이너 및 씰 사진 등록</div>
                                    </div>
                                    <div className={styles.blinkDot} />
                                </div>
                                <div 
                                    className={`${styles.permissionItem} ${!overlayGranted ? styles.blinkBorder : ''}`}
                                    onClick={handleOverlayRequest}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className={styles.permIcon} style={{background: '#38bdf8'}} />
                                    <div className={styles.permInfo}>
                                        <div className={styles.permTitle}>다른 앱 위에 표시 {!overlayGranted && '(설정 필요)'}</div>
                                        <div className={styles.permDesc}>내비게이션 사용 중 실시간 상태 표시</div>
                                    </div>
                                    {!overlayGranted && <div className={styles.blinkDot} />}
                                </div>
                            </div>
                            <button className={styles.onboardingBtn} onClick={finishOnboarding}>확인했습니다</button>
                        </div>
                    )}

                    {onboardingStep === 3 && (
                        <div className={styles.onboardingStep}>
                            <h2 className={styles.onboardingTitle}>기사님 정보 등록</h2>
                            <p className={styles.onboardingDesc}>운행 기록 관리를 위해 기초 정보를 입력해 주세요.</p>
                            <div className={styles.formGrid} style={{ margin: '20px 0' }}>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>기사 성함</label>
                                    <input className={styles.formInput} placeholder="예: 홍길동" value={driverName} onChange={e => setDriverName(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>연락처</label>
                                    <input className={styles.formInput} placeholder="예: 01012345678" type="tel" value={driverPhone} onChange={e => setDriverPhone(formatPhone(e.target.value))} />
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>차량 번호 (영업용)</label>
                                    <input className={styles.formInput} placeholder="예: 부산00바0000" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} />
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>아이디</label>
                                    <input className={styles.formInput} placeholder="예: ABCD1234" value={driverId} onChange={e => setDriverId(e.target.value)} />
                                </div>
                            </div>
                            <button className={styles.onboardingBtn} onClick={saveProfileAndFinish}>준비 완료! 시작하기</button>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );

    const renderHome = () => (
        <motion.div className={styles.tabContent} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* 상단 상태 통합 대시보드 */}
            <div className={styles.gpsBar}>
                <span>
                    <span className={`${styles.gpsDot} ${gpsActive ? styles.gpsDotActive : styles.gpsDotInactive}`} />
                    {!isActive ? 'GPS정상' : (
                        isDriving ? '운행중' : '일시정지'
                    )}
                </span>
                <span style={{marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8'}}>
                    {isActive ? (isDriving ? `수신중(${speedRef.current >= 70 ? '30초' : (speedRef.current >= 20 ? '1분' : (speedRef.current >= 5 ? '3분' : '5분'))})` : 'GPS정지') : '대기중'}
                </span>
            </div>

            {/* [신규] 공지사항 섹션 */}
            {notices.length > 0 && (
                <div className={styles.noticeSection} style={{ marginBottom: 15 }}>
                    <div className={styles.noticeHeader} style={{ padding: '10px 15px', background: '#fff', borderRadius: '12px 12px 0 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>📣 최신 공지사항</h3>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{notices.length}건</span>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                        {notices.map((n, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => { triggerHaptic('LIGHT'); setSelectedNotice(n); }}
                                style={{ padding: '12px 15px', borderBottom: idx === notices.length - 1 ? 'none' : '1px solid #f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            >
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{new Date(n.created_at).toLocaleDateString('ko-KR', {month:'2-digit', day:'2-digit'})}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {isActive ? (
                /* 운행 활성화 상태: 대시보드 집중 모드 */
                <div id="status-dashboard" className={styles.activeDashboard}>
                    <div className={styles.dashboardLabel}>{isDriving ? '운송 중' : '일시정지 (휴식)'}</div>
                    <div className={styles.dashboardTimer}>
                        {formatTime(elapsedSeconds)}
                    </div>
                    {isDriving && (
                        <div style={{textAlign:'center', color:'var(--accent)', fontSize:'0.8rem', fontWeight:700, marginTop:'-10px', marginBottom:'15px'}}>
                            GPS수집중 ({speedRef.current >= 70 ? '30초' : (speedRef.current >= 20 ? '1분' : (speedRef.current >= 5 ? '3분' : '5분'))})
                        </div>
                    )}
                    
                    <div className={styles.dashboardInfoRow}>
                        <div className={styles.infoCol}>
                            <span>차량번호</span>
                            <strong>{vehicleNumber}</strong>
                        </div>
                        <div className={styles.infoCol}>
                            <span>컨테이너</span>
                            <strong>{containerNumber || '-'}</strong>
                        </div>
                    </div>

                    <div className={styles.dashboardActionGrid}>
                        {isDriving ? (
                            <button className={styles.dashSecondaryBtn} onClick={handlePause}>
                                일시정지
                            </button>
                        ) : (
                            <button className={styles.dashPrimaryBtn} onClick={handleResume}>
                                운송 재개
                            </button>
                        )}
                        <button className={styles.dashStopBtn} onClick={handleStop}>
                            운송 종료
                        </button>
                    </div>

                    {/* 당일 운송 기록 요약 (차수별) */}
                    <div className={styles.todaySummary}>
                        <div className={styles.summaryTitle}>📅 오늘의 운송 기록</div>
                        <div className={styles.summaryList}>
                            {history.filter(h => new Date(h.started_at).toDateString() === new Date().toDateString()).map((h, idx) => (
                                <div key={idx} className={styles.summaryItem} onClick={() => handleSelectHistory(h)}>
                                    <span className={styles.summaryIndex}>{history.length - idx}차</span>
                                    <span className={styles.summaryTime}>{new Date(h.started_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                    <span className={styles.summaryCont}>{h.container_number || '-'}</span>
                                    <span className={styles.summaryStatus}>{h.status === 'completed' ? '✅' : '🔴'}</span>
                                </div>
                            ))}
                            {history.filter(h => new Date(h.started_at).toDateString() === new Date().toDateString()).length === 0 && (
                                <div className={styles.summaryEmpty}>오늘 운송 기록이 없습니다.</div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* 운행 대기 상태: 입력 및 시작 모드 */
                <div id="registration-dashboard">
                    <div className={styles.formSection}>
                        <div className={styles.formTitle}>운송 정보 등록</div>
                        <div className={styles.formRow} style={{marginBottom: 15}}>
                            <label className={styles.formLabel}>운송 날짜</label>
                            <input type="date" className={styles.formInput} 
                                value={historyMonth.includes('-') && historyMonth.split('-').length === 2 ? `${historyMonth}-${new Date().getDate().toString().padStart(2,'0')}` : new Date().toISOString().split('T')[0]} 
                                onChange={e => {
                                    const val = e.target.value; // YYYY-MM-DD
                                    setHistoryMonth(val.substring(0, 7)); // YYYY-MM
                                    fetchHistory();
                                }} 
                            />
                        </div>
                        <div className={styles.formGrid}>
                            <div className={styles.formRow}>
                                <label className={styles.formLabel}>차량번호</label>
                                <input className={styles.formInput} placeholder="예: 부산00바0000" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.replace(/\s/g,''))} />
                            </div>
                            <div className={styles.formRow}>
                                <label className={styles.formLabel}>컨테이너 번호</label>
                                <input className={styles.formInput} placeholder="예: ABCD1234567" value={containerNumber} onChange={e => setContainerNumber(e.target.value.toUpperCase())} />
                            </div>
                            <div className={styles.formRow}>
                                <label className={styles.formLabel}>컨테이너 사진 ({photos.length}/10)</label>
                                <div className={styles.photoGrid}>
                                    {photos.map((p, i) => (
                                        <div key={i} style={{position: 'relative'}}>
                                            <img src={p.key ? `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(p.key)}` : p.previewUrl} className={styles.photoThumb} alt="" />
                                            {p.uploaded && (
                                                <button onClick={() => { triggerHaptic('LIGHT'); handlePhotoDelete(p); }} className={styles.photoDelBtn}>✕</button>
                                            )}
                                        </div>
                                    ))}
                                    {photos.length < 10 && (
                                        <label className={styles.photoAddBtn} onClick={() => triggerHaptic('LIGHT')}>
                                            {uploading ? '⏳' : '+'}
                                            <input type="file" multiple accept="image/*" hidden onChange={handlePhotoAdd} />
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <button className={styles.startBtn} onClick={handleStart}>
                        운송 시작하기 (START)
                    </button>

                    {/* 이력 수정/상세 모드일 때만 보이는 위치 정보 */}
                    {selectedHistoryId && (
                        <div className={styles.formSection} style={{marginTop: 20}}>
                            <div className={styles.formTitle} style={{display:'flex', justifyContent:'space-between'}}>
                                📍 이동 경로 상세
                                <button className={styles.outlineBtn} style={{fontSize:'0.7rem', padding:'2px 8px'}} onClick={() => handleOpenExternalMap(selectedTripLocations)}>네이버 지도로 보기</button>
                            </div>
                            <div className={styles.historyLocations}>
                                {isDetailLoading ? <div className={styles.summaryEmpty}>로딩 중...</div> : (
                                    selectedTripLocations.length > 0 ? (
                                        selectedTripLocations.slice().reverse().map((loc, idx) => (
                                            <div key={idx} className={styles.locationRow}>
                                                <span className={styles.locTime}>{new Date(loc.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                                <span className={styles.locSpeed}>{Math.round((loc.speed || 0) * 3.6)}km/h</span>
                                                <span className={styles.locAddr}>{loc.address || '좌표 수집됨'}</span>
                                            </div>
                                        ))
                                    ) : <div className={styles.summaryEmpty}>좌표 데이터가 없습니다.</div>
                                )}
                            </div>
                            <button className={styles.outlineBtn} style={{width:'100%', marginTop: 15}} onClick={() => { setSelectedHistoryId(null); setSelectedTripLocations([]); }}>운송 등록 화면으로 돌아가기</button>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );

    const renderHistory = () => (
        <motion.div className={styles.tabContent} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className={styles.formSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div className={styles.historyTitle}>📅 운송 기록</div>
                    <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                </div>
                <div className={styles.historyList}>
                    {history.length > 0 ? history.map((h, i) => (
                        <div key={i} className={`${styles.historyCard} ${selectedHistoryId === h.id ? styles.historyCardActive : ''}`} onClick={() => { triggerHaptic('LIGHT'); handleSelectHistory(h); setActiveTab('home'); }}>
                            <div className={styles.historyHeader}>
                                <div className={styles.historyDate}>{new Date(h.started_at).toLocaleString()}</div>
                                <div className={`${styles.statusBadge} ${styles['status' + h.status]}`}>{h.status === 'driving' ? '운행중' : '종료'}</div>
                            </div>
                            <div className={styles.historyContainer}>📦 {h.container_number || '미입력'} ({h.container_type})</div>
                            <div className={styles.historyMeta}>{h.vehicle_number} | {h.driver_name}</div>
                        </div>
                    )) : <div className={styles.historyEmpty}>기록이 없습니다.</div>}
                </div>
            </div>
        </motion.div>
    );

    const renderSettings = () => (
        <motion.div className={styles.tabContent} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className={styles.formSection}>
                <div className={styles.formTitle}>👤 내 프로필 설정</div>
                <div className={styles.formGrid}>
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>기사 성함</label>
                        <input className={styles.formInput} value={driverName} onChange={e => setDriverName(e.target.value)} />
                    </div>
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>연락처</label>
                        <input className={styles.formInput} placeholder="010-0000-0000" type="tel" value={driverPhone} onChange={e => setDriverPhone(formatPhone(e.target.value))} />
                    </div>
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>차량 번호</label>
                        <input className={styles.formInput} placeholder="예: 부산00바0000" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} />
                    </div>
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>아이디</label>
                        <input className={styles.formInput} placeholder="예: ABCD1234" value={driverId} onChange={e => setDriverId(e.target.value)} />
                    </div>
                </div>
            </div>


            <div className={styles.formSection}>
                <div className={styles.formTitle}>ℹ️ 앱 정보</div>
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                    <p>버전: v3.9.9.3 (Notice Patch)</p>
                    <p>플랫폼: {Capacitor.getPlatform()} Native</p>
                    {!Capacitor.isNativePlatform() && (
                        <button onClick={handleInstallClick} className={styles.outlineBtn} style={{ width: '100%', marginTop: 10 }}>앱 설치 가이드 보기</button>
                    )}
                    <button onClick={() => { if(confirm('기사 정보 및 설정을 초기화하고 다시 시작하시겠습니까?')) { localStorage.clear(); window.location.reload(); } }} className={styles.outlineBtn} style={{ width: '100%', marginTop: 10, color: '#ef4444' }}>초기화 (재설정)</button>
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className={styles.driverPage}>
            <title>ELS-운송관리</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
            
            <audio ref={audioRef} loop muted playsInline src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />

            {renderOnboarding()}

            {/* Sticky Header */}
            <div className={styles.header}>
                <img src="/images/logo.png" alt="ELS Logo" className={styles.headerLogo} />
                <div className={styles.headerTitle}>운송 관리</div>
            </div>

            {/* Tab Body */}
            <main>
                {activeTab === 'home' && renderHome()}
                {activeTab === 'history' && renderHistory()}
                {activeTab === 'settings' && renderSettings()}
            </main>

            {/* Bottom Navigation */}
            <nav className={styles.bottomNav}>
                <button className={`${styles.navItem} ${activeTab === 'home' ? styles.navItemActive : ''}`} onClick={() => { triggerHaptic('LIGHT'); setActiveTab('home'); }}>
                    <span className={styles.navIcon}>🏠</span>
                    <span>운행</span>
                </button>
                <button className={`${styles.navItem} ${activeTab === 'history' ? styles.navItemActive : ''}`} onClick={() => { triggerHaptic('LIGHT'); setActiveTab('history'); }}>
                    <span className={styles.navIcon}>📋</span>
                    <span>기록</span>
                </button>
                <button className={`${styles.navItem} ${activeTab === 'settings' ? styles.navItemActive : ''}`} onClick={() => { triggerHaptic('LIGHT'); setActiveTab('settings'); }}>
                    <span className={styles.navIcon}>⚙️</span>
                    <span>설정</span>
                </button>
            </nav>

            <style jsx global>{`
                body { margin: 0; background: #f8fafc; font-family: -apple-system, sans-serif; overflow-x: hidden; }
                * { -webkit-tap-highlight-color: transparent; }
            `}</style>
            {/* Custom Alert Modal */}
            <AnimatePresence>
                {alertMessage && (
                    <div className={styles.onboardingOverlay} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setAlertMessage('')}>
                        <motion.div className={styles.onboardingStep} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
                            <div className={styles.formSection} style={{ border: '1px solid #38bdf8' }}>
                                <div className={styles.onboardingTitle} style={{ fontSize: '1.2rem', color: '#38bdf8' }}>ELS 알림</div>
                                <p className={styles.onboardingDesc} style={{ fontSize: '0.95rem' }}>{alertMessage}</p>
                                <button className={styles.onboardingBtn} onClick={() => setAlertMessage('')}>확인</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* [신규] 공지사항 상세보기 모달 */}
            <AnimatePresence>
                {selectedNotice && (
                    <div className={styles.onboardingOverlay} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 9999 }} onClick={() => setSelectedNotice(null)}>
                        <motion.div 
                            className={styles.onboardingStep} 
                            style={{ maxWidth: '90%', width: '400px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0, background: '#fff' }}
                            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} 
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 800, marginBottom: 4 }}>NOTICE</div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1.4 }}>{selectedNotice.title}</h2>
                                <button 
                                    onClick={() => setSelectedNotice(null)} 
                                    style={{ position: 'absolute', top: 15, right: 15, background: '#f1f5f9', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: '#64748b' }}
                                >✕</button>
                            </div>
                            
                            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                                <div 
                                    style={{ fontSize: '0.95rem', color: '#334155', lineHeight: 1.6 }}
                                    dangerouslySetInnerHTML={{ __html: selectedNotice.content }} 
                                />
                                
                                {selectedNotice.attachments?.length > 0 && (
                                    <div style={{ marginTop: 25, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: 10 }}>첨부파일 ({selectedNotice.attachments.length})</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {selectedNotice.attachments.map((at, ai) => (
                                                <a key={ai} href={at.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px', background: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#2563eb', fontSize: '0.85rem', fontWeight: 600 }}>
                                                    <span>📎</span> {at.name}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div style={{ padding: '15px 20px', background: '#f8fafc' }}>
                                <button className={styles.onboardingBtn} onClick={() => setSelectedNotice(null)} style={{ margin: 0 }}>닫기</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
