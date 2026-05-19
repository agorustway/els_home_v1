import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { detectStaleReplayLocation, sanitizeRecordedAt, shouldAcceptLocation, shouldStoreLocation } from '@/utils/vehicleLocation.mjs';

/**
 * POST /api/vehicle-tracking/location
 * GPS 위치 전송 (운전원 스마트폰에서 주기적으로 호출)
 */
export async function POST(request) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { trip_id, lat, lng, accuracy, speed, method = 'GPS', source, marker_type, gyro, recorded_at } = body;

        if (!trip_id || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'trip_id, lat, lng는 필수입니다.' }, { status: 400 });
        }

        let address = null;

        // 운행 상태 확인 (이미 종료된 경우 기록 안함)
        const { data: trip } = await supabase.from('vehicle_trips').select('status').eq('id', trip_id).single();
        if (!trip || trip.status === 'completed') {
            return NextResponse.json({ error: '운행 중이 아닙니다.' }, { status: 400 });
        }

        const speedNum = Number(speed || 0);
        const sourceText = String(source || '');
        const markerType = String(marker_type || '').toUpperCase();
        const isTripEndMarker = markerType === 'TRIP_END';
        const isTripEndFallback = isTripEndMarker && Number(accuracy || 0) >= 9000;
        const forceAccept = source === 'native_forced'
            || isTripEndFallback
            || (Boolean(marker_type) && !isTripEndMarker);
        const forceStore = Boolean(marker_type) || source === 'native_forced';
        const speedKmh = sourceText.startsWith('native')
            || sourceText === 'standalone_app'
            || sourceText === 'map_foreground'
            || sourceText === 'app_foreground'
            || sourceText === 'webview_kmh'
            ? speedNum
            : (speedNum > 80 ? speedNum : speedNum * 3.6);
        const recordedAt = sanitizeRecordedAt(recorded_at);

        const { data: previousLocations } = await supabase
            .from('vehicle_locations')
            .select('lat,lng,accuracy,speed,address,recorded_at,method')
            .eq('trip_id', trip_id)
            .order('recorded_at', { ascending: false })
            .limit(8);

        const latestLocation = previousLocations?.[0] || null;
        const olderLocation = previousLocations?.[1] || null;
        const resolvedMethod = markerType || source || method;
        const currentPoint = { lat, lng, accuracy, speed: speedKmh, recorded_at: recordedAt, marker_type, method: resolvedMethod, source };
        let previousForDecision = latestLocation;

        if (!marker_type) {
            const replayDecision = detectStaleReplayLocation({
                current: currentPoint,
                latest: latestLocation,
                history: previousLocations || [],
            });
            if (!replayDecision.ok) {
                return NextResponse.json({
                    skipped: true,
                    reason: replayDecision.reason,
                    address: latestLocation?.address || null,
                }, {
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
        }

        // 이미 저장된 직전 점이 튀었다가 현재 점이 원래 경로로 복귀한 상황이면,
        // 현재 정상점을 버리지 않도록 그 이전 점을 기준으로 판정한다.
        if (!marker_type && latestLocation && olderLocation) {
            const latestDecision = shouldAcceptLocation({
                current: latestLocation,
                previous: olderLocation,
                next: currentPoint,
            });
            if (!latestDecision.ok && latestDecision.reason === 'spike_return') {
                previousForDecision = olderLocation;
            }
        }

        const decision = shouldAcceptLocation({
            current: currentPoint,
            previous: previousForDecision,
            // TRIP_END는 터널/지하 캐시 GPS가 들어오기 쉬워 품질 필터를 통과한 경우만 저장한다.
            // 단, 앱의 마지막 안정 위치 fallback(accuracy 9999)과 native_forced는 명시적으로 허용한다.
            forced: forceAccept,
        });

        if (!decision.ok) {
            return NextResponse.json({
                skipped: true,
                reason: decision.reason,
                address: latestLocation?.address || null,
            }, {
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        const fastMode = sourceText === 'map_foreground'
            || sourceText === 'realtime_tracking'
            || body.realtime === true;
        const storeDecision = shouldStoreLocation({
            current: currentPoint,
            previous: previousForDecision,
            forced: forceStore,
            fastMode,
        });
        if (!storeDecision.ok) {
            return NextResponse.json({
                skipped: true,
                reason: storeDecision.reason,
                address: latestLocation?.address || null,
            }, {
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // 역지오코딩은 저장할 포인트에만 수행해 API/서버 부하를 줄인다.
        try {
            const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
            if (kakaoKey) {
                const kakaoRes = await fetch(
                    `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
                    {
                        headers: { 'Authorization': `KakaoAK ${kakaoKey}` },
                        signal: AbortSignal.timeout(3000),
                    }
                );
                const kakaoData = await kakaoRes.json();
                const doc = kakaoData?.documents?.[0];
                if (doc?.address) {
                    address = doc.address.address_name;
                } else if (doc?.road_address) {
                    address = doc.road_address.address_name;
                }
            }
        } catch (e) { console.error('[location] 카카오 geocode 오류:', e.message); }

        const insertPayload = {
            trip_id,
            lat,
            lng,
            accuracy: accuracy || null,
            speed: Number.isFinite(speedKmh) ? Math.max(0, Math.min(speedKmh, 160)) : null,
            method: resolvedMethod,
            address,
            // 일부 운영 DB에는 marker_type/gyro 컬럼이 아직 없을 수 있어 실패 시 아래에서 재시도한다.
            ...(marker_type ? { marker_type } : {}),
            ...(gyro !== undefined ? { gyro } : {}),
            recorded_at: recordedAt,
        };

        let { data, error } = await supabase
            .from('vehicle_locations')
            .insert([insertPayload])
            .select()
            .single();

        if (error && (error.code === '42703' || /marker_type|gyro|schema cache/i.test(error.message || ''))) {
            const fallbackPayload = { ...insertPayload };
            delete fallbackPayload.marker_type;
            delete fallbackPayload.gyro;
            const retry = await supabase
                .from('vehicle_locations')
                .insert([fallbackPayload])
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        return NextResponse.json({ location: data, address }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** 주소 축약 (서울특별시 강남구 역삼동 → 서울 강남 역삼) */
function abbreviateAddr(full) {
    if (!full) return '';
    return full
        .split(' ')
        .map(s => s
            .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
            .replace(/(도|시|구|동|읍|면|리)$/g, '')
        )
        .filter(s => s.trim().length > 0)
        .join(' ')
        .trim();
}
