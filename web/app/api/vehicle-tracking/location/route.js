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
        const { trip_id, lat, lng, accuracy, speed } = body;

        if (!trip_id || lat === undefined || lng === undefined) {
            return NextResponse.json({ error: 'trip_id, lat, lng는 필수입니다.' }, { status: 400 });
        }

        // 운행 상태가 driving/paused인지 확인
        const { data: trip } = await supabase
            .from('vehicle_trips')
            .select('status, user_id')
            .eq('id', trip_id)
            .single();

        if (!trip) {
            return NextResponse.json({ error: '운행 기록을 찾을 수 없습니다.' }, { status: 404 });
        }

        if (trip.status === 'completed') {
            return NextResponse.json({ error: '이미 종료된 운행입니다.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('vehicle_locations')
            .insert([{
                trip_id,
                lat,
                lng,
                accuracy: accuracy || null,
                speed: speed || null,
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
