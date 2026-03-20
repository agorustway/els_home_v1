import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/vehicle-tracking/location
 * GPS 위치 전송 (운전원 스마트폰에서 주기적으로 호출)
 */
export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
        const body = await request.json();
        const { trip_id, lat, lng, accuracy, speed, method = 'GPS' } = body;

        if (!trip_id || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'trip_id, lat, lng는 필수입니다.' }, { status: 400 });
        }

        // 역지오코딩 (Naver API)
        let address = null;
        let place_name = null;

        try {
            const naverRes = await fetch(
                `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${lng},${lat}&output=json&orders=admcode,roadaddr`,
                {
                    headers: {
                        'X-NCP-APIGW-API-KEY-ID': process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,
                        'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET,
                    }
                }
            );
            const naverData = await naverRes.json();
            if (naverData.status?.code === 0 && naverData.results?.length > 0) {
                const reg = naverData.results[0].region;
                address = [reg.area1.name, reg.area2.name, reg.area3.name, reg.area4.name]
                    .map(a => a.name).filter(Boolean).join(' ');
            }
        } catch (e) { console.error('Geocode err:', e); }

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
                method,
                address,
                place_name,
                recorded_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ location: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
