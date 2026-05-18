import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isMissingTableError(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205';
}

function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || null;
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const metadata = { ...(body.metadata || {}) };
        const sessionClient = await createClient();
        const { data: { user } } = await sessionClient.auth.getUser();
        const adminSupabase = await createAdminClient();
        const clientIp = getClientIp(request);
        const rawUserId = user?.id || metadata.user_id || null;
        const userId = isUuid(rawUserId) ? rawUserId : null;

        if (rawUserId && !metadata.user_id) metadata.user_id = rawUserId;
        if (clientIp && !metadata.ip) metadata.ip = clientIp;

        const userEmail = user?.email || body.user_email || body.email || 'anonymous';
        const logEntry = {
            user_id: userId,
            user_email: userEmail === 'anonymous' && clientIp ? `anonymous (${clientIp})` : userEmail,
            action_type: body.action_type || body.type || 'PAGE_VIEW',
            path: body.path || '/',
            metadata,
            ip_address: clientIp,
        };

        const { error } = await adminSupabase.from('user_activity_logs').insert(logEntry);
        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json({ ok: false, info: 'LOG_TABLE_MISSING' }, { status: 202 });
            }
            throw error;
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[ActivityLogger] Failed to store log:', error);
        return NextResponse.json({ ok: false }, { status: 202 });
    }
}
