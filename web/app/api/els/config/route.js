import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { proxyToBackend } from '../proxyToBackend';

/**
 * ETRANS(ELS) 계정: 사용자별로 Supabase에 저장.
 * ID당 PC 허용 수량이 있어 각 사용자가 본인 아이디/비밀번호로 접속하도록 함.
 */

export async function GET(req) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
        return NextResponse.json({ hasSaved: false, defaultUserId: '' });
    }
    const { data: row } = await supabase
        .from('user_els_credentials')
        .select('els_user_id')
        .eq('user_id', user.id)
        .single();
    const defaultUserId = row?.els_user_id ?? '';
    const hasSaved = Boolean(defaultUserId);
    return NextResponse.json({ hasSaved, defaultUserId });
}

export async function POST(req) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    try {
        const body = await req.json();
        const userId = body?.userId != null ? String(body.userId).trim() : '';
        const userPw = body?.userPw != null ? String(body.userPw).trim() : '';
        if (!userId || !userPw) {
            return NextResponse.json({ error: '아이디와 비밀번호가 필요합니다.' }, { status: 400 });
        }
        const { error } = await supabase
            .from('user_els_credentials')
            .upsert(
                {
                    user_id: user.id,
                    els_user_id: userId,
                    els_user_pw: userPw,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            );
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, defaultUserId: userId });
    } catch (e) {
        return NextResponse.json({ error: String(e.message) }, { status: 500 });
    }
}
