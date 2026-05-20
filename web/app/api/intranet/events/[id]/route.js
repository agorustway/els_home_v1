import { NextResponse } from 'next/server';

import {
    ApiError,
    canManageEvents,
    getEventAuthContext,
    normalizeEventPayload,
} from '@/lib/intranet-events-server';

export const dynamic = 'force-dynamic';

function jsonError(error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error.message || '행사일정 처리 중 오류가 발생했습니다.' }, { status });
}

function requireManager(context) {
    if (!canManageEvents(context)) {
        throw new ApiError('행사일정 관리 권한이 없습니다.', 403);
    }
}

export async function PATCH(request, { params }) {
    try {
        const context = await getEventAuthContext();
        requireManager(context);
        const body = await request.json();
        const payload = normalizeEventPayload(body, context);

        const { data, error } = await context.adminSupabase
            .from('intranet_events')
            .update({
                ...payload,
                updated_at: new Date().toISOString(),
            })
            .eq('id', params.id)
            .select()
            .single();

        if (error) throw new ApiError(error.message, 500);
        return NextResponse.json({ event: data });
    } catch (error) {
        console.error('PATCH /api/intranet/events/[id] Error:', error);
        return jsonError(error);
    }
}

export async function DELETE(_request, { params }) {
    try {
        const context = await getEventAuthContext();
        requireManager(context);

        const { error } = await context.adminSupabase
            .from('intranet_events')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', params.id);

        if (error) throw new ApiError(error.message, 500);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('DELETE /api/intranet/events/[id] Error:', error);
        return jsonError(error);
    }
}
