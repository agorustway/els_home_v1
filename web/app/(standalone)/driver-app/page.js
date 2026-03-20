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
    const canvasRef = useRef(null);
    const pipVideoRef = useRef(null);
    const requestRef = useRef(null);

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
                    if (active.status === 'driving') { startGPS(active.id, 'driving'); playSilence(); }
                } else {
                    // 진행 중인 것이 없으면 상태 비움
                    setActiveTrip(null);
                    setTripStatus(null);
                }
                fetchHistory();
                initPipContext(); // PiP 준비
            }
        } catch (e) { 
            console.error('CheckActive Error:', e);
            // alert('연결 상태를 확인해 주세요.'); 
        } finally {
            setIsRefreshing(false);
        }
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

    // ─── 초기화 ───
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

    // ─── 이벤트 리스너 ───
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden' && isActive) {
                // 백그라운드 전환 로직 (필요시 추가)
                // PiP 모드일 경우 drawPip을 계속 호출하여 캔버스 업데이트
                if (isMinimized && typeof requestAnimationFrame !== 'undefined') {
                    if (requestRef.current) cancelAnimationFrame(requestRef.current);
                    const startLoop = () => {
                        drawPip();
                        requestRef.current = requestAnimationFrame(startLoop);
                    };
                    startLoop();
                }
            } else if (document.visibilityState === 'visible') {
                // 앱이 다시 포그라운드로 돌아왔을 때 PiP 렌더링 루프 중지
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                    requestRef.current = null;
                }
            }
        };

        const handleScroll = () => {
            const statusEl = document.getElementById('status-section');
            if (statusEl) {
                const rect = statusEl.getBoundingClientRect();
                setShowFloatingTimer(rect.bottom < 0);
            }
        };

        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isActive, isMinimized, drawPip]);

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
    // ─── 8. 캔버스 기반 PiP (진짜 플로팅 위젯) ───
    const drawPip = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 배경 채우기 (다크 테마)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 테두리
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 12;
        ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

        // 상태 이모지 및 텍스트
        ctx.font = 'bold 32px sans-serif';
        ctx.fillStyle = isDriving ? '#10b981' : '#f59e0b';
        ctx.textAlign = 'center';
        ctx.fillText(isDriving ? '🟢 운행 중' : '🟡 일시정지', canvas.width/2, 60);

        // 타이머
        ctx.font = '900 64px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(elapsedSeconds), canvas.width/2, 130);

        // 컨테이너 번호 (조그맣게 밑에)
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(`📦 ${containerNumber || '미입력'}`, canvas.width/2, 180);

        // GPS 상태 (우측 상단)
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = gpsActive ? '#10b981' : '#ef4444';
        ctx.textAlign = 'right';
        ctx.fillText(gpsActive ? '📡 수신중' : '❌ 끊김', canvas.width - 20, 35);

        if (isMinimized) {
            requestRef.current = requestAnimationFrame(drawPip);
        }
    }, [elapsedSeconds, isDriving, containerNumber, isMinimized, gpsActive]);

    const enterPiP = async () => {
        if (!pipVideoRef.current || !canvasRef.current) return;
        
        try {
            // 캔버스 스트림 생성 (최초 1회만)
            if (!pipVideoRef.current.srcObject) {
                const stream = canvasRef.current.captureStream(10); // 10fps로 품질 상향
                pipVideoRef.current.srcObject = stream;
            }
            
            // 모바일 브라우저 대응: 비디오를 강제로 재생함
            await pipVideoRef.current.play();

            // PiP 지원 여부 확인 후 요청
            if (document.pictureInPictureEnabled || pipVideoRef.current.webkitSupportsPresentationMode) {
                if (pipVideoRef.current.requestPictureInPicture) {
                    await pipVideoRef.current.requestPictureInPicture();
                } else if (pipVideoRef.current.webkitSetPresentationMode) {
                    // iOS 대응용 웹킷 모드
                    pipVideoRef.current.webkitSetPresentationMode('picture-in-picture');
                }
            }
            
            setIsMinimized(true);
            // React 상태 업데이트 전 즉시 렌더 루프 시작
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            const startLoop = () => {
                drawPip();
                requestRef.current = requestAnimationFrame(startLoop);
            };
            startLoop();
            
        } catch (e) {
            console.error('PiP Error:', e);
            // PiP 실패/미지원 시 브라우저 내부용 미니 위젯 모드로 강제 진입
            setIsMinimized(true);
        }
    };

    const exitPiP = async () => {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        }
        setIsMinimized(false);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };

    useEffect(() => {
        const handleLeavePiP = () => {
            setIsMinimized(false);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
        const video = pipVideoRef.current;
        if (video) video.addEventListener('leavepictureinpicture', handleLeavePiP);
        return () => {
            if (video) video.removeEventListener('leavepictureinpicture', handleLeavePiP);
        };
    }, []);

    const initPipContext = async () => {
        if (!pipVideoRef.current || !canvasRef.current || !canvasRef.current.captureStream) return;
        try {
            if (!pipVideoRef.current.srcObject) {
                const stream = canvasRef.current.captureStream(10);
                pipVideoRef.current.srcObject = stream;
            }
            if (pipVideoRef.current.paused) {
                await pipVideoRef.current.play().catch(() => {});
            }
            // 루프는 필요할 때만 호출 (enterPiP에서 시작)
        } catch (e) { console.error('PiP Init Error:', e); }
    };


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
                initPipContext(); // PiP 준비 (홈버튼 시 자동 전환용)
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

            {/* 진짜 플로팅 위젯을 위한 보이지 않는 요소 (일부 브라우저는 숨김 시 PiP 차단하므로 opactiy 0 사용) */}
            <canvas ref={canvasRef} width="300" height="220" style={{ position: 'fixed', bottom: -1000, pointerEvents: 'none', opacity: 0 }} />
            <video ref={pipVideoRef} muted playsInline autoPictureInPicture={true} style={{ position: 'fixed', bottom: -1000, width: 1, height: 1, pointerEvents: 'none', opacity: 0 }} />

            {/* 최소화 시 브라우저 내부에 보일 백업 위젯 (PiP 미지원 대비) */}
            <AnimatePresence>
                {isMinimized && isActive && !document.pictureInPictureElement && (
                    <motion.div 
                        drag
                        dragConstraints={{ left: 10, right: 300, top: 10, bottom: 600 }}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        onClick={exitPiP}
                        style={{
                            position: 'fixed', bottom: 100, right: 20, zIndex: 100000,
                            background: '#1e293b', color: '#fff', padding: '16px 20px',
                            borderRadius: '24px', fontWeight: 900,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '2px solid #3b82f6',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'move',
                            touchAction: 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{fontSize: '0.9rem'}}>{isDriving ? '🟢' : '⏸️'}</span>
                            <span style={{ fontSize: '1.3rem' }}>{formatTime(elapsedSeconds)}</span>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                {gpsActive ? '📡' : '🔴'}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>📦 {containerNumber || '미입력'}</div>
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
                                disabled={isRefreshing}
                                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '8px', background: isRefreshing ? '#e2e8f0' : 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)', color: '#334155', fontWeight: 800, transition: 'all 0.2s' }}
                            >
                                {isRefreshing ? '⌛' : '🔄'} 갱신
                            </button>
                            <button 
                                onClick={enterPiP}
                                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '8px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 800, boxShadow: '0 3px 10px rgba(59, 130, 246, 0.4)' }}
                            >
                                🔳 최소화
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
