'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 전역 좌표 및 위치 정보를 관리하는 훅
 * 브라우저의 Geolocation API를 사용하여 좌표를 가져옵니다.
 */
export function useGeolocation() {
    const [coords, setCoords] = useState(null); // { lat: number, lon: number }
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'granted', 'denied', 'prompt'

    // 위치 갱신 함수
    const refreshLocation = useCallback((forcePrompt = false) => {
        if (!navigator.geolocation) {
            setError('이 브라우저는 위치 정보를 지원하지 않습니다.');
            return;
        }

        if (permissionStatus === 'denied') {
            alert('위치 정보 권한이 거부되어 있습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.');
            return;
        }

        setLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const newCoords = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                setCoords(newCoords);
                setLoading(false);
                setError(null);

                // 로컬 스토리지에 캐시 (좌표가 자주 변하지만, 아예 없는 것보다는 캐시된 값을 먼저 보여주는 게 UX에 좋음)
                localStorage.setItem('els_last_coords', JSON.stringify({
                    ...newCoords,
                    timestamp: Date.now()
                }));
            },
            (err) => {
                setError(err.message);
                setLoading(false);
                console.warn('Geolocation error:', err);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000 // 1분 이내의 캐시 데이터 허용
            }
        );
    }, []);

    // 권한 상태 모니터링
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then((status) => {
                setPermissionStatus(status.state);
                status.onchange = () => {
                    setPermissionStatus(status.state);
                };
            });
        }

        // 캐시된 좌표 불러오기
        const cached = localStorage.getItem('els_last_coords');
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // 1시간 이내의 데이터만 유효한 것으로 간주
                if (Date.now() - parsed.timestamp < 3600000) {
                    setCoords({ lat: parsed.lat, lon: parsed.lon });
                }
            } catch (e) { }
        }
    }, []);

    return { coords, loading, error, permissionStatus, refreshLocation };
}
