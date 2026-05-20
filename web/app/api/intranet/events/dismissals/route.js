import { NextResponse } from 'next/server';

import {
    ApiError,
    getEventAuthContext,
    upsertEventDismissals,
} from '@/lib/intranet-events-server';

export const dynamic = 'force-dynamic';

function jsonError(error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error.message || '행사일정 알림 숨김 처리 중 오류가 발생했습니다.' }, { status });
}

export async function POST(request) {
    try {
        const context = await getEventAuthContext();
        const body = await request.json();
        const items = body.items || (body.event_id || body.eventId ? [body] : []);
        const dismissals = await upsertEventDismissals(context, items);

        return NextResponse.json({ ok: true, dismissals });
    } catch (error) {
        console.error('POST /api/intranet/events/dismissals Error:', error);
        return jsonError(error);
    }
}
