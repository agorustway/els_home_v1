import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const supabase = await createClient();

    // 관리자 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!roleData || roleData.role !== 'admin') {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 30;
    const type = searchParams.get('type') || '';
    const email = searchParams.get('email') || '';

    // 테이블이 없어서 에러나는 부분 방어코드
    try {
        let query = supabase.from('user_activity_logs').select('*', { count: 'exact' });

        if (type) {
            query = query.eq('action_type', type);
        }
        if (email) {
            query = query.ilike('user_email', `%${email}%`);
        }

        query = query.order('created_at', { ascending: false });

        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        const { data, count, error } = await query;

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                return NextResponse.json({ logs: [], pagination: { page, limit, total: 0, totalPages: 1 }, info: 'LOG_TABLE_MISSING' });
            }
            throw error;
        }

        return NextResponse.json({
            logs: data,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil((count || 0) / limit)
            }
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request) {
    const supabase = await createClient();

    // 관리자 권한 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!roleData || roleData.role !== 'admin') {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { dateBefore, deleteType } = body;

        let query = supabase.from('user_activity_logs').delete();

        if (deleteType === 'ALL') {
            query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything visually (UUID not null)
        } else if (dateBefore) {
            // Delete older than DateBefore
            query = query.lt('created_at', dateBefore);
        } else {
            return NextResponse.json({ error: 'Invalid deletion criteria.' }, { status: 400 });
        }

        const { error } = await query;
        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
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
