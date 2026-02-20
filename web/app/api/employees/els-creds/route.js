import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// 🔑 이트랜스 계정은 회사 공용 1개 → 고정 키 'shared'로 전체 사용자 공유
const SHARED_KEY = 'shared';

// Get Shared ELS Credentials (모든 로그인 사용자 공용)
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const adminSupabase = await createAdminClient();
        const { data, error } = await adminSupabase
            .from('user_els_credentials')
            .select('els_id, els_pw, updated_at')
            .eq('email', SHARED_KEY)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows'
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

// Save/Update Shared ELS Credentials (누가 저장하든 공용으로 반영)
export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { elsId, elsPw } = await request.json();
        if (!elsId || !elsPw) return NextResponse.json({ error: 'ID and Password are required' }, { status: 400 });

        const adminSupabase = await createAdminClient();
        const { error } = await adminSupabase
            .from('user_els_credentials')
            .upsert({
                email: SHARED_KEY,
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
