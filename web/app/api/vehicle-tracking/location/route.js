import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

/**
 * POST /api/vehicle-tracking/location
 * GPS 위치 전송 (운전원 스마트폰에서 주기적으로 호출)
 */
export async function POST(request) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { trip_id, lat, lng, accuracy, speed, method = 'GPS', source } = body;

        if (!trip_id || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'trip_id, lat, lng는 필수입니다.' }, { status: 400 });
        }

        // 역지오코딩 (카카오 Coord2Address API)
        let address = null;

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

        // 운행 상태 확인 (이미 종료된 경우 기록 안함)
        const { data: trip } = await supabase.from('vehicle_trips').select('status').eq('id', trip_id).single();
        if (!trip || trip.status === 'completed') {
            return NextResponse.json({ error: '운행 중이 아닙니다.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('vehicle_locations')
            .insert([{
                trip_id,
                lat,
                lng,
                accuracy: accuracy || null,
                speed: speed || null,
                method: source || method,
                address,
                recorded_at: new Date().toISOString(),
            }])
            .select()
            .single();

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
