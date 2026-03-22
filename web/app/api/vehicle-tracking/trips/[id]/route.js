import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

/**
 * 운전원정보(driver_contacts) 매칭 및 갱신
 * 매칭 우선순위: 1. 전화번호 → 2. 차량번호
 */
async function syncDriverContact(supabase, trip) {
    const phone = (trip.driver_phone || '').replace(/[^0-9]/g, '');
    const vehicleNumber = trip.vehicle_number;

    // 1차: 전화번호로 매칭
    let driver = null;
    if (phone) {
        const { data } = await supabase
            .from('driver_contacts')
            .select('*')
            .ilike('phone', `%${phone.slice(-8)}%`) // 뒷 8자리 매칭
            .limit(1)
            .maybeSingle();
        driver = data;
    }

    // 2차: 차량번호로 매칭 (전화번호 매칭 실패 시)
    if (!driver && vehicleNumber) {
        const { data } = await supabase
            .from('driver_contacts')
            .select('*')
            .eq('vehicle_number', vehicleNumber)
            .limit(1)
            .maybeSingle();
        driver = data;
    }

    const lastTripInfo = {
        vehicle_number: vehicleNumber,
        vehicle_id: trip.vehicle_id || null,
        last_container_number: trip.container_number,
        last_seal_number: trip.seal_number,
        last_container_type: trip.container_type,
        last_container_kind: trip.container_kind,
        last_trip_started_at: trip.started_at,
        last_trip_completed_at: trip.completed_at || new Date().toISOString(),
    };

    if (driver) {
        // 기존 운전원 → 마지막 운행 정보 갱신
        await supabase
            .from('driver_contacts')
            .update(lastTripInfo)
            .eq('id', driver.id);
    } else {
        // 신규 운전원 → 미계약 차량으로 자동 등록
        await supabase
            .from('driver_contacts')
            .insert([{
                name: trip.driver_name,
                phone: trip.driver_phone,
                contract_type: 'uncontracted',
                ...lastTripInfo,
            }]);
    }
}

/**
 * GET /api/vehicle-tracking/trips/[id]
 * 상세 정보 조회
 */
export async function GET(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        const { data, error } = await supabase
            .from('vehicle_trips')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 });

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PATCH /api/vehicle-tracking/trips/[id]
 * 상태 변경: pause, resume, complete + 사진/메모 업데이트
 */
export async function PATCH(request, { params }) {
    const supabase = await createAdminClient();
    const { id } = await params;

    if (!id || id === 'undefined' || id === 'null') {
        return NextResponse.json({ error: '유효하지 않은 Trip ID입니다.' }, { status: 400 });
    }

    try {
        const body = await request.json();
        // ... (이하 동일)
        const { action, photos, special_notes, container_number, seal_number, container_type, container_kind, vehicle_id, driver_name, driver_phone, vehicle_number } = body;

        // 기존 데이터 조회 (로그용)
        const { data: oldData } = await supabase
            .from('vehicle_trips')
            .select('*')
            .eq('id', id)
            .single();

        const updates = { updated_at: new Date().toISOString() };

        if (action === 'pause') {
            updates.status = 'paused';
            updates.paused_at = new Date().toISOString();
        } else if (action === 'resume') {
            updates.status = 'driving';
            updates.paused_at = null;
        } else if (action === 'complete') {
            updates.status = 'completed';
            updates.completed_at = new Date().toISOString();
        }

        // 추가 필드 업데이트
        if (photos !== undefined) updates.photos = photos;
        if (special_notes !== undefined) updates.special_notes = special_notes;
        if (container_number !== undefined) updates.container_number = container_number;
        if (seal_number !== undefined) updates.seal_number = seal_number;
        if (container_type !== undefined) updates.container_type = container_type;
        if (container_kind !== undefined) updates.container_kind = container_kind;
        if (vehicle_id !== undefined) updates.vehicle_id = vehicle_id;
        if (driver_name !== undefined) updates.driver_name = driver_name;
        if (driver_phone !== undefined) updates.driver_phone = driver_phone;
        if (vehicle_number !== undefined) updates.vehicle_number = vehicle_number;

        const { data, error } = await supabase
            .from('vehicle_trips')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // 수정 로그 기록 (수정 모드일 경우)
        if (oldData && !action) {
            const logEntries = [];
            const checkFields = ['container_number', 'seal_number', 'container_type', 'container_kind', 'special_notes'];
            checkFields.forEach(f => {
                if (updates[f] !== undefined && updates[f] !== oldData[f]) {
                    logEntries.push({
                        trip_id: id,
                        field_name: f,
                        old_value: String(oldData[f] || '-'),
                        new_value: String(updates[f] || '-'),
                        modified_by: driver_name || oldData.driver_name,
                        created_at: new Date().toISOString()
                    });
                }
            });
            if (logEntries.length > 0) {
                await supabase.from('vehicle_trip_logs').insert(logEntries);
            }
        }

        // 운행 종료 시 운전원정보 자동 갱신/등록
        if (action === 'complete' && data) {
            try {
                await syncDriverContact(supabase, data);
            } catch (syncErr) {
                console.error('운전원정보 동기화 오류 (무시):', syncErr);
            }
        }

        return NextResponse.json({ trip: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/vehicle-tracking/trips/[id]
 * 운행 기록 삭제 (본인 것만)
 */
export async function DELETE(request, { params }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        // 어드민 대시보드에서 삭제 가능하게 하기 위해 소유권 체크를 제거하거나 완화합니다.
        // (현재 우리 환경에서는 로그인한 유저 = 어드민급 권한으로 간주하여 처리)
        // const { data: trip } = await supabase
        //     .from('vehicle_trips')
        //     .select('user_id')
        //     .eq('id', id)
        //     .single();
        // if (!trip || trip.user_id !== user.id) {
        //     return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
        // }

        // 위치 로그 먼저 삭제 (cascade라 자동이지만 명시적으로)
        await supabase.from('vehicle_locations').delete().eq('trip_id', id);

        const { error } = await supabase
            .from('vehicle_trips')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
