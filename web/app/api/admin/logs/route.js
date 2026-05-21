import { createAdminClient, createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const SEARCH_LOOKUP_LIMIT = 500;

function isMissingTableError(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205';
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
    return String(value || '').trim();
}

function collectLogIdentities(logs) {
    const emails = new Set();
    const userIds = new Set();

    for (const log of logs) {
        const email = normalizeEmail(log.user_email);
        if (email && email !== 'anonymous') {
            emails.add(email);
        }

        const userId = normalizeText(log.user_id);
        const metadataUserId = normalizeText(log.metadata?.user_id);
        if (userId) userIds.add(userId);
        if (metadataUserId) userIds.add(metadataUserId);
    }

    return {
        emails: Array.from(emails),
        userIds: Array.from(userIds),
    };
}

function rememberName(map, key, value) {
    const normalizedKey = normalizeText(key);
    const name = normalizeText(value);
    if (normalizedKey && name && !map.has(normalizedKey)) {
        map.set(normalizedKey, name);
    }
}

function rememberEmailName(map, email, value) {
    const normalizedEmail = normalizeEmail(email);
    const name = normalizeText(value);
    if (normalizedEmail && name && !map.has(normalizedEmail)) {
        map.set(normalizedEmail, name);
    }
}

async function fetchLookupRows(adminSupabase, table, select, field, values) {
    if (!values.length) return [];

    const { data, error } = await adminSupabase
        .from(table)
        .select(select)
        .in(field, values);

    if (error) {
        console.warn(`Activity log user lookup skipped: ${table}.${field}`, error);
        return [];
    }

    return data || [];
}

async function fetchIlikeRows(adminSupabase, table, select, field, keyword, limit = SEARCH_LOOKUP_LIMIT) {
    const term = normalizeText(keyword);
    if (!term) return [];

    const { data, error } = await adminSupabase
        .from(table)
        .select(select)
        .ilike(field, `%${term}%`)
        .limit(limit);

    if (error) {
        console.warn(`Activity log search lookup skipped: ${table}.${field}`, error);
        return [];
    }

    return data || [];
}

function rememberSearchEmail(emails, value) {
    const email = normalizeText(value);
    const normalizedEmail = normalizeEmail(email);
    if (!email || normalizedEmail === 'anonymous') return;

    emails.add(email);
    if (normalizedEmail !== email) {
        emails.add(normalizedEmail);
    }
}

async function resolveLogSearchIdentities(adminSupabase, keyword) {
    const term = normalizeText(keyword);
    if (!term) return { emails: [] };

    const [profilesByName, profilesByEmail, rolesByName, rolesByEmail, logsByEmail] = await Promise.all([
        fetchIlikeRows(adminSupabase, 'profiles', 'email,full_name', 'full_name', term),
        fetchIlikeRows(adminSupabase, 'profiles', 'email,full_name', 'email', term),
        fetchIlikeRows(adminSupabase, 'user_roles', 'email,name', 'name', term),
        fetchIlikeRows(adminSupabase, 'user_roles', 'email,name', 'email', term),
        fetchIlikeRows(adminSupabase, 'user_activity_logs', 'user_email', 'user_email', term),
    ]);

    const emails = new Set();

    for (const row of [
        ...profilesByName,
        ...profilesByEmail,
        ...rolesByName,
        ...rolesByEmail,
        ...logsByEmail,
    ]) {
        rememberSearchEmail(emails, row.email || row.user_email);
    }

    return {
        emails: Array.from(emails),
    };
}

async function attachUserNames(adminSupabase, logs) {
    if (!logs.length) return logs;

    const { emails, userIds } = collectLogIdentities(logs);
    if (!emails.length && !userIds.length) {
        return logs.map((log) => ({ ...log, user_name: null }));
    }

    const [profilesByEmail, rolesByEmail, profilesById, rolesById] = await Promise.all([
        fetchLookupRows(adminSupabase, 'profiles', 'id,email,full_name', 'email', emails),
        fetchLookupRows(adminSupabase, 'user_roles', 'email,name', 'email', emails),
        fetchLookupRows(adminSupabase, 'profiles', 'id,email,full_name', 'id', userIds),
        fetchLookupRows(adminSupabase, 'user_roles', 'id,email,name', 'id', userIds),
    ]);

    const nameByEmail = new Map();
    const nameById = new Map();

    for (const profile of [...profilesByEmail, ...profilesById]) {
        rememberName(nameById, profile.id, profile.full_name);
        rememberEmailName(nameByEmail, profile.email, profile.full_name);
    }

    for (const role of [...rolesByEmail, ...rolesById]) {
        rememberName(nameById, role.id, role.name);
        rememberEmailName(nameByEmail, role.email, role.name);
    }

    return logs.map((log) => {
        const email = normalizeEmail(log.user_email);
        const userId = normalizeText(log.user_id);
        const metadataUserId = normalizeText(log.metadata?.user_id);

        return {
            ...log,
            user_name: nameByEmail.get(email) || nameById.get(userId) || nameById.get(metadataUserId) || null,
        };
    });
}

async function requireAdmin() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

    if (!roleData || roleData.role !== 'admin') {
        return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
    }

    return { user };
}

