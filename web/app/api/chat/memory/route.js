import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server';
import { hasUserConversation, shouldIgnoreIncomingMemory } from '@/utils/chatMemory.mjs';

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
            .select('messages, updated_at')
            .eq('email', user.email)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (data && !hasUserConversation(data.messages || [])) {
            const updatedAtTime = data.updated_at ? Date.parse(data.updated_at) : NaN;
            if (Number.isFinite(updatedAtTime) && Date.now() - updatedAtTime > 30000) {
                await admin
                    .from('ai_chat_memory')
                    .delete()
                    .eq('email', user.email);
            }
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
        const { data: existing, error: existingError } = await admin
            .from('ai_chat_memory')
            .select('messages, updated_at')
            .eq('email', user.email)
            .maybeSingle();

        if (existingError && existingError.code !== 'PGRST116') {
            throw existingError;
        }

        if (!hasUserConversation(messages)) {
            const { error: clearError } = await admin
                .from('ai_chat_memory')
                .upsert({
                    email: user.email,
                    messages: [],
                    updated_at: new Date().toISOString()
                }, { onConflict: 'email' });

            if (clearError) throw clearError;
            return NextResponse.json({ success: true, cleared: true });
        }

        if (shouldIgnoreIncomingMemory({
            existingMessages: existing?.messages || [],
            existingUpdatedAt: existing?.updated_at,
            incomingMessages: messages
        })) {
            return NextResponse.json({ success: true, ignored: true, reason: 'stale_after_delete' });
        }

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
        const purgeOnly = new URL(request.url).searchParams.get('purge') === '1';
        const { data, error } = await admin
            .from('ai_chat_memory')
            .delete()
            .eq('email', user.email)
            .select('email');

        if (error) throw error;

        if (purgeOnly) {
            return NextResponse.json({ success: true, deleted: data?.length || 0, purged: true });
        }

        const deletedAt = new Date().toISOString();
        const { error: markerError } = await admin
            .from('ai_chat_memory')
            .upsert({
                email: user.email,
                messages: [],
                updated_at: deletedAt
            }, { onConflict: 'email' });

        if (markerError) throw markerError;

        return NextResponse.json({ success: true, deleted: data?.length || 0, cleared: true, deletedAt });
    } catch (e) {
        console.error('[/api/chat/memory] DELETE 에러:', e);
        return NextResponse.json({ error: '데이터 삭제 실패', detail: e.message || String(e) }, { status: 500 });
    }
}
