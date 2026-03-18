import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
 * PATCH /api/vehicle-tracking/trips/[id]
 * 상태 변경: pause, resume, complete + 사진/메모 업데이트
 */
export async function PATCH(request, { params }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const { action, photos, special_notes, container_number, seal_number, container_type, vehicle_id, driver_name, driver_phone, vehicle_number } = body;

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
        // 본인 확인
        const { data: trip } = await supabase
            .from('vehicle_trips')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!trip || trip.user_id !== user.id) {
            return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
        }

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
