'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './driver.module.css';
import { GPS_INTERVALS, GPS_OPTIONS, CONTAINER_TYPES, CONTAINER_KINDS } from '@/constants/vehicleTracking';
import { Capacitor } from '@capacitor/core';

// Capacitor Custom Plugin for Overlay
const Overlay = (typeof window !== 'undefined' && Capacitor.isNativePlatform()) 
    ? require('@capacitor/core').registerPlugin('Overlay') 
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
                }, 'image/jpeg', 0.7); // 0.7 퀄리티로 압축 강화
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

    const hasInitializedRef = useRef(false);

    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving';

    // ─── Refs ───
    const gpsIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);
    const audioRef = useRef(null);

    const [showFloatingTimer, setShowFloatingTimer] = useState(false);
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
                                tripId: active.id
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

    const handleSelectHistory = (trip) => {
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
        
        scrollToTop();
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
                            tripId: data.trip.id
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
        setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
        const storedPhone = localStorage.getItem('els_driver_phone');
        const storedVehicle = localStorage.getItem('els_driver_vehicle');
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





    return (
        <>
            {/* 📍 PWA & Mobile Meta Tags */}
            <title>ELS 차량용 운송관리</title>
            <link rel="manifest" href="/manifest_driver.json" />
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <audio ref={audioRef} loop muted playsInline src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />



            <div className={styles.driverPage}>
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
                                disabled={isRefreshing}
                                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '8px', background: isRefreshing ? '#e2e8f0' : 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)', color: '#334155', fontWeight: 800, transition: 'all 0.2s' }}
                            >
                                {isRefreshing ? '⌛' : '🔄'} 갱신
                            </button>
                        </div>
                    </div>

                    <div style={{ fontSize: '2.2rem', fontWeight: 900, margin: '8px 0', fontFamily: 'monospace', letterSpacing: '1px', color: '#1e293b' }}>
                        {formatTime(elapsedSeconds)}
                    </div>

                    {/* 한손 조작을 위한 중앙 배치 버튼 */}
                    <div className={styles.statusActionRow}>
                        {isDriving ? (
                            <button className={styles.statusPauseBtn} onClick={handlePause}>
                                <span style={{fontSize:'1.4rem'}}>⏸️</span><br/>일시정지
                            </button>
                        ) : (
                            <button className={styles.statusResumeBtn} onClick={handleResume}>
                                <span style={{fontSize:'1.4rem'}}>▶️</span><br/>운행재개
                            </button>
                        )}
                        <button className={styles.statusStopBtn} onClick={handleStop}>
                            <span style={{fontSize:'1.4rem'}}>⏹️</span><br/>운행종료
                        </button>
                    </div>

                    <div className={styles.activeStatusSub}>{activeTrip?.vehicle_number} | {activeTrip?.driver_name}</div>
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

                    {/* 수정 모드 안내 */}
                    {selectedHistoryId && (
                        <div style={{ background: '#fef3c7', padding: '10px 14px', borderRadius: '10px', marginBottom: 15, border: '1px solid #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems:'center' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#92400e' }}>🚨 과거 운송 기록 수정 모드</div>
                            <button onClick={() => { setSelectedHistoryId(null); checkActiveTrip(); }} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background:'#fff', fontSize:'0.75rem', fontWeight:700 }}>해제 (X)</button>
                        </div>
                    )}

                    {(isActive || selectedHistoryId) && (
                        <button 
                            className={styles.updateInlineBtn} 
                            onClick={handleUpdateInfo}
                            style={{ background: selectedHistoryId ? '#dbeafe' : '#f8fafc', borderColor: selectedHistoryId ? '#3b82f6' : '#cbd5e1', color: selectedHistoryId ? '#1e40af' : '#475569' }}
                        >
                            {selectedHistoryId ? '✍️ 기록 수정내역 확인 및 저장' : '📝 현재 정보 수정내역 저장'}
                        </button>
                    )}
                    
                    <div className={styles.photoSection}>
                        <label className={styles.formLabel}>사진 등록 (최대 10장)</label>
                        <div className={styles.photoGrid}>
                            {photos.map((p, i) => (
                                <div key={i} style={{position: 'relative'}}>
                                    <img src={p.key ? `/api/vehicle-tracking/photos/view?key=${encodeURIComponent(p.key)}` : p.previewUrl} className={styles.photoThumb} alt="" />
                                    {p.uploaded && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handlePhotoDelete(p); }}
                                            style={{position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.3)'}}
                                        >
                                            ✕
                                        </button>
                                    )}
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
                {!isActive && (
                    <>
                        <button className={styles.startBtn} onClick={handleStart} style={{ marginTop: 12 }}>
                            🏁 운송 시작하기 (Start)
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
                        <div key={i} className={`${styles.historyCard} ${selectedHistoryId === h.id ? styles.historyCardActive : ''}`} onClick={() => handleSelectHistory(h)}>
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
