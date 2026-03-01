'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './NaverMapRouteSearch.module.css';

const DEFAULT_ORIGIN = "아산시 인주면";
const DEFAULT_DESTINATION = "부산신항만컨테이너터미널";
const DEFAULT_MAP_CENTER = [127.8, 36.5]; // 대한민국 중심 근처
const DEFAULT_MAP_ZOOM = 7;

import { useGeolocation } from '@/hooks/useGeolocation';

export default function NaverMapRouteSearch() {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const { coords, loading: geoLoading } = useGeolocation();
    const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
    const [destination, setDestination] = useState(DEFAULT_DESTINATION);
    const [loading, setLoading] = useState(false);
    const [mapLoadingStatus, setMapLoadingStatus] = useState("지도 데이터를 불러오는 중...");
    const [mapError, setMapError] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const [distanceKm, setDistanceKm] = useState(null);
    const [fuelCost, setFuelCost] = useState(null);
    const [originAddress, setOriginAddress] = useState({ road: null, jibun: null });
    const [destinationAddress, setDestinationAddress] = useState({ road: null, jibun: null });

    // 좌표가 감지되면 출발지 자동 설정
    useEffect(() => {
        if (coords) {
            const fetchOriginFromCoords = async () => {
                try {
                    const res = await fetch(`/api/naver-maps/reverse-geocode?coords=${coords.lng || coords.lon},${coords.lat}`);
                    const data = await res.json();
                    if (res.ok && data.status.code === 0) {
                        const roadAddr = data.results.find(r => r.name === 'roadaddr');
                        const jibunAddr = data.results.find(r => r.name === 'jibunaddr');
                        const addr = roadAddr ? roadAddr.land.name : (jibunAddr ? jibunAddr.land.name : '');
                        if (addr) setOrigin(addr);
                    }
                } catch (e) {
                    console.error('Failed to set origin from coords:', e);
                }
            };
            fetchOriginFromCoords();
        }
    }, [coords]);

    // Naver Map Script Loader (Network.js에서 재사용)
    useEffect(() => {
        // 1. 방어 코드: 이미 로드되었으면 초기화만 시도
        if (window.naver && window.naver.maps) {
            initMap();
            return;
        }

        // 2. 인증 실패 콜백 정의
        window.navermap_authFailure = () => {
            const currentUrl = window.location.origin;
            setMapLoadingStatus(`네이버 지도 인증 실패 (설정 필요)`);
            setMapError(true);
            console.error(`[Naver Map Auth Error] NCP Console에 다음 URL을 등록해야 합니다: ${currentUrl}`);
            alert(`네이버 지도 인증 실패: ${currentUrl}을(를) NCP 콘솔에 등록해야 합니다.`);
        };

        // 3. 스크립트 중복 방지 (id 변경)
        const scriptId = 'naver-map-script-route-search';
        const existingScript = document.getElementById(scriptId);
        if (existingScript) return;

        // 4. 수동 스크립트 주입 (Geocoding 모듈 추가)
        const script = document.createElement('script');
        script.id = scriptId;
        // NEXT_PUBLIC_NAVER_MAP_CLIENT_ID는 클라이언트 측에서만 사용 가능
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}&submodules=geocoder`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            setMapLoadingStatus("지도 라이브러리 로드 완료! 초기화 중...");
            setTimeout(() => initMap(), 100);
        };

        script.onerror = () => {
            setMapLoadingStatus("네이버 지도 서버 접속 실패");
            setMapError(true);
        };

        document.head.appendChild(script);

        return () => {
            // cleanup if needed (e.g., remove script)
        };
    }, []);

    const initMap = () => {
        if (!mapRef.current || mapInstance.current) return;
        if (!window.naver || !window.naver.maps) {
            setTimeout(initMap, 200); // 재시도
            return;
        }

        try {
            const naver = window.naver;
            const mapOptions = {
                center: new naver.maps.LatLng(DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]),
                zoom: DEFAULT_MAP_ZOOM,
                minZoom: 6,
                zoomControl: true, // 줌 컨트롤 허용
                scrollWheel: true, // 스크롤 줌 허용
                draggable: true, // 드래그 이동 허용
                pinchZoom: true, // 핀치 줌 허용
                keyboardShortcuts: true,
                mapTypeControl: true,
                scaleControl: true,
                logoControl: true,
            };

            mapInstance.current = new naver.maps.Map(mapRef.current, mapOptions);
            setMapLoadingStatus(null); // 로딩 완료
        } catch (e) {
            console.error("Map Init Error:", e);
            setMapLoadingStatus("지도 초기화 오류 발생");
            setMapError(true);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        setSearchError(null);
        setDistanceKm(null);
        setFuelCost(null);
        setOriginAddress({ road: null, jibun: null });
        setDestinationAddress({ road: null, jibun: null });

        if (!origin || !destination) {
            setSearchError("출발지와 도착지를 모두 입력해주세요.");
            setLoading(false);
            return;
        }

        try {
            // 1. Geocode Origin
            const originGeoRes = await fetch(`/api/naver-maps/geocode?query=${encodeURIComponent(origin)}`);
            const originGeoData = await originGeoRes.json();
            if (!originGeoRes.ok || originGeoData.status !== 'OK' || !originGeoData.addresses || originGeoData.addresses.length === 0) {
                throw new Error(`출발지 주소 지오코딩 실패: ${originGeoData.errorMessage || '알 수 없는 오류'}`);
            }
            const originCoords = `${originGeoData.addresses[0].x},${originGeoData.addresses[0].y}`;
            const originLat = originGeoData.addresses[0].y;
            const originLng = originGeoData.addresses[0].x;

            // 2. Geocode Destination
            const destGeoRes = await fetch(`/api/naver-maps/geocode?query=${encodeURIComponent(destination)}`);
            const destGeoData = await destGeoRes.json();
            if (!destGeoRes.ok || destGeoData.status !== 'OK' || !destGeoData.addresses || destGeoData.addresses.length === 0) {
                throw new Error(`도착지 주소 지오코딩 실패: ${destGeoData.errorMessage || '알 수 없는 오류'}`);
            }
            const destCoords = `${destGeoData.addresses[0].x},${destGeoData.addresses[0].y}`;
            const destLat = destGeoData.addresses[0].y;
            const destLng = destGeoData.addresses[0].x;

            // 3. Get Directions
            // 네이버 Directions API는 option=trafast (교통최적), traroad (최단), trapath (무료) 등이 있습니다.
            // "거리우선"을 명시했으므로 traroad를 사용.
            const directionsRes = await fetch(`/api/naver-maps/directions?start=${originCoords}&goal=${destCoords}&option=traroad`);
            const directionsData = await directionsRes.json();

            if (!directionsRes.ok || directionsData.code !== 0 || !directionsData.routes || directionsData.routes.length === 0) {
                throw new Error(`경로 탐색 실패: ${directionsData.message || '알 수 없는 오류'}`);
            }

            const route = directionsData.routes[0];
            const summary = route.summary;
            const totalDistance = summary.distance; // meters
            const totalDuration = summary.duration; // milliseconds

            setDistanceKm((totalDistance / 1000).toFixed(1));

            // 4. Fetch Fuel Price (Diesel)
            const fuelRes = await fetch(`/api/opinet/avg-price`);
            const fuelData = await fuelRes.json();
            if (!fuelRes.ok || !fuelData.price) {
                throw new Error(`유가 정보 조회 실패: ${fuelData.error || '알 수 없는 오류'}`);
            }
            // 평균 연비 3km/l (임시값, 실제 값 적용 필요)
            const fuelEfficiency = 3;
            const dieselPricePerLiter = fuelData.price;
            const calculatedFuelCost = (totalDistance / 1000 / fuelEfficiency * dieselPricePerLiter);
            setFuelCost(calculatedFuelCost.toFixed(0));

            // 5. Reverse Geocode for Origin Address (Road + Jibun)
            const originRevGeoRes = await fetch(`/api/naver-maps/reverse-geocode?coords=${originCoords}`);
            const originRevGeoData = await originRevGeoRes.json();
            if (!originRevGeoRes.ok || originRevGeoData.status.code !== 0) {
                console.warn(`출발지 역지오코딩 실패: ${originRevGeoData.status.message}`);
            } else {
                const roadAddr = originRevGeoData.results.find(r => r.name === 'roadaddr');
                const jibunAddr = originRevGeoData.results.find(r => r.name === 'jibunaddr');
                setOriginAddress({
                    road: roadAddr ? roadAddr.land.name + (roadAddr.land.number ? `-${roadAddr.land.number}` : '') : '정보 없음',
                    jibun: jibunAddr ? jibunAddr.land.name + (jibunAddr.land.number ? `-${jibunAddr.land.number}` : '') : '정보 없음',
                });
            }

            // 6. Reverse Geocode for Destination Address (Road + Jibun)
            const destRevGeoRes = await fetch(`/api/naver-maps/reverse-geocode?coords=${destCoords}`);
            const destRevGeoData = await destRevGeoRes.json();
            if (!destRevGeoRes.ok || destRevGeoData.status.code !== 0) {
                console.warn(`도착지 역지오코딩 실패: ${destRevGeoData.status.message}`);
            } else {
                const roadAddr = destRevGeoData.results.find(r => r.name === 'roadaddr');
                const jibunAddr = destRevGeoData.results.find(r => r.name === 'jibunaddr');
                setDestinationAddress({
                    road: roadAddr ? roadAddr.land.name + (roadAddr.land.number ? `-${roadAddr.land.number}` : '') : '정보 없음',
                    jibun: jibunAddr ? jibunAddr.land.name + (jibunAddr.land.number ? `-${jibunAddr.land.number}` : '') : '정보 없음',
                });
            }


            // 지도에 경로 표시
            if (mapInstance.current && window.naver) {
                // 기존 마커 및 폴리라인 제거
                if (mapInstance.current.markers) {
                    mapInstance.current.markers.forEach(marker => marker.setMap(null));
                    mapInstance.current.markers = [];
                }
                if (mapInstance.current.polyline) {
                    mapInstance.current.polyline.setMap(null);
                }

                const path = route.path.map(p => new window.naver.maps.LatLng(p[1], p[0]));
                const polyline = new window.naver.maps.Polyline({
                    map: mapInstance.current,
                    path: path,
                    strokeColor: '#0078ff',
                    strokeWeight: 5,
                    strokeOpacity: 0.8,
                    strokeStyle: 'solid'
                });
                mapInstance.current.polyline = polyline;

                // 시작/종료 마커
                const startMarker = new window.naver.maps.Marker({
                    position: new window.naver.maps.LatLng(originLat, originLng),
                    map: mapInstance.current,
                    icon: {
                        content: `<div style="font-size:12px; font-weight:bold; color:#000; background:#fff; border:1px solid #000; padding:5px; white-space:nowrap;">출발</div>`,
                        anchor: new window.naver.maps.Point(25, 25)
                    }
                });
                const endMarker = new window.naver.maps.Marker({
                    position: new window.naver.maps.LatLng(destLat, destLng),
                    map: mapInstance.current,
                    icon: {
                        content: `<div style="font-size:12px; font-weight:bold; color:#000; background:#fff; border:1px solid #000; padding:5px; white-space:nowrap;">도착</div>`,
                        anchor: new window.naver.maps.Point(25, 25)
                    }
                });
                mapInstance.current.markers = [startMarker, endMarker];

                // 경로 전체가 보이도록 지도 뷰포트 조정
                const bounds = new window.naver.maps.LatLngBounds(path[0], path[0]);
                path.forEach(p => bounds.extend(p));
                mapInstance.current.fitBounds(bounds);
            }

        } catch (error) {
            console.error("Search Error:", error);
            setSearchError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className={styles.section}>
            <div className={styles.inputGroup}>
                <input
                    type="text"
                    placeholder="출발지 (예: 아산시 인주면)"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    disabled={loading}
                />
                <input
                    type="text"
                    placeholder="도착지 (예: 부산신항만컨테이너터미널)"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    disabled={loading}
                />
                <button onClick={handleSearch} className={styles.searchButton} disabled={loading}>
                    {loading ? '검색 중...' : '경로 조회'}
                </button>
            </div>

            {searchError && <p className={styles.errorText}>{searchError}</p>}

            <div className={styles.mapContainer}>
                <div ref={mapRef} className={styles.mapCanvas} />
                {mapLoadingStatus && (
                    <div className={styles.loadingOverlay}>
                        <div className={`${styles.spinner} ${mapError ? styles.error : ''}`} />
                        <div className={styles.loadingStatus}>
                            <p>{mapLoadingStatus}</p>
                            {mapError && (
                                <div style={{ fontSize: '0.8rem', marginTop: '10px', color: '#ff6b6b' }}>
                                    <p>지도 인증 오류가 발생했습니다.</p>
                                    <p style={{ fontWeight: 'bold', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', margin: '8px 0', cursor: 'pointer', color: '#fff' }} onClick={() => window.location.href = 'https://nollae.com'}>
                                        nollae.com 으로 이동 ➔
                                    </p>
                                    <p style={{ opacity: 0.6, fontSize: '0.7rem' }}>NCP Console URL: {typeof window !== 'undefined' ? window.location.origin : ''}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {(distanceKm !== null || fuelCost !== null || originAddress.road || destinationAddress.road) && (
                <div className={styles.resultInfo}>
                    <p>총 거리: <strong>{distanceKm ? `${distanceKm} km` : '계산 중...'}</strong></p>
                    <p>예상 유류비 (경유): <strong>{fuelCost ? `${fuelCost} 원` : '계산 중...'}</strong></p>
                    <hr style={{ margin: '10px 0', borderColor: '#e2e8f0' }} />
                    {originAddress.road && <p>출발지 (도로명): {originAddress.road}</p>}
                    {originAddress.jibun && <p>출발지 (지번): {originAddress.jibun}</p>}
                    {destinationAddress.road && <p>도착지 (도로명): {destinationAddress.road}</p>}
                    {destinationAddress.jibun && <p>도착지 (지번): {destinationAddress.jibun}</p>}
                </div>
            )}

            <div className={styles.infoNotice}>
                <p>
                    <strong>안전운임고시 적용 기준:</strong> 네이버 지도(거리우선, 차종 5종, 4축 이상, 특수화물차 적용)를 이용하여 오전 06시에 측정하는 것을 기준으로 합니다. 실제 교통 상황 및 차량 종류에 따라 차이가 발생할 수 있습니다. 예상 유류비는 전국 평균 유가 및 임시 연비를 기준으로 계산되며 참고용입니다.
                </p>
            </div>
        </section>
    );
}
