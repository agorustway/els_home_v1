import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    try {
        // 사용자 인증은 세션 기반 클라이언트로
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 데이터 조회는 admin 클라이언트로 (RLS 우회)
        const admin = await createAdminClient();
        const { data, error } = await admin
            .from('ai_chat_memory')
            .select('messages')
            .eq('email', user.email)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return NextResponse.json({ messages: data?.messages || [] });
    } catch (e) {
        console.error('[/api/chat/memory] GET 에러:', e);
        return NextResponse.json({ error: '데이터 조회 실패', messages: [] }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { messages } = await request.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // admin 클라이언트로 upsert (RLS 우회)
        const admin = await createAdminClient();
        const { error } = await admin
            .from('ai_chat_memory')
            .upsert({ 
                email: user.email, 
                messages: messages,
                updated_at: new Date().toISOString()
            }, { onConflict: 'email' });

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('[/api/chat/memory] POST 에러:', e);
        return NextResponse.json({ error: '데이터 저장 실패', detail: e.message || String(e) }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = await createAdminClient();
        const { error } = await admin
            .from('ai_chat_memory')
            .delete()
            .eq('email', user.email);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('[/api/chat/memory] DELETE 에러:', e);
        return NextResponse.json({ error: '데이터 삭제 실패' }, { status: 500 });
    }
}
