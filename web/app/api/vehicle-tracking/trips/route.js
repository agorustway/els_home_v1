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
        // ─── mode=active: 관제맵용 (운행 중/일시정지 + '오늘' 완료 건 포함) ───
        if (mode === 'active') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const KST_OFFSET = 9 * 60 * 60 * 1000;
            const todayKstStr = new Date(today.getTime() + KST_OFFSET).toISOString().split('T')[0];

            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .or(`status.in.(driving,paused),and(status.eq.completed,started_at.gte.${todayKstStr}T00:00:00+09:00)`)
                .order('started_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            // 각 운행의 최신 위치도 함께 가져오기
            const tripIds = data.map(t => t.id);
            let locations = [];
            if (tripIds.length > 0) {
                // rpc 또는 단건 조회
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
                last_location_address: locationMap[trip.id]?.address || null,
            }));

            return NextResponse.json({ trips: merged });
        }

        // ─── mode=all: 관제 기록관리 (검색/필터) ───
        if (mode === 'all') {
            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .order('started_at', { ascending: false })
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

            // 키워드 필터 (Supabase ilike 지원 컬럼만)
            if (keyword) {
                // driver_name, vehicle_number, container_number 중 하나라도 포함
                query = query.or(`driver_name.ilike.%${keyword}%,vehicle_number.ilike.%${keyword}%,container_number.ilike.%${keyword}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            // 각 트립의 마지막 위치 주소 가져오기
            const tripIds = data.map(t => t.id);
            if (tripIds.length > 0) {
                // RPC 대신 일반 쿼리로 최신 데이터 가져오기 (메모리에서 최신값 추출)
                const { data: locData, error: locError } = await supabase
                    .from('vehicle_locations')
                    .select('trip_id, lat, lng, address, recorded_at')
                    .in('trip_id', tripIds)
                    .order('recorded_at', { ascending: false });
                
                if (!locError && locData) {
                    const locMap = {};
                    // 내림차순 정렬이므로 가장 먼저 만나는 것이 최신
                    locData.forEach(l => {
                        if (!locMap[l.trip_id]) locMap[l.trip_id] = l;
                    });
                    data.forEach(t => {
                        t.lastLocation = locMap[t.id] || null;
                        t.last_location_address = locMap[t.id]?.address || null;
                    });
                }
            }

            return NextResponse.json({ trips: data, total: data.length });
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

            const date = searchParams.get('date');
            if (date) {
                // 정확한 특정 일자 필터링
                const start = `${date}T00:00:00+09:00`;
                const end = `${date}T23:59:59+09:00`;
                query = query.gte('started_at', start).lte('started_at', end);
            } else if (month) {
                const start = `${month}-01T00:00:00+09:00`;
                const endDate = new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0);
                const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59+09:00`;
                query = query.gte('started_at', start).lte('started_at', end);
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
        let {
            driver_name,
            driver_phone,
            vehicle_number,
            vehicle_id,
            container_number,
            seal_number,
            container_type = '40FT',
            container_kind = 'DRY',
            special_notes = '',
        } = body;

        // 45FT 등 DB 체크 제약조건 회피용 매핑
        const allowedTypes = ['20FT', '40FT', '40FT_HQ'];
        if (!allowedTypes.includes(container_type)) {
            special_notes = `[원래사이즈:${container_type}] ` + special_notes;
            container_type = '40FT_HQ';
        }

        if (!vehicle_number || !driver_name) {
            return NextResponse.json({ error: '차량번호와 이름은 필수입니다.' }, { status: 400 });
        }

        // [TDD 강화] 중복 생성 원천 차단: 차량번호와 기사로 이미 진행 중(driving/paused)인 건이 있는지 전수 조사
        const { data: existing } = await supabase
            .from('vehicle_trips')
            .select('id, status')
            .eq('vehicle_number', vehicle_number)
            .eq('driver_name', driver_name)
            .in('status', ['driving', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (existing && existing.length > 0) {
            // [Fix] 이미 존재하면 새 데이터를 만들지 않고 기존 데이터를 요청 정보로 업데이트하여 반환
            // 기사님이 운행 중에 정보를 추가/변경하고 다시 '운행 시작'을 눌렀을 때를 대비
            const updatePayload = {
                container_number: container_number || undefined,
                seal_number:      seal_number || undefined,
                container_type:   container_type || undefined,
                container_kind:   container_kind || undefined,
                special_notes:    special_notes || undefined,
                vehicle_id:       vehicle_id || undefined,
                updated_at:       new Date().toISOString()
            };

            // 만약 새로 점검 결과가 넘어왔다면 업데이트
            if (body.chk_brake !== undefined) updatePayload.chk_brake = body.chk_brake;
            if (body.chk_tire !== undefined) updatePayload.chk_tire = body.chk_tire;
            if (body.chk_lamp !== undefined) updatePayload.chk_lamp = body.chk_lamp;
            if (body.chk_cargo !== undefined) updatePayload.chk_cargo = body.chk_cargo;
            if (body.chk_driver !== undefined) updatePayload.chk_driver = body.chk_driver;

            const { data: updatedTrip, error: updateError } = await supabase
                .from('vehicle_trips')
                .update(updatePayload)
                .eq('id', existing[0].id)
                .select()
                .single();

            return NextResponse.json({ 
                id: existing[0].id, 
                trip: updatedTrip || existing[0],
                status: existing[0].status,
                message: '진행 중인 기존 운행 기록이 업데이트되었습니다.' 
            });
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
                chk_brake: body.chk_brake || false,
                chk_tire: body.chk_tire || false,
                chk_lamp: body.chk_lamp || false,
                chk_cargo: body.chk_cargo || false,
                chk_driver: body.chk_driver || false,
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


