import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// Get Shared ELS Credentials (전체 데이터 중 가장 최근 업데이트된 1건 공유)
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const adminSupabase = await createAdminClient();

        // 🎯 [공용 로직] 전체 사용자 중 가장 최근에 업데이트된 1건을 가져옴
        const { data, error } = await adminSupabase
            .from('user_els_credentials')
            .select('els_id, els_pw, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Fetch ELS Creds Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            elsId: data?.els_id || '',
            elsPw: data?.els_pw || '',
            lastSaved: data?.updated_at ? new Date(data.updated_at).toLocaleString('ko-KR') : '',
            hasSaved: !!data
        });
    } catch (error) {
        console.error('GET /api/employees/els-creds Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Save/Update ELS Credentials (현재 로그인 유저 이메일로 저장 → 전체 공유됨)
export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { elsId, elsPw } = await request.json();
        if (!elsId || !elsPw) return NextResponse.json({ error: 'ID and Password are required' }, { status: 400 });

        const adminSupabase = await createAdminClient();

        // 🎯 현재 로그인한 유저의 실제 이메일 사용 (외래키 통과)
        const userEmail = user.email;

        const { error } = await adminSupabase
            .from('user_els_credentials')
            .upsert({
                email: userEmail,
                els_id: elsId.trim(),
                els_pw: elsPw,
                updated_at: new Date().toISOString()
            }, { onConflict: 'email' });

        if (error) {
            console.error('Save ELS Creds Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('POST /api/employees/els-creds Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
