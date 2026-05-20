import { cookies } from 'next/headers';

import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
    EVENT_AUDIENCE_ALL,
    EVENT_REMINDER_OFFSETS,
    addDays,
    eventMatchesRole,
    getDueReminderOffset,
    getKstDateString,
    getMonthRange,
    normalizeAudienceRoles,
    sanitizeReminderOffsets,
    sortEventsForCalendar,
} from '@/utils/intranetEvents.mjs';
import { ROLE_LABELS } from '@/utils/roles';

const MANAGER_ROLES = new Set(['admin', 'headquarters']);
const ROLE_KEYS = Object.keys(ROLE_LABELS).filter((role) => role !== 'visitor');
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ApiError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export function canManageEvents(context) {
    return MANAGER_ROLES.has(context?.role);
}

export function getEventAudienceOptions() {
    return [
        { value: EVENT_AUDIENCE_ALL, label: '전체' },
        ...ROLE_KEYS.map((role) => ({ value: role, label: ROLE_LABELS[role] || role })),
    ];
}

function isDebugCookieEnabled() {
    try {
        const cookieStore = cookies();
        return cookieStore.get('__debug_mode')?.value === 'true';
    } catch {
        return false;
    }
}

export async function getEventAuthContext() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const debugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true'
        || process.env.DEBUG_MODE === 'true'
        || isDebugCookieEnabled();

    const currentUser = user || (debugMode ? {
        id: 'debug-admin-id',
        email: 'debug_admin@elssolution.com',
    } : null);

    if (!currentUser) throw new ApiError('Unauthorized', 401);

    const adminSupabase = await createAdminClient();
    const { data: roleData } = await adminSupabase
        .from('user_roles')
        .select('role, name, can_write')
        .eq('email', currentUser.email)
        .single();

    const role = debugMode && currentUser.email === 'debug_admin@elssolution.com'
        ? 'admin'
        : (roleData?.role || 'visitor');

    return {
        user: currentUser,
        role,
        roleData: roleData || null,
        adminSupabase,
    };
}

function normalizeTime(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!TIME_RE.test(text)) throw new ApiError('시간은 HH:mm 형식으로 입력해 주세요.');
    return text;
}

function normalizeEventDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new ApiError('행사일자를 YYYY-MM-DD 형식으로 입력해 주세요.');
    }
    return text;
}

function normalizeTitle(value) {
    const title = String(value || '').trim();
    if (!title) throw new ApiError('행사 제목을 입력해 주세요.');
    if (title.length > 120) throw new ApiError('행사 제목은 120자 이내로 입력해 주세요.');
    return title;
}

function normalizeText(value, maxLength) {
    const text = String(value || '').trim();
    if (text.length > maxLength) throw new ApiError(`${maxLength}자 이내로 입력해 주세요.`);
    return text || null;
}

export function normalizeEventPayload(body, context) {
    const canManage = canManageEvents(context);
    if (!canManage) throw new ApiError('행사일정 등록 권한이 없습니다.', 403);

    const audienceRoles = normalizeAudienceRoles(body.audience_roles);
    const validAudience = audienceRoles.every((role) => role === EVENT_AUDIENCE_ALL || ROLE_KEYS.includes(role));
    if (!validAudience) throw new ApiError('공지범위에 사용할 수 없는 소속이 포함되어 있습니다.');

    return {
        title: normalizeTitle(body.title),
        description: normalizeText(body.description, 1000),
        event_date: normalizeEventDate(body.event_date),
        start_time: normalizeTime(body.start_time),
        end_time: normalizeTime(body.end_time),
        location: normalizeText(body.location, 120),
        audience_roles: audienceRoles,
        reminder_offsets: sanitizeReminderOffsets(body.reminder_offsets),
        is_active: body.is_active !== false,
    };
}

export function filterEventsForRole(events, context) {
    if (canManageEvents(context)) return sortEventsForCalendar(events);
    return sortEventsForCalendar((events || []).filter((event) => eventMatchesRole(event, context.role)));
}

export async function fetchEventsForMonth(context, month) {
    const { start, end } = getMonthRange(month);
    const { data, error } = await context.adminSupabase
        .from('intranet_events')
        .select('*')
        .eq('is_active', true)
        .gte('event_date', start)
        .lte('event_date', end)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw new ApiError(error.message, 500);
    return filterEventsForRole(data || [], context);
}

export async function fetchDueEventReminders(context) {
    const today = getKstDateString();
    const until = addDays(today, Math.max(...EVENT_REMINDER_OFFSETS));

    const { data, error } = await context.adminSupabase
        .from('intranet_events')
        .select('*')
        .eq('is_active', true)
        .gte('event_date', today)
        .lte('event_date', until)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw new ApiError(error.message, 500);

    const matched = filterEventsForRole(data || [], context)
        .map((event) => ({
            ...event,
            reminder_offset: getDueReminderOffset(event.event_date, today, event.reminder_offsets),
        }))
        .filter((event) => event.reminder_offset !== null);

    if (matched.length === 0) return [];

    const eventIds = matched.map((event) => event.id);
    const { data: dismissals, error: dismissalError } = await context.adminSupabase
        .from('intranet_event_dismissals')
        .select('event_id, reminder_offset')
        .eq('user_id', context.user.id)
        .in('event_id', eventIds);

    if (dismissalError) throw new ApiError(dismissalError.message, 500);

    const dismissedKeys = new Set((dismissals || []).map((item) => `${item.event_id}:${item.reminder_offset}`));
    return matched.filter((event) => !dismissedKeys.has(`${event.id}:${event.reminder_offset}`));
}

export async function upsertEventDismissals(context, items) {
    const rows = (Array.isArray(items) ? items : [])
        .map((item) => ({
            event_id: item.event_id || item.eventId,
            reminder_offset: Number(item.reminder_offset ?? item.reminderOffset),
            user_id: context.user.id,
            user_email: context.user.email,
            dismissed_at: new Date().toISOString(),
        }))
        .filter((item) => item.event_id && EVENT_REMINDER_OFFSETS.includes(item.reminder_offset));

    if (rows.length === 0) return [];

    const { data, error } = await context.adminSupabase
        .from('intranet_event_dismissals')
        .upsert(rows, { onConflict: 'event_id,user_id,reminder_offset' })
        .select();

    if (error) throw new ApiError(error.message, 500);
    return data || [];
}
