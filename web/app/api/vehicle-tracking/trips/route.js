import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/vehicle-tracking/trips
 * - 쿼리: ?mode=active  → 현재 운행 중(driving/paused) 전체 (관제용)
 * - 쿼리: ?mode=my       → 본인 운행 기록 (모바일용)
 * - 쿼리: ?month=2026-03 → 월별 필터
 */
export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'active';
    const month = searchParams.get('month'); // "2026-03"

    try {
        if (mode === 'active') {
            // 관제용: 운행 중 + 일시중지 차량 전체
            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .in('status', ['driving', 'paused'])
                .order('started_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            // 각 운행의 최신 위치도 함께 가져오기
            const tripIds = data.map(t => t.id);
            let locations = [];
            if (tripIds.length > 0) {
                // 각 trip의 가장 최근 위치 1건씩
                const { data: locData, error: locError } = await supabase
                    .rpc('get_latest_vehicle_locations', { trip_ids: tripIds });

                if (!locError && locData) {
                    locations = locData;
                } else {
                    // RPC가 없으면 fallback: 각각 최신 1건 조회
                    for (const tripId of tripIds) {
                        const { data: loc } = await supabase
                            .from('vehicle_locations')
                            .select('*')
                            .eq('trip_id', tripId)
                            .order('recorded_at', { ascending: false })
                            .limit(1)
                            .single();
                        if (loc) locations.push(loc);
                    }
                }
            }

            const locationMap = {};
            locations.forEach(l => { locationMap[l.trip_id] = l; });

            const merged = data.map(trip => ({
                ...trip,
                lastLocation: locationMap[trip.id] || null,
            }));

            return NextResponse.json({ trips: merged });
        }

        if (mode === 'my') {
            // 모바일용: 본인 기록
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (month) {
                const start = `${month}-01T00:00:00+09:00`;
                const endDate = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0);
                const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59+09:00`;
                query = query.gte('created_at', start).lte('created_at', end);
            }

            const { data, error } = await query;
            if (error) throw error;

            return NextResponse.json({ trips: data });
        }

        return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/vehicle-tracking/trips
 * 운행 시작 — 새 trip 생성
 */
export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            driver_name,
            driver_phone,
            vehicle_number,
            container_number,
            seal_number,
            container_type = '40FT',
            special_notes,
        } = body;

        if (!vehicle_number || !driver_name) {
            return NextResponse.json({ error: '차량번호와 이름은 필수입니다.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('vehicle_trips')
            .insert([{
                user_id: user.id,
                user_email: user.email,
                driver_name,
                driver_phone,
                vehicle_number,
                container_number,
                seal_number,
                container_type,
                special_notes,
                status: 'driving',
                started_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ trip: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
