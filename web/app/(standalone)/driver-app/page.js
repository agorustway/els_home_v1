'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './driver.module.css';

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

    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // ─── Refs ───
    const gpsIntervalRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);
    const audioRef = useRef(null);

    const GPS_INTERVALS = { driving: 30000, paused: 60000, idle: 120000 };
    const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    // ─── Helper: Phone Formatting ───
    const formatPhone = (val) => {
        const num = val.replace(/[^0-9]/g, '');
        if (num.length <= 3) return num;
        if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
        return `${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7, 11)}`;
    };

    const cleanPhone = (val) => val.replace(/[^0-9]/g, '');

    // ─── Helper: Timer Formatting ───
    const formatTime = (totalSeconds) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const [showFloatingTimer, setShowFloatingTimer] = useState(false);
    const scrollContainerRef = useRef(null);

    // ─── 초기화 ───
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
            
            const handleScroll = () => {
                const statusEl = document.getElementById('status-section');
                if (statusEl) {
                    const rect = statusEl.getBoundingClientRect();
                    setShowFloatingTimer(rect.bottom < 0);
                }
            };
            window.addEventListener('scroll', handleScroll);
            return () => window.removeEventListener('scroll', handleScroll);
        }
    }, []);

    // ─── 비즈니스 액션 ───
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedPhone = localStorage.getItem('els_driver_phone');
            const storedVehicle = localStorage.getItem('els_driver_vehicle');
            const storedVehicleId = localStorage.getItem('els_driver_vehicle_id');
            const storedName = localStorage.getItem('els_driver_name');

            if (storedPhone) setDriverPhone(formatPhone(storedPhone));
            if (storedVehicle) setVehicleNumber(storedVehicle);
            if (storedVehicleId) setVehicleId(storedVehicleId);
            if (storedName) setDriverName(storedName);
        }
        checkActiveTrip();
    }, []);

    // 정보 로컬 저장
    useEffect(() => {
        if (driverPhone) localStorage.setItem('els_driver_phone', cleanPhone(driverPhone));
        if (vehicleNumber) localStorage.setItem('els_driver_vehicle', vehicleNumber);
        if (vehicleId) localStorage.setItem('els_driver_vehicle_id', vehicleId);
        if (driverName) localStorage.setItem('els_driver_name', driverName);
    }, [driverPhone, vehicleNumber, vehicleId, driverName]);

    // ─── 2. 운전원 정보 자동 매칭 (Search API) ───
    useEffect(() => {
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

    // ─── 3. 타이머 로직 ───
    useEffect(() => {
        if (tripStatus === 'driving') {
            timerIntervalRef.current = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(timerIntervalRef.current);
        }
        return () => clearInterval(timerIntervalRef.current);
    }, [tripStatus]);

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

    const playSilence = () => { if (audioRef.current) audioRef.current.play().catch(() => {}); };
    const stopSilence = () => { if (audioRef.current) audioRef.current.pause(); };

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
    const checkActiveTrip = async () => {
        try {
            const params = new URLSearchParams({ mode: 'my' });
            const phone = cleanPhone(driverPhone);
            if (phone) params.append('phone', phone);
            if (vehicleNumber) params.append('vehicle_number', vehicleNumber);
            
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
                    setSpecialNotes(active.special_notes || '');
                    
                    const started = new Date(active.started_at);
                    setElapsedSeconds(Math.floor((Date.now() - started.getTime()) / 1000));
                    
                    if (active.photos?.length > 0) setPhotos(active.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
                    if (active.status === 'driving') { startGPS(active.id, 'driving'); playSilence(); }
                    fetchHistory();
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
                    driver_name: driverName, driver_phone: cleanPhone(driverPhone),
                    vehicle_number: vehicleNumber, vehicle_id: vehicleId,
                    container_number: containerNumber, seal_number: sealNumber,
                    container_type: containerType, special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
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

    const fetchHistory = async () => {
        const phone = cleanPhone(driverPhone);
        if (!phone && !vehicleNumber) return;
        
        const params = new URLSearchParams({ mode: 'my', month: historyMonth });
        if (phone) params.append('phone', phone);
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
                if (data.photos) {
                    setPhotos(data.photos.map(p => ({ ...p, previewUrl: p.url, uploaded: true })));
                }
            } catch { alert('업로드 실패'); } finally { setUploading(false); }
        }
    };

    const handleInstallClick = () => {
        alert('브라우저 메뉴의 "홈 화면에 추가"를 선택하여 앱으로 설치해주세요.');
    };

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving';

    const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    return (
        <div className={styles.driverPage}>
            {/* 📍 PWA & Mobile Meta Tags */}
            <title>ELS 차량용 운송관리</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

            <audio ref={audioRef} loop muted playsInline src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />

            <div className={styles.devBanner}>
                <div>ELS 차량용 운송 관리</div>
                {!isPwa && (
                    <button onClick={handleInstallClick} style={{ marginTop: '8px', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff' }}>
                        📥 앱 다운로드
                    </button>
                )}
            </div>

            <div className={styles.gpsBar}>
                <span>
                    <span className={`${styles.gpsDot} ${gpsActive ? styles.gpsDotActive : styles.gpsDotInactive}`} />
                    GPS {gpsActive ? '정상 수신' : '수신 대기'}
                </span>
                {lastCoords && <span style={{fontSize: '0.7rem'}}>📍 {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}</span>}
            </div>

            {isActive && (
                <div id="status-section" className={isDriving ? styles.activeStatus : styles.pausedStatus}>
                    <div className={isDriving ? styles.activeStatusTitle : styles.pausedStatusTitle}>
                        {isDriving ? '🟢 운행 중' : '🟡 일시정지'}
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 900, margin: '5px 0', fontFamily: 'monospace' }}>
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
                            <input className={styles.formInput} placeholder="12가3456" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.replace(/\s/g,''))} disabled={isDriving} />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>차량ID (자동)</label>
                            <input className={styles.formInput} style={{background: '#f1f5f9'}} placeholder="아이디" value={vehicleId} onChange={e => setVehicleId(e.target.value.toUpperCase())} disabled={isDriving} />
                        </div>
                    </div>
                    <div className={styles.formRowFlex}>
                        <div className={`${styles.formRow} ${styles.colName}`}>
                            <label className={styles.formLabel}>이름 *</label>
                            <input className={styles.formInput} placeholder="성함" value={driverName} onChange={e => setDriverName(e.target.value)} disabled={isDriving} />
                        </div>
                        <div className={`${styles.formRow} ${styles.colPhone}`}>
                            <label className={styles.formLabel}>전화번호</label>
                            <input className={styles.formInput} placeholder="010-0000-0000" type="tel" value={driverPhone} onChange={e => setDriverPhone(formatPhone(e.target.value))} disabled={isDriving} />
                        </div>
                    </div>
                    
                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>컨테이너</label>
                        <input className={styles.formInput} placeholder="번호 입력" value={containerNumber} onChange={e => setContainerNumber(e.target.value.toUpperCase())} disabled={isDriving} />
                    </div>

                    <div className={styles.formRowFlex}>
                        <div className={`${styles.formRow} ${styles.colSeal}`}>
                            <label className={styles.formLabel}>씰넘버</label>
                            <input className={styles.formInput} placeholder="번호 입력" value={sealNumber} onChange={e => setSealNumber(e.target.value.toUpperCase())} disabled={isDriving} />
                        </div>
                        <div className={`${styles.formRow} ${styles.colType}`}>
                            <label className={styles.formLabel}>타입</label>
                            <select className={styles.formInput} value={containerType} onChange={e => setContainerType(e.target.value)} disabled={isDriving}>
                                <option value="40FT">40FT</option>
                                <option value="20FT">20FT</option>
                                <option value="45FT">45FT</option>
                                <option value="REFRIGERATED">REF</option>
                                <option value="OPEN-TOP">OT</option>
                                <option value="FLAT-RACK">FR</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className={styles.photoSection}>
                        <label className={styles.formLabel}>사진 등록 (최대 10장)</label>
                        <div className={styles.photoGrid}>
                            {photos.map((p, i) => (
                                <div key={i} style={{position: 'relative'}}>
                                    <img src={p.previewUrl} className={styles.photoThumb} alt="" />
                                    {p.uploaded && <span style={{position: 'absolute', bottom: -5, right: -5, fontSize: '0.6rem', padding: '2px 4px', background: '#10b981', color:'#fff', borderRadius:'4px', zIndex: 5}}>완료</span>}
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
                    <button className={styles.startBtn} onClick={handleStart}>🏁 운행 시작</button>
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
                            <div className={styles.historyDate}>{new Date(h.started_at).toLocaleString()}</div>
                            <div className={styles.historyContainer}>📦 {h.container_number || '미입력'} ({h.container_type})</div>
                            <div className={styles.historyMeta}>
                                {h.vehicle_number} | {h.driver_name}
                            </div>
                        </div>
                    )) : (
                        <div className={styles.historyEmpty}>해당 월의 운송 기록이 없습니다.</div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                body { margin: 0; background: #f8fafc; font-family: sans-serif; -webkit-tap-highlight-color: transparent; }
                select { -webkit-appearance: none; appearance: none; }
            `}</style>
        </div>
    );
}
