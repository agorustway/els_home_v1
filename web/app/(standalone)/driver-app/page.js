'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './driver.module.css';
import { GPS_INTERVALS, GPS_OPTIONS, CONTAINER_TYPES, CONTAINER_KINDS } from '@/constants/vehicleTracking';

/**
 * 🚛 ELS 차량용 운송 관리 (Enhanced Driver App)
 * - 인트라넷 레이아웃 비종속 (Standalone)
 * - 운전원 정보(driver_contacts) 연동 및 차량ID 자동 매칭
 * - Media Session API를 통한 백그라운드 타이머 및 제어
 * - GPS 주기 최적화 (이동 30초, 정지 1분, 대기 2분)
 * - 사진 최대 10장 지원 및 상세 입기
 */
export default function DriverAppPage() {
    // ─── States ───
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
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
    const [isMinimized, setIsMinimized] = useState(false); // 최소화 모드

    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving';

    // ─── Refs ───
    const gpsIntervalRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);
    const audioRef = useRef(null);

    const GPS_INTERVALS = { driving: 30000, paused: 60000, idle: 120000 };
    const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    const cleanPhone = (val) => val.replace(/[^0-9]/g, '');

    // ─── Helper: Phone Formatting ───
    const formatPhone = useCallback((val) => {
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    }, []);

    // ─── Helper: Timer Formatting ───
    const formatTime = (totalSeconds) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const [showFloatingTimer, setShowFloatingTimer] = useState(false);
    const scrollContainerRef = useRef(null);

    const playSilence = useCallback(() => { if (audioRef.current) audioRef.current.play().catch(() => {}); }, []);
    const stopSilence = useCallback(() => { if (audioRef.current) audioRef.current.pause(); }, []);

    // ─── 5. 위치 전송 로직 ───
    const sendLocation = useCallback(async (tripId) => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
                setLastCoords({ lat, lng });
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
                    setSendCount(prev => prev + 1);
                } catch { }
            },
            () => setGpsActive(false),
            GPS_OPTIONS
        );
    }, []);

    const startGPS = useCallback((tripId, status) => {
        if (gpsIntervalRef.current) clearTimeout(gpsIntervalRef.current);
        const tick = () => {
            let interval = GPS_INTERVALS.driving;
            if (status === 'paused') interval = GPS_INTERVALS.paused;
            else if (idleCountRef.current >= 3) interval = GPS_INTERVALS.idle;

            sendLocation(tripId);
            gpsIntervalRef.current = setTimeout(tick, interval);
        };
        tick();
    }, [sendLocation]);

    const stopGPS = useCallback(() => {
        if (gpsIntervalRef.current) clearTimeout(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
        setGpsActive(false);
        idleCountRef.current = 0;
    }, []);

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

    // ─── 6. 비즈니스 액션 ───
    const checkActiveTrip = useCallback(async (p, v) => {
        try {
            const params = new URLSearchParams({ mode: 'my' });
            const phone = p ? cleanPhone(p) : cleanPhone(driverPhone);
            const veh = v || vehicleNumber;

            if (phone) params.append('phone', phone);
            if (veh) params.append('vehicle_number', veh);
            
            if (!phone && !veh) return; // 정보 없으면 패스

            const res = await fetch(`/api/vehicle-tracking/trips?${params.toString()}`);
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
                    if (active.status === 'driving') { startGPS(active.id, 'driving'); playSilence(); }
                }
                // 진행 중인 것이 있든 없든, 내역(History)은 가져오도록 함
                fetchHistory();
            }
        } catch { }
    }, [driverPhone, vehicleNumber, formatPhone, startGPS, playSilence, fetchHistory, cleanPhone]);

    // ─── PWA 설치 프로프트 ───
    useEffect(() => {
        const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
        window.addEventListener('beforeinstallprompt', handler);
        
        // iOS 여부 확인
        const userAgent = window.navigator.userAgent.toLowerCase();
        setIsIOS(/iphone|ipad|ipod/.test(userAgent));
        
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallApp = async () => {
        if (!deferredPrompt) {
            if (isIOS) alert('아이폰(iOS)은 사파리 브라우저 하단의 [공유] → [홈 화면에 추가]를 눌러주세요.');
            else alert('이 브라우저는 직접 설치를 지원하지 않습니다. 크롬 브라우저를 이용해 주세요.');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setDeferredPrompt(null);
    };

    // ─── 초기화 및 타이머 ───
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
        
        const storedPhone = localStorage.getItem('els_driver_phone');
        const storedVehicle = localStorage.getItem('els_driver_vehicle');
        const storedName = localStorage.getItem('els_driver_name');

        if (storedPhone || storedVehicle) {
            checkActiveTrip(storedPhone, storedVehicle);
        }

        const handleScroll = () => {
            const statusEl = document.getElementById('status-section');
            if (statusEl) {
                const rect = statusEl.getBoundingClientRect();
                setShowFloatingTimer(rect.bottom < 0);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // 정적인 시간 계산용 타이머 (부드럽게 움지기게 수정)
    useEffect(() => {
        let timer;
        if (isActive && isDriving && activeTrip?.started_at) {
            const started = new Date(activeTrip.started_at).getTime();
            timer = setInterval(() => {
                const now = Date.now();
                setElapsedSeconds(Math.floor((now - started) / 1000));
            }, 1000);
        } else if (isActive && !isDriving) {
            // 일시정지 중에는 시간이 멈춤. 
            // 다만 다시 '운행 재개' 시 started_at이 갱신되는지 확인 필요.
            // 현재 로직상 일시정지 중에도 started_at은 그대로라면, 실제 운행한 시간만 계산하려면 로직이 더 필요함.
            // 일단은 현재 초수를 그대로 유지하나, 1초마다 다시 계산하진 않음.
        }
        return () => clearInterval(timer);
    }, [isActive, isDriving, activeTrip?.started_at]);

    // 정보 로컬 저장
    useEffect(() => {
        if (driverPhone) localStorage.setItem('els_driver_phone', cleanPhone(driverPhone));
        if (vehicleNumber) localStorage.setItem('els_driver_vehicle', vehicleNumber);
        if (vehicleId) localStorage.setItem('els_driver_vehicle_id', vehicleId);
        if (driverName) localStorage.setItem('els_driver_name', driverName);
    }, [driverPhone, vehicleNumber, vehicleId, driverName]);

    // ─── 2. 운전원 정보 자동 매칭 (Search API) ───
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW register error:', err));
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
                } catch (e) { console.error('Profile search error:', e); }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [driverPhone, vehicleNumber]);


    // ─── 4. MediaSession 설정 (상태바 컨트롤 & 리얼타임 타이머) ───
    useEffect(() => {
        if (!('mediaSession' in navigator) || !activeTrip) return;

        const updateMetadata = () => {
            const statusLabel = tripStatus === 'driving' ? '운행 중' : '일시정지';
            const timeLabel = formatTime(elapsedSeconds);
            
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: `${statusLabel} [${timeLabel}]`,
                artist: `${vehicleNumber} (${driverName})`,
                album: `컨테이너: ${containerNumber || '미입력'} / 씰: ${sealNumber || '-'}`,
                artwork: [
                    { src: 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png', sizes: '512x512', type: 'image/png' }
                ]
            });
        };

        updateMetadata();
        
        // 핸들러 등록
        navigator.mediaSession.setActionHandler('play', handleResume);
        navigator.mediaSession.setActionHandler('pause', handlePause);

        const metaInterval = setInterval(updateMetadata, 1000);
        return () => clearInterval(metaInterval);
    }, [tripStatus, activeTrip, elapsedSeconds, vehicleNumber, driverName, containerNumber, sealNumber]);


    const handleUpdateInfo = async () => {
        if (!activeTrip) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
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
                alert('정보가 수정되었습니다.');
                checkActiveTrip(); // 상태 갱신
            }
        } catch (e) { alert('오류: ' + e.message); }
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


    // ─── 이미지 압축 및 리사이징 (최신 이미지 압축 기술 적용) ───
    const resizeImage = (file, maxWidth = 1200, maxHeight = 1200) => {
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
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        const resizedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                        resolve(resizedFile);
                    }, 'image/jpeg', 0.8); // 80% 품질로 압축
                };
            };
        });
    };

    const handlePhotoAdd = async (e) => {
        if (!e.target.files) return;
        const rawFiles = Array.from(e.target.files);
        if (photos.length + rawFiles.length > 10) { alert('사진은 최대 10장까지 가능합니다.'); return; }
        
        // 미리보기 및 업로드 중 상태 표시
        const tempPhotos = rawFiles.map(f => ({ previewUrl: URL.createObjectURL(f), uploaded: false, uploading: true, name: f.name }));
        setPhotos(prev => [...prev, ...tempPhotos]);

        if (activeTrip) {
            setUploading(true);
            try {
                const formData = new FormData();
                formData.append('trip_id', activeTrip.id);
                
                for (const f of rawFiles) {
                    const compressed = await resizeImage(f);
                    formData.append('photos', compressed);
                    console.log(`Compressed: ${f.name} (${(f.size/1024/1024).toFixed(1)}MB -> ${(compressed.size/1024/1024).toFixed(1)}MB)`);
                }

                const res = await fetch('/api/vehicle-tracking/photos', { method: 'POST', body: formData });
                if (!res.ok) {
                    const errText = await res.text();
                    try {
                        const err = JSON.parse(errText);
                        throw new Error(err.error || '업로드 실패');
                    } catch {
                        throw new Error('서버 오류 (용량이 너무 클 수 있습니다)');
                    }
                }
                const data = await res.json();
                setPhotos(prev => prev.map(p => {
                    const uploadedPhoto = data.photos.find(up => up.original_name === p.name || up.name === p.name);
                    return uploadedPhoto ? { ...p, previewUrl: uploadedPhoto.url, uploaded: true, uploading: false } : p;
                }));
            } catch (e) {
                console.error(e);
                alert('사진 전송 오류: ' + e.message);
                setPhotos(prev => prev.filter(p => !p.uploading));
            } finally {
                setUploading(false);
            }
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


    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    return (
        <>
            {/* 📍 PWA & Mobile Meta Tags */}
            <title>ELS 차량용 운송관리</title>
            <link rel="manifest" href="/manifest_driver.json" />
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <audio ref={audioRef} loop muted playsInline src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />

            {/* 최소화 시 뜨는 플로팅 위젯 (드래그 가능) */}
            <AnimatePresence>
                {isMinimized && isActive && (
                    <motion.div 
                        drag
                        dragConstraints={{ left: 10, right: 300, top: 10, bottom: 600 }}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        onClick={() => setIsMinimized(false)}
                        style={{
                            position: 'fixed', bottom: 100, right: 20, zIndex: 100000,
                            background: '#1e293b', color: '#fff', padding: '12px 18px',
                            borderRadius: '30px', fontWeight: 900, fontSize: '1.2rem',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '2px solid #3b82f6',
                            display: 'flex', alignItems: 'center', gap: 10, cursor: 'move',
                            touchAction: 'none'
                        }}
                    >
                        <span style={{fontSize: '0.9rem', color: isDriving ? '#10b981' : '#f59e0b'}}>{isDriving ? '🟢' : '⏸️'}</span>
                        <span>{formatTime(elapsedSeconds)}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={styles.driverPage} style={{ display: isMinimized ? 'none' : 'block' }}>
            {/* 상단 헤더: 로고 + 제목 */}
            <div className={styles.header}>
                <img src="/images/logo.png" alt="ELS Logo" className={styles.headerLogo} />
                <div className={styles.headerTitle}>차량용 운송 관리</div>
            </div>

            {/* GPS 상태바 */}
            <div className={styles.gpsBar}>
                <span>
                    <span className={`${styles.gpsDot} ${gpsActive ? styles.gpsDotActive : styles.gpsDotInactive}`} />
                    GPS {gpsActive ? '정상 수신' : '수신 대기'}
                </span>
                {lastCoords && <span style={{fontSize: '0.7rem'}}>📍 {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}</span>}
            </div>

            {isActive && (
                <div id="status-section" className={isDriving ? styles.activeStatus : styles.pausedStatus}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div className={isDriving ? styles.activeStatusTitle : styles.pausedStatusTitle}>
                            {isDriving ? '🟢 운행 중' : '🟡 일시정지'}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button 
                                onClick={() => checkActiveTrip()}
                                style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '5px', background: '#fff', border: '1px solid #cbd5e1', color: '#64748b' }}
                            >
                                🔄 갱신
                            </button>
                            <button 
                                onClick={() => setIsMinimized(true)}
                                style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '5px', background: '#fff', border: '1px solid #cbd5e1', color: '#64748b' }}
                            >
                                🔳 최소화
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, margin: '5px 0', fontFamily: 'monospace', letterSpacing: '2px' }}>
                        {formatTime(elapsedSeconds)}
                    </div>
                    <div className={styles.activeStatusSub}>{activeTrip?.vehicle_number} | {activeTrip?.driver_name}</div>
                </div>
            )}

            {isActive && showFloatingTimer && (
                <div className={styles.floatingTimer} onClick={scrollToTop}>
                    <span>{isDriving ? '🟢' : '🟡'}</span>
                    <span>{formatTime(elapsedSeconds)}</span>
                </div>
            )}

            <div className={styles.formSection}>
                <div className={styles.formTitle}>🚛 정보 및 컨테이너 입력</div>
                <div className={styles.formGrid}>
                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>차량번호 *</label>
                            <input className={styles.formInput} placeholder="12가3456" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.replace(/\s/g,''))} />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>차량ID (자동)</label>
                            <input className={styles.formInput} style={{background: '#f1f5f9'}} placeholder="아이디" value={vehicleId} onChange={e => setVehicleId(e.target.value.toUpperCase())} />
                        </div>
                    </div>
                    <div className={styles.formRowFlex}>
                        <div className={`${styles.formRow} ${styles.colName}`}>
                            <label className={styles.formLabel}>이름 *</label>
                            <input className={styles.formInput} placeholder="성함" value={driverName} onChange={e => setDriverName(e.target.value)} />
                        </div>
                        <div className={`${styles.formRow} ${styles.colPhone}`}>
                            <label className={styles.formLabel}>전화번호</label>
                            <input className={styles.formInput} placeholder="010-0000-0000" type="tel" value={driverPhone} onChange={e => setDriverPhone(formatPhone(e.target.value))} />
                        </div>
                    </div>
                    
                    <div className={styles.formRowFlex}>
                        <div className={styles.formRow} style={{flex: 1}}>
                            <label className={styles.formLabel}>컨테이너</label>
                            <input className={styles.formInput} placeholder="번호 입력" value={containerNumber} onChange={e => setContainerNumber(e.target.value.toUpperCase())} />
                        </div>
                        <div className={`${styles.formRow} ${styles.colType}`}>
                            <label className={styles.formLabel}>타입</label>
                            <select className={styles.formInput} value={containerType} onChange={e => setContainerType(e.target.value)}>
                                {CONTAINER_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className={styles.formRowFlex}>
                        <div className={styles.formRow} style={{flex: 1}}>
                            <label className={styles.formLabel}>씰넘버</label>
                            <input className={styles.formInput} placeholder="번호 입력" value={sealNumber} onChange={e => setSealNumber(e.target.value.toUpperCase())} />
                        </div>
                        <div className={styles.formRow} style={{flex: 1}}>
                            <label className={styles.formLabel}>종류</label>
                            <select className={styles.formInput} value={containerKind} onChange={e => setContainerKind(e.target.value)}>
                                {CONTAINER_KINDS.map(kind => (
                                    <option key={kind} value={kind}>{kind}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isActive && (
                        <button className={styles.updateInlineBtn} onClick={handleUpdateInfo}>
                            📝 정보 수정내용 저장
                        </button>
                    )}
                    
                    <div className={styles.photoSection}>
                        <label className={styles.formLabel}>사진 등록 (최대 10장)</label>
                        <div className={styles.photoGrid}>
                            {photos.map((p, i) => (
                                <div key={i} style={{position: 'relative'}}>
                                    <img src={p.previewUrl} className={styles.photoThumb} alt="" />
                                    {p.uploaded && <span style={{position: 'absolute', bottom: -5, right: -5, fontSize: '0.6rem', padding: '2px 4px', background: '#10b981', color:'#fff', borderRadius:'4px', zIndex: 5}}>완료</span>}
                                    {p.uploading && <span style={{position: 'absolute', bottom: -5, right: -5, fontSize: '0.6rem', padding: '2px 4px', background: '#f97316', color:'#fff', borderRadius:'4px', zIndex: 5}}>업로드 중</span>}
                                </div>
                            ))}
                            {photos.length < 10 && (
                                <label className={styles.photoAddBtn}>
                                    {uploading ? '⏳' : '+'}
                                    <input type="file" multiple accept="image/*" hidden onChange={handlePhotoAdd} />
                                </label>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.actionSection}>
                {!isActive ? (
                    <>
                        <button className={styles.startBtn} onClick={handleStart} style={{ marginTop: 12 }}>
                            🏁 운송 시작하기
                        </button>

                        {/* PWA 설치 유도 */}
                        <div style={{ marginTop: 24, padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                                {isIOS ? '💡 아이폰은 전용 앱으로 더욱 편하게' : '📦 전용 앱을 설치하여 더욱 편하게'}
                            </div>
                            <button 
                                className={styles.outlineBtn} 
                                onClick={handleInstallClick}
                                style={{ width: '100%', border: '2px solid #2563eb', color: '#2563eb', fontWeight: 800 }}
                            >
                                {isIOS ? '설치 방법 확인' : '앱(PWA) 다운로드 설치 ⚡'}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className={styles.actionRow}>
                        {isDriving ? (
                            <button className={styles.pauseBtn} onClick={handlePause}>⏸️ 일시정지</button>
                        ) : (
                            <button className={styles.resumeBtn} onClick={handleResume}>▶️ 다시 시작</button>
                        )}
                        <button className={styles.stopBtn} onClick={handleStop}>⏹️ 운행 종료</button>
                    </div>
                )}
            </div>

            {/* 운송 히스토리 */}
            <div className={styles.historySection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div className={styles.historyTitle}>📅 운송 기록</div>
                    <input 
                        type="month" 
                        value={historyMonth} 
                        onChange={(e) => setHistoryMonth(e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.8rem' }}
                    />
                </div>
                
                <div className={styles.historyList}>
                    {history.length > 0 ? history.map((h, i) => (
                        <div key={i} className={styles.historyCard}>
                            <div className={styles.historyHeader}>
                                <div className={styles.historyDate}>{new Date(h.started_at).toLocaleString()}</div>
                                <div className={`${styles.statusBadge} ${styles['status' + h.status]}`}>
                                    {h.status === 'driving' ? '운행중' : h.status === 'paused' ? '일시정지' : '운행종료'}
                                </div>
                            </div>
                            <div className={styles.historyContainer}>📦 {h.container_number || '미입력'} ({h.container_type})</div>
                            <div className={styles.historyMeta}>
                                {h.vehicle_number} | {h.driver_name}
                            </div>
                        </div>
                    )) : (
                        <div className={styles.historyEmpty}>해당 월의 기록이 없습니다.</div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                body { margin: 0; background: #f8fafc; font-family: sans-serif; -webkit-tap-highlight-color: transparent; }
                select { -webkit-appearance: none; appearance: none; }
                @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>
            </div>
        </>
    );
}
