'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './driver.module.css';
import {
    GPS_INTERVALS,
    GPS_OPTIONS,
    IDLE_DISTANCE_THRESHOLD,
    CONTAINER_TYPES,
    TRIP_STATUS,
    TRIP_STATUS_LABELS,
} from '@/constants/vehicleTracking';

// 두 좌표 간 거리 (m) — Haversine
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DriverPage() {
    // 폼 상태
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [vehicleId, setVehicleId] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [containerNumber, setContainerNumber] = useState('');
    const [sealNumber, setSealNumber] = useState('');
    const [containerType, setContainerType] = useState('40FT');
    const [specialNotes, setSpecialNotes] = useState('');
    const [photos, setPhotos] = useState([]); // { previewUrl, uploaded, url, key }[]
    const [uploading, setUploading] = useState(false);
    const [driverContactLoaded, setDriverContactLoaded] = useState(false);

    // 운행 상태
    const [activeTrip, setActiveTrip] = useState(null); // 현재 활성 운행
    const [tripStatus, setTripStatus] = useState(null); // 'driving' | 'paused' | null
    const [gpsActive, setGpsActive] = useState(false);
    const [lastCoords, setLastCoords] = useState(null);
    const [sendCount, setSendCount] = useState(0);

    // 운송기록
    const [history, setHistory] = useState([]);
    const [historyMonth, setHistoryMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const gpsIntervalRef = useRef(null);
    const lastPosRef = useRef(null);
    const idleCountRef = useRef(0);

    // 프로필 로드 (이름, 전화번호 자동 채움)
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/users/me');
                const data = await res.json();
                if (data.profile) {
                    setDriverName(data.profile.full_name || '');
                    setDriverPhone(data.profile.phone || '');
                    // 프로필 로드 후 운전원정보 매칭 시도
                    if (data.profile.phone) {
                        loadDriverContact(data.profile.phone);
                    }
                }
            } catch { }
        })();

        // 기존 활성 운행 확인
        checkActiveTrip();
    }, []);

    // 운송기록 월별 로드
    useEffect(() => {
        fetchHistory();
    }, [historyMonth]);

    // 운전원정보에서 기존 차량 데이터 로드 (전화번호 기준)
    const loadDriverContact = async (phone, vehicleNum) => {
        if (driverContactLoaded) return;
        try {
            const res = await fetch('/api/driver-contacts');
            const data = await res.json();
            if (data.list) {
                const normalPhone = (phone || '').replace(/[^0-9]/g, '');
                let match = null;
                if (normalPhone) {
                    match = data.list.find(d => (d.phone || '').replace(/[^0-9]/g, '').endsWith(normalPhone.slice(-8)));
                }
                if (!match && vehicleNum) {
                    match = data.list.find(d => d.vehicle_number === vehicleNum);
                }
                if (match) {
                    if (match.vehicle_number && !vehicleNumber) setVehicleNumber(match.vehicle_number);
                    if (match.vehicle_id && !vehicleId) setVehicleId(match.vehicle_id);
                    if (match.name && !driverName) setDriverName(match.name);
                    setDriverContactLoaded(true);
                }
            }
        } catch { }
    };

    const checkActiveTrip = async () => {
        try {
            const res = await fetch('/api/vehicle-tracking/trips?mode=my');
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
                    // 기존 업로드된 사진 복원
                    if (active.photos && active.photos.length > 0) {
                        setPhotos(active.photos.map(p => ({
                            previewUrl: p.url,
                            uploaded: true,
                            url: p.url,
                            key: p.key,
                            name: p.name,
                        })));
                    }
                    // 활성 운행이 있으면 GPS 재시작
                    if (active.status === 'driving') {
                        startGPS(active.id);
                    }
                }
            }
        } catch { }
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch(`/api/vehicle-tracking/trips?mode=my&month=${historyMonth}`);
            const data = await res.json();
            if (data.trips) {
                setHistory(data.trips.filter(t => t.status === 'completed'));
            }
        } catch { }
    };

    // GPS 전송
    const sendLocation = useCallback((tripId) => {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
                setLastCoords({ lat, lng });
                setGpsActive(true);

                try {
                    await fetch('/api/vehicle-tracking/location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            trip_id: tripId,
                            lat,
                            lng,
                            accuracy,
                            speed,
                        }),
                        keepalive: true, // 백그라운드 전송 지원
                    });
                    setSendCount(c => c + 1);
                } catch (e) {
                    console.error('위치 전송 실패:', e);
                }

                // 이동/정지 판별
                if (lastPosRef.current) {
                    const dist = haversineDistance(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
                    if (dist < IDLE_DISTANCE_THRESHOLD) {
                        idleCountRef.current++;
                    } else {
                        idleCountRef.current = 0;
                    }
                }
                lastPosRef.current = { lat, lng };
            },
            (err) => {
                console.error('GPS 오류:', err.message);
                setGpsActive(false);
            },
            GPS_OPTIONS
        );
    }, []);

    // GPS 주기적 전송 시작
    const startGPS = useCallback((tripId) => {
        if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);

        // 즉시 1회 전송
        sendLocation(tripId);

        // 주기적 전송 (동적 간격)
        const tick = () => {
            // idleCount가 3 이상이면 장기대기로 판단 (30초*3 = 90초 정도 무이동)
            let interval;
            if (idleCountRef.current >= 3) {
                interval = GPS_INTERVALS.idle;    // 3분
            } else {
                interval = GPS_INTERVALS.driving; // 30초
            }

            sendLocation(tripId);

            // 다음 tick 스케줄
            if (gpsIntervalRef.current) clearTimeout(gpsIntervalRef.current);
            gpsIntervalRef.current = setTimeout(tick, interval);
        };

        gpsIntervalRef.current = setTimeout(tick, GPS_INTERVALS.driving);
    }, [sendLocation]);

    const stopGPS = useCallback(() => {
        if (gpsIntervalRef.current) {
            clearTimeout(gpsIntervalRef.current);
            clearInterval(gpsIntervalRef.current);
            gpsIntervalRef.current = null;
        }
        setGpsActive(false);
        idleCountRef.current = 0;
    }, []);

    // 운행 시작
    const handleStart = async () => {
        if (!vehicleNumber.trim() || !driverName.trim()) {
            alert('차량번호와 이름은 필수입니다.');
            return;
        }

        try {
            const res = await fetch('/api/vehicle-tracking/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    vehicle_number: vehicleNumber,
                    vehicle_id: vehicleId,
                    container_number: containerNumber,
                    seal_number: sealNumber,
                    container_type: containerType,
                    special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                setActiveTrip(data.trip);
                setTripStatus('driving');
                startGPS(data.trip.id);
            } else {
                alert(data.error || '운행 시작 실패');
            }
        } catch (e) {
            alert('오류: ' + e.message);
        }
    };

    // 일시정지
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
                // 일시중지 시 60초 간격으로 변경
                stopGPS();
                gpsIntervalRef.current = setInterval(() => sendLocation(activeTrip.id), GPS_INTERVALS.paused);
            }
        } catch (e) {
            alert('오류: ' + e.message);
        }
    };

    // 재개 (재개 시 수정한 정보도 함께 서버로 전송)
    const handleResume = async () => {
        if (!activeTrip) return;
        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'resume',
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    vehicle_number: vehicleNumber,
                    vehicle_id: vehicleId,
                    container_number: containerNumber,
                    seal_number: sealNumber,
                    container_type: containerType,
                    special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                setActiveTrip(data.trip);
                setTripStatus('driving');
                stopGPS();
                startGPS(activeTrip.id);
            }
        } catch (e) {
            alert('오류: ' + e.message);
        }
    };

    // 운행 종료
    const handleStop = async () => {
        if (!activeTrip) return;
        if (!confirm('운행을 종료하시겠습니까?')) return;

        try {
            const res = await fetch(`/api/vehicle-tracking/trips/${activeTrip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'complete',
                    driver_name: driverName,
                    driver_phone: driverPhone,
                    vehicle_number: vehicleNumber,
                    vehicle_id: vehicleId,
                    container_number: containerNumber,
                    seal_number: sealNumber,
                    container_type: containerType,
                    special_notes: specialNotes,
                }),
            });
            const data = await res.json();
            if (data.trip) {
                stopGPS();
                setActiveTrip(null);
                setTripStatus(null);
                setSendCount(0);
                setLastCoords(null);
                // 기록 새로고침
                fetchHistory();
            }
        } catch (e) {
            alert('오류: ' + e.message);
        }
    };

    // 기록 삭제
    const handleDeleteTrip = async (tripId) => {
        if (!confirm('이 운송 기록을 삭제하시겠습니까?')) return;
        try {
            await fetch(`/api/vehicle-tracking/trips/${tripId}`, { method: 'DELETE' });
            setHistory(prev => prev.filter(t => t.id !== tripId));
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    };

    // 사진 추가 및 업로드 (NAS)
    const handlePhotoAdd = async (e) => {
        const files = Array.from(e.target.files);
        if (photos.length + files.length > 10) {
            alert('사진은 최대 10장까지 가능합니다.');
            return;
        }

        // 프리뷰 먼저 추가
        const newPhotos = files.map(f => ({
            file: f,
            previewUrl: URL.createObjectURL(f),
            uploaded: false,
            name: f.name,
        }));
        setPhotos(prev => [...prev, ...newPhotos]);

        // 운행 중이면 즉시 서버 업로드
        if (activeTrip) {
            setUploading(true);
            try {
                const formData = new FormData();
                formData.append('trip_id', activeTrip.id);
                files.forEach(f => formData.append('photos', f));

                const res = await fetch('/api/vehicle-tracking/photos', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();
                if (data.photos) {
                    // 서버 응답으로 사진 목록 갱신
                    setPhotos(data.photos.map(p => ({
                        previewUrl: p.url,
                        uploaded: true,
                        url: p.url,
                        key: p.key,
                        name: p.name,
                    })));
                } else {
                    alert(data.error || '사진 업로드 실패');
                }
            } catch (err) {
                console.error('사진 업로드 오류:', err);
                alert('사진 업로드 중 오류가 발생했습니다.');
            } finally {
                setUploading(false);
            }
        }
    };

    // 사진 삭제
    const handlePhotoRemove = (index) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    // 월 네비게이션
    const changeMonth = (direction) => {
        const [y, m] = historyMonth.split('-').map(Number);
        let newM = m + direction;
        let newY = y;
        if (newM > 12) { newM = 1; newY++; }
        if (newM < 1) { newM = 12; newY--; }
        setHistoryMonth(`${newY}-${String(newM).padStart(2, '0')}`);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const isActive = tripStatus === 'driving' || tripStatus === 'paused';
    const isDriving = tripStatus === 'driving'; // 운행 중에만 입력 잠금 (일시정지 시 수정 가능)

    return (
        <div className={styles.driverPage}>
            {/* 개발 중 배너 */}
            <div className={styles.devBanner}>
                🚧 차량위치관제 시스템은 현재 개발 중입니다. 일부 기능이 제한될 수 있습니다.
            </div>

            {/* GPS 상태 인디케이터 */}
            <div className={styles.gpsBar}>
                <span>
                    <span className={`${styles.gpsDot} ${gpsActive ? styles.gpsDotActive : styles.gpsDotInactive}`} />
                    GPS {gpsActive ? '활성' : '대기'}
                </span>
                {lastCoords && (
                    <span>
                        📍 {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}
                    </span>
                )}
                {sendCount > 0 && <span>전송 {sendCount}회</span>}
            </div>

            {/* 운행 중 상태 표시 */}
            {isActive && (
                <div className={tripStatus === 'driving' ? styles.activeStatus : styles.pausedStatus}>
                    <div className={tripStatus === 'driving' ? styles.activeStatusTitle : styles.pausedStatusTitle}>
                        {tripStatus === 'driving' ? '🟢 운행 중' : '🟡 일시정지'}
                    </div>
                    <div className={styles.activeStatusSub}>
                        {activeTrip?.vehicle_number} · {activeTrip?.container_number || '컨테이너 미입력'}
                    </div>
                </div>
            )}

            {/* 입력 폼 */}
            <div className={styles.formSection}>
                <div className={styles.formTitle}>🚛 운행 정보</div>
                <div className={styles.formGrid}>
                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>차량번호 *</label>
                            <input
                                className={styles.formInput}
                                placeholder="충남11바1234"
                                value={vehicleNumber}
                                onChange={e => setVehicleNumber(e.target.value)}
                                disabled={isDriving}
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>차량아이디</label>
                            <input
                                className={styles.formInput}
                                placeholder="ABCD1234"
                                value={vehicleId}
                                onChange={e => setVehicleId(e.target.value.toUpperCase())}
                                disabled={isDriving}
                                maxLength={8}
                                style={{ textTransform: 'uppercase', letterSpacing: '1px' }}
                            />
                        </div>
                    </div>

                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>이름 *</label>
                            <input
                                className={styles.formInput}
                                placeholder="홍길동"
                                value={driverName}
                                onChange={e => setDriverName(e.target.value)}
                                disabled={isDriving}
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>전화번호</label>
                            <input
                                className={styles.formInput}
                                placeholder="010-0000-0000"
                                value={driverPhone}
                                onChange={e => setDriverPhone(e.target.value)}
                                disabled={isDriving}
                                type="tel"
                            />
                        </div>
                    </div>

                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>컨테이너 넘버</label>
                            <input
                                className={styles.formInput}
                                placeholder="CAIU1234567"
                                value={containerNumber}
                                onChange={e => setContainerNumber(e.target.value)}
                                disabled={isDriving}
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>씰넘버</label>
                            <input
                                className={styles.formInput}
                                placeholder="ABC1234"
                                value={sealNumber}
                                onChange={e => setSealNumber(e.target.value)}
                                disabled={isDriving}
                            />
                        </div>
                    </div>

                    <div className={styles.formRow2col}>
                        <div className={styles.formRow}>
                            <label className={styles.formLabel}>타입</label>
                            <select
                                className={styles.formSelect}
                                value={containerType}
                                onChange={e => setContainerType(e.target.value)}
                                disabled={isDriving}
                            >
                                {CONTAINER_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <label className={styles.formLabel}>특이사항</label>
                        <textarea
                            className={styles.formTextarea}
                            placeholder="리퍼, 위험물 등 추가 메모"
                            value={specialNotes}
                            onChange={e => setSpecialNotes(e.target.value)}
                            disabled={isDriving}
                        />
                    </div>

                    <div className={styles.photoSection}>
                        <label className={styles.formLabel}>📷 사진 첨부 {uploading && '(업로드 중...)'}</label>
                        <div className={styles.photoGrid}>
                            {photos.map((p, i) => (
                                <div key={i} style={{ position: 'relative' }}>
                                    <img src={p.previewUrl} alt="" className={styles.photoThumb} />
                                    {!p.uploaded && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(245,158,11,0.9)', color: '#fff', fontSize: '0.6rem', textAlign: 'center', borderRadius: '0 0 6px 6px' }}>대기</div>}
                                    <button onClick={() => handlePhotoRemove(i)} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                </div>
                            ))}
                            {photos.length < 10 && (
                                <label className={styles.photoAddBtn}>
                                    {uploading ? '⏳' : '+'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        hidden
                                        onChange={handlePhotoAdd}
                                        disabled={uploading}
                                    />
                                </label>
                            )}
                        </div>
                        <div className={styles.photoCount}>
                            {photos.length}/10장
                            {photos.filter(p => p.uploaded).length > 0 && ` (${photos.filter(p => p.uploaded).length}장 업로드 완료)`}
                        </div>
                    </div>
                </div>
            </div>

            {/* 액션 버튼 */}
            <div className={styles.actionSection}>
                {!isActive ? (
                    <button
                        className={styles.startBtn}
                        onClick={handleStart}
                        disabled={!vehicleNumber.trim() || !driverName.trim()}
                    >
                        ▶ 운행 시작
                    </button>
                ) : (
                    <>
                        <div className={styles.actionRow}>
                            {tripStatus === 'driving' ? (
                                <button className={styles.pauseBtn} onClick={handlePause}>⏸ 일시중지</button>
                            ) : (
                                <button className={styles.resumeBtn} onClick={handleResume}>▶ 운행재개</button>
                            )}
                            <button className={styles.stopBtn} onClick={handleStop}>⏹ 운행종료</button>
                        </div>
                    </>
                )}
            </div>

            {/* 나의 운송기록 */}
            <div className={styles.historySection}>
                <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>📋 나의 운송기록</div>
                    <div className={styles.monthNav}>
                        <button className={styles.monthBtn} onClick={() => changeMonth(-1)}>◀</button>
                        <span className={styles.monthLabel}>
                            {historyMonth.replace('-', '년 ')}월
                        </span>
                        <button className={styles.monthBtn} onClick={() => changeMonth(1)}>▶</button>
                    </div>
                </div>

                <div className={styles.historyList}>
                    {history.length === 0 ? (
                        <div className={styles.historyEmpty}>이 달의 운송 기록이 없습니다.</div>
                    ) : (
                        history.map(trip => (
                            <div key={trip.id} className={styles.historyCard}>
                                <div className={styles.historyInfo}>
                                    <div className={styles.historyDate}>{formatDate(trip.started_at)}</div>
                                    <div className={styles.historyContainer}>
                                        {trip.container_number || trip.vehicle_number} ({trip.container_type})
                                    </div>
                                    <div className={styles.historyMeta}>
                                        {trip.special_notes && <span style={{ color: '#ef4444' }}>⚠️ {trip.special_notes} · </span>}
                                        {formatTime(trip.started_at)} ~ {formatTime(trip.completed_at)}
                                    </div>
                                </div>
                                <button
                                    className={styles.historyDeleteBtn}
                                    onClick={() => handleDeleteTrip(trip.id)}
                                    title="삭제"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
