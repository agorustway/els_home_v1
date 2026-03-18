import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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
        const { action, photos, special_notes, container_number, seal_number, container_type } = body;

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

        const { data, error } = await supabase
            .from('vehicle_trips')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
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
