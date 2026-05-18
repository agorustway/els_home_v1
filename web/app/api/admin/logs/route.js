import { createAdminClient, createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function isMissingTableError(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205';
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
    const email = searchParams.get('email') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    try {
        const adminSupabase = await createAdminClient();
        let query = adminSupabase
            .from('user_activity_logs')
            .select('id,user_id,user_email,action_type,path,metadata,ip_address,created_at', { count: 'estimated' });

        if (type) {
            query = query.eq('action_type', type);
        }
        if (email) {
            query = query.ilike('user_email', `%${email}%`);
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
        const logs = rows.slice(0, limit);
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
