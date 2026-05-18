import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { displaySpeedKmh, filterRouteLocations, prepareLiveTrips } from '@/utils/vehicleLocation.mjs';

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

async function attachDriverMeta(supabase, trips = []) {
    const vehicleNumbers = [...new Set((trips || []).map(t => t.vehicle_number).filter(Boolean))];
    if (vehicleNumbers.length === 0) return trips;
    const { data: drivers } = await supabase
        .from('driver_contacts')
        .select('vehicle_number, branch, partner_company, contract_type, cargo_type, map_visibility, general_vehicle_type, general_payload, general_body_type')
        .in('vehicle_number', vehicleNumbers);
    const map = {};
    (drivers || []).forEach(d => { if (d.vehicle_number) map[d.vehicle_number] = d; });
    return trips.map(t => {
        const d = map[t.vehicle_number] || {};
        return {
            ...t,
            cargo_type: d.cargo_type || t.cargo_type || 'container',
            driver_contract_type: d.contract_type || t.driver_contract_type || 'uncontracted',
            map_visibility: d.map_visibility || 'own',
            branch: d.branch || t.branch || null,
            partner_company: d.partner_company || t.partner_company || null,
            general_vehicle_type: d.general_vehicle_type || t.general_vehicle_type || null,
            general_payload: d.general_payload || t.general_payload || null,
            general_body_type: d.general_body_type || t.general_body_type || null,
        };
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
        // ─── mode=active: 관제맵용 (조회 기준 24시간 이내의 모든 driving/paused/completed 건) ───
        if (mode === 'active') {
            // 운행 중 차량은 시작 기준, 완료 차량은 종료/갱신 기준까지 함께 본다.
            // 장거리 운행이 24시간을 넘겨도 방금 종료한 마커는 관제 지도에 남아야 한다.
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            let query = supabase
                .from('vehicle_trips')
                .select('*')
                .in('status', ['driving', 'paused', 'completed'])
                .or(`started_at.gte.${twentyFourHoursAgo},completed_at.gte.${twentyFourHoursAgo},updated_at.gte.${twentyFourHoursAgo}`)
                .order('started_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            // 각 운행의 최신 위치도 함께 가져오기. raw 최신점이 튀면 관제 지도 전체가 흔들리므로
            // 운행별 최근 경로를 보정한 뒤 마지막 정상점을 사용한다.
            const tripIds = data.map(t => t.id);
            let locations = [];
            if (tripIds.length > 0) {
                const { data: locData, error: locError } = await supabase
                    .from('vehicle_locations')
                    .select('trip_id, lat, lng, accuracy, speed, address, recorded_at')
                    .in('trip_id', tripIds)
                    .order('recorded_at', { ascending: true })
                    .limit(10000);

                if (!locError && locData) locations = locData;

                const { data: logData, error: logError } = await supabase
                    .from('vehicle_trip_logs')
                    .select('id, trip_id, field_name, new_value, modified_by, created_at')
                    .in('trip_id', tripIds)
                    .eq('field_name', 'safety_education')
                    .order('created_at', { ascending: false });
                if (!logError && logData) {
                    const logMap = {};
                    logData.forEach(log => {
                        if (!logMap[log.trip_id]) logMap[log.trip_id] = [];
                        logMap[log.trip_id].push(log);
                    });
                    data.forEach(t => { t.education_logs = logMap[t.id] || []; });
                }
            }

            const locationMap = {};
            const groupedLocations = {};
            locations.forEach(l => {
                if (!groupedLocations[l.trip_id]) groupedLocations[l.trip_id] = [];
                groupedLocations[l.trip_id].push(l);
            });
            Object.entries(groupedLocations).forEach(([tripId, list]) => {
                const clean = filterRouteLocations(list);
                locationMap[tripId] = clean[clean.length - 1] || list[list.length - 1] || null;
            });

            const enriched = await attachDriverMeta(supabase, data);
            const merged = prepareLiveTrips(enriched.map(trip => ({
                ...trip,
                lastLocation: locationMap[trip.id] || null,
                last_location_address: locationMap[trip.id]?.address || null,
            })));

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
                    .select('trip_id, lat, lng, address, recorded_at, speed')
                    .in('trip_id', tripIds)
                    .order('recorded_at', { ascending: true });
                
                if (!locError && locData) {
                    const grouped = {};
                    locData.forEach(l => {
                        if (!grouped[l.trip_id]) grouped[l.trip_id] = [];
                        grouped[l.trip_id].push(l);
                    });
                    const locMap = {};
                    const maxSpeedMap = {};
                    const speedSumMap = {};
                    const speedCountMap = {};

                    Object.entries(grouped).forEach(([tripId, list]) => {
                        const clean = filterRouteLocations(list);
                        const route = clean.length ? clean : list;
                        locMap[tripId] = route[route.length - 1] || null;
                        route.forEach(l => {
                            const speed = displaySpeedKmh(l.speed);
                            if (!maxSpeedMap[tripId] || speed > maxSpeedMap[tripId]) {
                                maxSpeedMap[tripId] = speed;
                            }
                            if (speed > 0) {
                                speedSumMap[tripId] = (speedSumMap[tripId] || 0) + speed;
                                speedCountMap[tripId] = (speedCountMap[tripId] || 0) + 1;
                            }
                        });
                    });
                    data.forEach(t => {
                        t.lastLocation = locMap[t.id] || null;
                        t.last_location_address = locMap[t.id]?.address || null;
                        t.max_speed = maxSpeedMap[t.id] ? Math.round(maxSpeedMap[t.id]) : 0;
                        t.avg_speed = speedCountMap[t.id] ? Math.round(speedSumMap[t.id] / speedCountMap[t.id]) : 0;
                    });
                }
            }

            // [v5.10.42] 운행 로그 조회: 관리자 수정 필드 추적 + 교육 이수 로그
            if (tripIds.length > 0) {
                const { data: logData, error: logError } = await supabase
                    .from('vehicle_trip_logs')
                    .select('id, trip_id, field_name, old_value, new_value, modified_by, created_at')
                    .in('trip_id', tripIds)
                    .order('created_at', { ascending: false });

                if (!logError && logData) {
                    const adminFieldsMap = {};  // trip_id → Set of admin-edited field names
                    const eduLogsMap = {};       // trip_id → education logs array
                    logData.forEach(log => {
                        // 관리자 수정 필드 감지 (modified_by에 |admin 포함)
                        if (log.modified_by && log.modified_by.includes('|admin')) {
                            if (!adminFieldsMap[log.trip_id]) adminFieldsMap[log.trip_id] = new Set();
                            adminFieldsMap[log.trip_id].add(log.field_name);
                        }
                        // 교육 이수 로그
                        if (log.field_name === 'safety_education') {
                            if (!eduLogsMap[log.trip_id]) eduLogsMap[log.trip_id] = [];
                            eduLogsMap[log.trip_id].push(log);
                        }
                    });
                    data.forEach(t => {
                        t.admin_edited_fields = adminFieldsMap[t.id] ? [...adminFieldsMap[t.id]] : [];
                        t.education_logs = eduLogsMap[t.id] || [];
                    });
                }
            }

            const enriched = await attachDriverMeta(supabase, data);
            return NextResponse.json({ trips: enriched, total: enriched.length });
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
            const enriched = await attachDriverMeta(supabase, data || []);

            if (enriched && enriched.length > 0) {
                const tripIds = enriched.map(t => t.id);
                const { data: logs } = await supabase
                    .from('vehicle_trip_logs')
                    .select('trip_id, field_name')
                    .in('trip_id', tripIds)
                    .like('modified_by', '%|admin%');
                
                if (logs) {
                    const logMap = {};
                    logs.forEach(log => {
                        if (!logMap[log.trip_id]) logMap[log.trip_id] = {};
                        logMap[log.trip_id][log.field_name] = true;
                    });
                    enriched.forEach(t => {
                        t.admin_modified_fields = logMap[t.id] || {};
                    });
                }
            }

            return NextResponse.json({ trips: enriched });
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
    try {
        const supabase = await createAdminClient();
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: "JSON 파싱 실패", rawError: e.message }, {
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // [v4.9.30] 빈 Body 수신 시 400으로 반환 (200이면 클라이언트가 res.ok=true로 판단해 ID 누락 에러 발생)
        if (!body || Object.keys(body).length === 0) {
            return NextResponse.json({ error: "요청 데이터가 비어있습니다. 앱을 재시작 후 다시 시도해주세요.", received: body }, {
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        let {
            driver_name,
            driver_phone,
            vehicle_number,
            vehicle_id,
            container_number,
            seal_number,
            container_type = '40FT',
            container_kind = 'DRY',
            transport_type = '왕복',
            billing_amount = null,
            work_site = '',
            special_notes = '',
            cargo_type = 'container',
            cargo_item = '',
            cargo_order_number = '',
            cargo_weight = '',
            general_vehicle_type = null,
            general_payload = null,
            general_body_type = null,
            driver_contract_type,
        } = body;

        let driverMeta = null;
        if (vehicle_number || driver_phone) {
            let metaQuery = supabase
                .from('driver_contacts')
                .select('vehicle_number, contract_type, cargo_type, map_visibility, general_vehicle_type, general_payload, general_body_type, branch, partner_company')
                .limit(1);
            if (vehicle_number) metaQuery = metaQuery.eq('vehicle_number', vehicle_number);
            else metaQuery = metaQuery.eq('phone', String(driver_phone || '').replace(/[^0-9]/g, ''));
            const { data: metaRows } = await metaQuery;
            driverMeta = metaRows?.[0] || null;
        }
        driver_contract_type = driverMeta?.contract_type || driver_contract_type || 'uncontracted';
        cargo_type = cargo_type || driverMeta?.cargo_type || 'container';
        general_vehicle_type = general_vehicle_type || driverMeta?.general_vehicle_type || null;
        general_payload = general_payload || driverMeta?.general_payload || null;
        general_body_type = general_body_type || driverMeta?.general_body_type || null;

        // 45FT 등 DB 체크 제약조건 회피용 매핑
        const allowedTypes = ['20FT', '40FT', '40FT_HQ'];
        if (cargo_type === 'general' && !allowedTypes.includes(container_type)) {
            container_type = '40FT';
        } else if (!allowedTypes.includes(container_type)) {
            special_notes = `[원래사이즈:${container_type}] ` + special_notes;
            container_type = '40FT_HQ';
        }

        if (!vehicle_number || !driver_name) {
            return NextResponse.json({ error: '차량번호와 이름은 필수입니다.', received: body }, {
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
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
            const updatePayload = {
                container_number: container_number || undefined,
                seal_number:      seal_number || undefined,
                container_type:   container_type || undefined,
                container_kind:   container_kind || undefined,
                transport_type:   transport_type || undefined,
                billing_amount:   billing_amount ?? undefined,
                work_site:        work_site || undefined,
                special_notes:    special_notes || undefined,
                vehicle_id:       vehicle_id || undefined,
                cargo_type:       cargo_type || undefined,
                cargo_item:       cargo_item || undefined,
                cargo_order_number: cargo_order_number || undefined,
                cargo_weight:     cargo_weight || undefined,
                general_vehicle_type: general_vehicle_type || undefined,
                general_payload:  general_payload || undefined,
                general_body_type: general_body_type || undefined,
                driver_contract_type: driver_contract_type || undefined,
                chk_brake:        body.chk_brake  !== undefined ? body.chk_brake : undefined,
                chk_tire:         body.chk_tire   !== undefined ? body.chk_tire  : undefined,
                chk_lamp:         body.chk_lamp   !== undefined ? body.chk_lamp  : undefined,
                chk_cargo:        body.chk_cargo  !== undefined ? body.chk_cargo : undefined,
                chk_driver:       body.chk_driver !== undefined ? body.chk_driver : undefined,
                updated_at:       new Date().toISOString()
            };

            const { data: updatedTrip, error: updateError } = await supabase
                .from('vehicle_trips')
                .update(updatePayload)
                .eq('id', existing[0].id)
                .select()
                .single();

            const finalTrip = updatedTrip || existing[0];
            const responseData = { 
                id: finalTrip.id, 
                trip: finalTrip,
                status: finalTrip.status,
                message: '진행 중인 기존 운행 기록이 업데이트되었습니다.' 
            };
            
            return NextResponse.json(responseData, {
                status: 200,
                headers: { 
                    'Access-Control-Allow-Origin': '*' 
                }
            });
        }

        const { data: trip, error } = await supabase
            .from('vehicle_trips')
            .insert([{
                user_id: null,
                driver_name,
                driver_phone,
                vehicle_number,
                vehicle_id: vehicle_id || null,
                cargo_type,
                cargo_item: cargo_item || '',
                cargo_order_number: cargo_order_number || '',
                cargo_weight: cargo_weight || '',
                general_vehicle_type,
                general_payload,
                general_body_type,
                driver_contract_type,
                container_number: container_number || '',
                seal_number:      seal_number || '',
                container_type,
                container_kind,
                transport_type,
                billing_amount,
                work_site,
                chk_brake: body.chk_brake || false,
                chk_tire:  body.chk_tire  || false,
                chk_lamp:  body.chk_lamp  || false,
                chk_cargo: body.chk_cargo || false,
                chk_driver: body.chk_driver || false,
                status: 'driving',
                started_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ POST /api/vehicle-tracking/trips DB Error:', error);
            return NextResponse.json({ 
                error: `DB 에러: ${error.message}`, 
                debug_code: error.code,
                received: body 
            }, {
                status: 500,
                headers: { 'Access-Control-Allow-Origin': '*', 'x-debug-error': 'db' }
            });
        }
        
        if (!trip) {
            return NextResponse.json({ error: '데이터 생성 성공했으나 결과 객체(trip)가 비어있음' }, {
                status: 500,
                headers: { 'Access-Control-Allow-Origin': '*', 'x-debug-error': 'no_trip' }
            });
        }

        // [v4.9.32] 명시적 응답 보장
        const responseData = { id: trip.id, trip, status: 'ok' };
        console.log('✅ POST /api/vehicle-tracking/trips Success:', trip.id);

        return NextResponse.json(responseData, {
            status: 200,
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'x-debug-id': trip.id // 헤더로도 전송
            }
        });
    } catch (error) {
        console.error('❌ POST /api/vehicle-tracking/trips Crash:', error);
        return NextResponse.json({ error: `서버 예외: ${error.message}` }, {
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'x-debug-error': 'catch' }
        });
    }
}