export async function GET(request) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const requestedLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));
    const type = searchParams.get('type') || '';
    const keyword = normalizeText(searchParams.get('q') || searchParams.get('email') || '');
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    try {
        const adminSupabase = await createAdminClient();
        const searchIdentities = keyword
            ? await resolveLogSearchIdentities(adminSupabase, keyword)
            : { emails: [] };

        let query = adminSupabase
            .from('user_activity_logs')
            .select('id,user_id,user_email,action_type,path,metadata,ip_address,created_at', { count: 'estimated' });

        if (type) {
            query = query.eq('action_type', type);
        }
        if (keyword) {
            if (searchIdentities.emails.length > 0) {
                query = query.in('user_email', searchIdentities.emails);
            } else {
                query = query.eq('user_email', '__NO_MATCHING_ACTIVITY_LOG_USER__');
            }
        }
        if (startDate) {
            query = query.gte('created_at', `${startDate} 00:00:00`);
        }
        if (endDate) {
            query = query.lte('created_at', `${endDate} 23:59:59`);
        }

        query = query.order('created_at', { ascending: false });

        const from = (page - 1) * limit;
        const to = from + limit;
        query = query.range(from, to);

        const { data, count, error } = await query;

        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json({
                    logs: [],
                    pagination: { page, limit, total: 0, totalPages: 1, hasNextPage: false, totalIsEstimated: true },
                    info: 'LOG_TABLE_MISSING'
                });
            }
            throw error;
        }

        const rows = data || [];
        const hasNextPage = rows.length > limit;
        const logs = await attachUserNames(adminSupabase, rows.slice(0, limit));
        const fallbackTotal = from + logs.length + (hasNextPage ? 1 : 0);
        const total = Math.max(count || 0, fallbackTotal);
        const totalPages = Math.max(1, Math.ceil(total / limit), page + (hasNextPage ? 1 : 0));

        return NextResponse.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage,
                totalIsEstimated: true
            }
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { dateBefore, deleteType, logIds } = body;

        const adminSupabase = await createAdminClient();
        let query = adminSupabase.from('user_activity_logs').delete();

        if (deleteType === 'ALL') {
            query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything visually (UUID not null)
        } else if (deleteType === 'IDS' && logIds && logIds.length > 0) {
            query = query.in('id', logIds);
        } else if (dateBefore) {
            // Delete older than DateBefore
            query = query.lt('created_at', dateBefore);
        } else {
            return NextResponse.json({ error: 'Invalid deletion criteria.' }, { status: 400 });
        }

        const { error } = await query;
        if (error) {
            if (isMissingTableError(error)) {
                return NextResponse.json({ success: true, message: 'Table does not exist, nothing to delete.' });
            }
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
