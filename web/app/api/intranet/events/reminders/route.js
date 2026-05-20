import { NextResponse } from 'next/server';

import {
    ApiError,
    fetchDueEventReminders,
    getEventAuthContext,
} from '@/lib/intranet-events-server';
import { getKstDateString } from '@/utils/intranetEvents.mjs';

export const dynamic = 'force-dynamic';

function jsonError(error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error.message || '행사일정 알림 조회 중 오류가 발생했습니다.' }, { status });
}

export async function GET() {
    try {
        const context = await getEventAuthContext();
        const reminders = await fetchDueEventReminders(context);

        return NextResponse.json({
            reminders,
            today: getKstDateString(),
            role: context.role,
        });
    } catch (error) {
        console.error('GET /api/intranet/events/reminders Error:', error);
        return jsonError(error);
    }
}
