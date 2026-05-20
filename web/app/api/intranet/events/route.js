import { NextResponse } from 'next/server';

import {
    ApiError,
    canManageEvents,
    fetchEventsForMonth,
    getEventAudienceOptions,
    getEventAuthContext,
    normalizeEventPayload,
} from '@/lib/intranet-events-server';
import { getMonthRange } from '@/utils/intranetEvents.mjs';

export const dynamic = 'force-dynamic';

function jsonError(error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error.message || '행사일정 처리 중 오류가 발생했습니다.' }, { status });
}

export async function GET(request) {
    try {
        const context = await getEventAuthContext();
        const { searchParams } = new URL(request.url);
        const { month } = getMonthRange(searchParams.get('month'));
        const events = await fetchEventsForMonth(context, month);

        return NextResponse.json({
            events,
            month,
            role: context.role,
            canManage: canManageEvents(context),
            audienceOptions: getEventAudienceOptions(),
        });
    } catch (error) {
        console.error('GET /api/intranet/events Error:', error);
        return jsonError(error);
    }
}

export async function POST(request) {
    try {
        const context = await getEventAuthContext();
        const body = await request.json();
        const payload = normalizeEventPayload(body, context);

        const { data, error } = await context.adminSupabase
            .from('intranet_events')
            .insert({
                ...payload,
                created_by: context.user.id,
                created_by_email: context.user.email,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw new ApiError(error.message, 500);
        return NextResponse.json({ event: data }, { status: 201 });
    } catch (error) {
        console.error('POST /api/intranet/events Error:', error);
        return jsonError(error);
    }
}
