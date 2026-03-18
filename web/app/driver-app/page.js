'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import styles from './driver.module.css';
import { CONTAINER_TYPES } from '@/constants/vehicleTracking';

/**
 * 🚛 ELS 독립형 운전원 전용 앱 (Independent Driver App)
 * - 인트라넷 레이아웃 비종속 (Standalone)
 * - Media Session API를 통한 백그라운드 제어 (상태바/잠금화면 버튼 지원)
 * - Wake Lock API를 통한 화면 꺼짐 방지
 * - 홈 화면 추가 시 독립 앱으로 작동 (PWA)
 */
export default function DriverAppPage() {
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [containerNumber, setContainerNumber] = useState('');
    const [sealNumber, setSealNumber] = useState('');
    const [containerType, setContainerType] = useState('40FT');
    const [specialNotes, setSpecialNotes] = useState('');
    const [photos, setPhotos] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [driverContactLoaded, setDriverContactLoaded] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [activeTrip, setActiveTrip] = useState(null);
    const [tripStatus, setTripStatus] = useState(null); // 'driving' | 'paused' | null
    const [gpsActive, setGpsActive] = useState(false);
    const [lastCoords, setLastCoords] = useState(null);
    const [sendCount, setSendCount] = useState(0);

    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const gpsIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);
    const audioRef = useRef(null); // Media Session 활성화를 위한 무음 오디오

    const GPS_INTERVALS = { driving: 30000, paused: 60000, idle: 180000 };
    const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    // ─── 1. 초기 로드 및 권한 체크 ───
    useEffect(() => {
        const storedPhone = localStorage.getItem('els_driver_phone');
        const storedVehicle = localStorage.getItem('els_driver_vehicle');
        const storedVehicleId = localStorage.getItem('els_driver_vehicle_id');
        const storedName = localStorage.getItem('els_driver_name');

        if (storedPhone) setDriverPhone(storedPhone);
        if (storedVehicle) setVehicleNumber(storedVehicle);
        if (storedVehicleId) setVehicleId(storedVehicleId);
        if (storedName) setDriverName(storedName);

        (async () => {
            try {
                const res = await fetch('/api/users/me');
                const data = await res.json();
                if (data.profile) {
                    setIsLoggedIn(true);
                    if (!driverName) setDriverName(data.profile.full_name || '');
                    if (!driverPhone) setDriverPhone(data.profile.phone || '');
                }
            } catch { setIsLoggedIn(false); }
        })();

        checkActiveTrip();
    }, []);

    // ─── 2. 정보 저장 ───
    useEffect(() => {
        if (driverPhone) localStorage.setItem('els_driver_phone', driverPhone);
        if (vehicleNumber) localStorage.setItem('els_driver_vehicle', vehicleNumber);
        if (vehicleId) localStorage.setItem('els_driver_vehicle_id', vehicleId);
        if (driverName) localStorage.setItem('els_driver_name', driverName);
    }, [driverPhone, vehicleNumber, vehicleId, driverName]);

    // ─── 3. MediaSession 설정 (상태바 컨트롤) ───
    const updateMediaSession = useCallback((status, trip) => {
        if (!('mediaSession' in navigator)) return;

        if (status && trip) {
            const statusLabel = status === 'driving' ? '운행 중' : '일시정지';
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: `[${statusLabel}] ${trip.vehicle_number}`,
                artist: `ELS 운송 - ${trip.driver_name}`,
                album: `컨테이너: ${trip.container_number || '미입력'}`,
                artwork: [
                    { src: 'https://cdn-icons-png.flaticon.com/512/2555/2555013.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            // 핸들러 등록
            navigator.mediaSession.setActionHandler('play', () => handleResume());
            navigator.mediaSession.setActionHandler('pause', () => handlePause());
        } else {
            navigator.mediaSession.metadata = null;
        }
    }, [tripStatus, activeTrip]);

    const playSilence = () => { if (audioRef.current) audioRef.current.play().catch(() => {}); };
    const stopSilence = () => { if (audioRef.current) audioRef.current.pause(); };

    // ─── 4. 위치 전송 로직 ───
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

    const startGPS = useCallback((tripId) => {
        if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
        sendLocation(tripId);
        const tick = () => {
            let interval = idleCountRef.current >= 3 ? GPS_INTERVALS.idle : GPS_INTERVALS.driving;
            sendLocation(tripId);
            if (gpsIntervalRef.current) clearTimeout(gpsIntervalRef.current);
            gpsIntervalRef.current = setTimeout(tick, interval);
        };
        gpsIntervalRef.current = setTimeout(tick, GPS_INTERVALS.driving);
    }, [sendLocation]);

    const stopGPS = useCallback(() => {
        if (gpsIntervalRef.current) { clearTimeout(gpsIntervalRef.current); clearInterval(gpsIntervalRef.current); }
        gpsIntervalRef.current = null;
        setGpsActive(false);
        idleCountRef.current = 0;
    }, []);

    // ─── 5. 비즈니스 액션 ───
    const checkActiveTrip = async () => {
        try {
            const params = new URLSearchParams({ mode: 'my' });
            if (driverPhone) params.append('phone', driverPhone);
            if (vehicleNumber) params.append('vehicle_number', vehicleNumber);
            const res = await fetch(`/api/vehicle-tracking/trips?${params.toString()}`);
            const data = await res.json();
            if (data.trips) {
                const active = data.trips.find(t => t.status === 'driving' || t.status === 'paused');
                if (active) {
                    setActiveTrip(active);
                    setTripStatus(active.status);
                    setVehicleNumber(active.vehicle_number);
                    setDriverName(active.driver_name);
                    setDriverPhone(active.driver_phone || '');
                    setContainerNumber(active.container_number || '');
                    setSealNumber(active.seal_number || '');
                    setContainerType(active.container_type || '40FT');
                    setSpecialNotes(active.special_notes || '');
                    if (active.photos?.length > 0) setPhotos(active.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
                    if (active.status === 'driving') { startGPS(active.id); playSilence(); }
                    updateMediaSession(active.status, active);
                }
            }
        } catch { }
    };

    const handleStart = async () => {
        if (!vehicleNumber.trim() || !driverName.trim()) { alert('차량번호와 이름은 필수입니다.'); return; }
        try {
            const res = await fetch('/api/vehicle-tracking/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driver_name: driverName, driver_phone: driverPhone,
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                    container_number: containerNumber, seal_number: sealNumber,
                    container_type: containerType, special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                setActiveTrip(data.trip);
                setTripStatus('driving');
                startGPS(data.trip.id);
                playSilence();
                updateMediaSession('driving', data.trip);
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
                updateMediaSession('paused', data.trip);
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
                    action: 'resume', driver_name: driverName, driver_phone: driverPhone,
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
                startGPS(activeTrip.id);
                playSilence();
                updateMediaSession('driving', data.trip);
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
                    action: 'complete', driver_name: driverName, driver_phone: driverPhone,
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                }),
            });
            if (res.ok) {
                stopGPS(); stopSilence(); setActiveTrip(null); setTripStatus(null);
                updateMediaSession(null);
                fetchHistory();
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const fetchHistory = async () => {
        const params = new URLSearchParams({ mode: 'my', month: historyMonth });
        if (driverPhone) params.append('phone', driverPhone);
        if (vehicleNumber) params.append('vehicle_number', vehicleNumber);
        try {
            const res = await fetch(`/api/vehicle-tracking/trips?${params.toString()}`);
            const data = await res.json();
            if (data.trips) setHistory(data.trips.filter(t => t.status === 'completed'));
        } catch { }
    };

    const handlePhotoAdd = async (e) => {
        const files = Array.from(e.target.files);
        if (photos.length + files.length > 10) { alert('사진은 최대 10장까지 가능합니다.'); return; }
        const newPhotos = files.map(f => ({ file: f, previewUrl: URL.createObjectURL(f), uploaded: false, name: f.name }));
        setPhotos(prev => [...prev, ...newPhotos]);
        if (activeTrip) {
            setUploading(true);
            const formData = new FormData();
            formData.append('trip_id', activeTrip.id);
            files.forEach(f => formData.append('photos', f));
            try {
                const res = await fetch('/api/vehicle-tracking/photos', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.photos) setPhotos(data.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
            } catch { alert('업로드 실패'); } finally { setUploading(false); }
        }
    };

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving';

    return (
        <div className={styles.driverPage}>
            {/* 📍 PWA & Mobile Meta Tags (Head는 Next.js 전용 레이아웃 밖에서 작동) */}
            <title>ELS 운전원 전전 전용 앱</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <audio ref={audioRef} loop muted playsInline src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />

            <div className={styles.devBanner}>🚛 ELS 독립형 운송 관리</div>

            <div className={styles.gpsBar}>
                <span>
                    <span className={`${styles.gpsDot} ${gpsActive ? styles.gpsDotActive : styles.gpsDotInactive}`} />
                    GPS {gpsActive ? '활성' : '대기'}
                </span>
                {lastCoords && <span>📍 {lastCoords.lat.toFixed(4)}, {lastCoords.lng.toFixed(4)}</span>}
                {sendCount > 0 && <span>전송 {sendCount}회</span>}
            </div>

            {isActive && (
                <div className={isDriving ? styles.activeStatus : styles.pausedStatus}>
                    <div className={isDriving ? styles.activeStatusTitle : styles.pausedStatusTitle}>
                        {isDriving ? '🟢 운행 중' : '🟡 일시정지'}
                    </div>
                    <div className={styles.activeStatusSub}>{activeTrip?.vehicle_number}</div>
                </div>
            )}

            <div className={styles.formSection}>
                <div className={styles.formTitle}>🚛 정보 입력</div>
                <div className={styles.formGrid}>
                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}><label className={styles.formLabel}>차량번호 *</label><input className={styles.formInput} value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} disabled={isDriving} /></div>
                        <div className={styles.formRow}><label className={styles.formLabel}>차량ID</label><input className={styles.formInput} value={vehicleId} onChange={e => setVehicleId(e.target.value.toUpperCase())} disabled={isDriving} /></div>
                    </div>
                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}><label className={styles.formLabel}>이름 *</label><input className={styles.formInput} value={driverName} onChange={e => setDriverName(e.target.value)} disabled={isDriving} /></div>
                        <div className={styles.formRow}><label className={styles.formLabel}>전화번호</label><input className={styles.formInput} value={driverPhone} onChange={e => setDriverPhone(e.target.value)} disabled={isDriving} /></div>
                    </div>
                    <div className={styles.formRow}><label className={styles.formLabel}>컨테이너</label><input className={styles.formInput} value={containerNumber} onChange={e => setContainerNumber(e.target.value)} disabled={isDriving} /></div>
                    <div className={styles.photoSection}>
                        <div className={styles.photoGrid}>
                            {photos.map((p, i) => <img key={i} src={p.previewUrl} className={styles.photoThumb} alt="" />)}
                            <label className={styles.photoAddBtn}>{uploading ? '⏳' : '+'}<input type="file" multiple hidden onChange={handlePhotoAdd} /></label>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.actionSection}>
                {!isActive ? (
                    <button className={styles.startBtn} onClick={handleStart}>🏁 운행 시작</button>
                ) : (
                    <div className={styles.actionRow}>
                        {isDriving ? (
                            <button className={styles.pauseBtn} onClick={handlePause}>⏸️ 일시정지</button>
                        ) : (
                            <button className={styles.resumeBtn} onClick={handleResume}>▶️ 재개</button>
                        )}
                        <button className={styles.stopBtn} onClick={handleStop}>⏹️ 종료</button>
                    </div>
                )}
            </div>

            <style jsx global>{`
                body { margin: 0; background: #f8fafc; font-family: sans-serif; -webkit-tap-highlight-color: transparent; }
            `}</style>
        </div>
    );
}
