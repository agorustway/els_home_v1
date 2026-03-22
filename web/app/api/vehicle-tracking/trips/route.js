import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

/**
 * GET /api/vehicle-tracking/trips
 * - mode=active  → 현재 운행 중(driving/paused) + 위치 (관제 맵용)
 * - mode=all     → 전체 운행 기록 (관제 기록관리용, 검색/필터 지원)
 * - mode=my      → 본인 운행 기록 (모바일용)
 *
 * 공통 필터:
 *  ?status=driving|paused|completed
 *  ?keyword=이름/차량번호/컨테이너 검색
 *  ?month=2026-03
 *  ?from=2026-03-01&to=2026-03-18  (날짜 범위)
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'active';
    const month = searchParams.get('month');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    try {
        // ─── mode=active: 관제맵용 (운행 중 + 위치) ───
        if (mode === 'active') {
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
                const { data: locData, error: locError } = await supabase
                    .rpc('get_latest_vehicle_locations', { trip_ids: tripIds });

                if (!locError && locData) {
                    locations = locData;
                } else {
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

        // ─── mode=all: 관제 기록관리 (검색/필터) ───
        if (mode === 'all') {
            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            // 상태 필터
            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            // 날짜 범위
            if (from) query = query.gte('started_at', `${from}T00:00:00+09:00`);
            if (to) query = query.lte('started_at', `${to}T23:59:59+09:00`);

            // 월 필터
            if (month && !from && !to) {
                const start = `${month}-01T00:00:00+09:00`;
                const endDate = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0);
                const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59+09:00`;
                query = query.gte('started_at', start).lte('started_at', end);
            }

            const { data, error } = await query;
            if (error) throw error;

            // 키워드 필터 (클라이언트 측 — Supabase free tier에 full-text 없으므로)
            let filtered = data;
            if (keyword) {
                const kw = keyword.toLowerCase();
                filtered = data.filter(t =>
                    (t.driver_name || '').toLowerCase().includes(kw) ||
                    (t.vehicle_number || '').toLowerCase().includes(kw) ||
                    (t.container_number || '').toLowerCase().includes(kw)
                );
            }

            return NextResponse.json({ trips: filtered, total: filtered.length });
        }

        // ─── mode=my: 본인 기록 ───
        if (mode === 'my') {
            const { data: { user } } = await supabase.auth.getUser();
            const phone = searchParams.get('phone');
            const vNum = searchParams.get('vehicle_number');
            const statusFilter = searchParams.get('status'); // 상태 필터 추가

            let conditions = [];
            if (user) conditions.push(`user_id.eq.${user.id}`);
            if (phone) {
                const clean = phone.replace(/[^0-9]/g, '');
                conditions.push(`driver_phone.ilike.%${clean.slice(-8)}%`);
            }
            if (vNum) conditions.push(`vehicle_number.eq.${vNum}`);

            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .order('started_at', { ascending: false }); // 시작 시간 최신순 정렬

            if (conditions.length > 0) {
                query = query.or(conditions.join(','));
            } else {
                return NextResponse.json({ error: '인증 정보나 차량번호가 필요합니다.' }, { status: 401 });
            }

            if (statusFilter) {
                query = query.eq('status', statusFilter);
            }

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
    const supabase = await createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    try {
        const body = await request.json();
        const {
            driver_name,
            driver_phone,
            vehicle_number,
            vehicle_id,
            container_number,
            seal_number,
            container_type = '40FT',
            container_kind = 'DRY',
            special_notes,
        } = body;

        if (!vehicle_number || !driver_name) {
            return NextResponse.json({ error: '차량번호와 이름은 필수입니다.' }, { status: 400 });
        }

        // 중복 생성 방지: 동일 차량/기사로 이미 'driving'인 건이 있는지 확인 (시간 범위를 5분으로 확장)
        const now = new Date();
        const fiveMinAgo = new Date(now.getTime() - 300000).toISOString();
        const { data: existing } = await supabase
            .from('vehicle_trips')
            .select('id')
            .eq('vehicle_number', vehicle_number)
            .eq('driver_name', driver_name)
            .eq('status', 'driving')
            .gte('created_at', fiveMinAgo)
            .limit(1);

        if (existing && existing.length > 0) {
            return NextResponse.json({ id: existing[0].id, message: '이미 운행 중인 기록이 있어 해당 기록으로 연결합니다.' });
        }

        const { data: trip, error } = await supabase
            .from('vehicle_trips')
            .insert([{
                user_id: user?.id || null,
                driver_name,
                driver_phone,
                vehicle_number,
                vehicle_id: vehicle_id || null,
                container_number,
                seal_number,
                container_type,
                container_kind,
                special_notes,
                status: 'driving',
                started_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) throw error;
        
        return NextResponse.json({ id: trip.id, trip }, {
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
