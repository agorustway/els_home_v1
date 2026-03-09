import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();

    // 1. Fetch Post
    const { data: post, error: postError } = await supabase.from('posts').select('*').eq('id', id).single();
    if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });
    if (!post) return NextResponse.json({ post: null }, { status: 404 });

    // 2. Fetch Author Info (Robust: ID -> Email -> fallback)
    let authorData = null;
    if (post.author_id || post.author_email) {
        const emailToUse = post.author_email || '';
        const idToUse = post.author_id;

        // Try Profile
        let pQuery = supabase.from('profiles').select('email, full_name, rank');
        if (idToUse) pQuery = pQuery.eq('id', idToUse);
        else pQuery = pQuery.eq('email', emailToUse);
        const { data: profile } = await pQuery.maybeSingle();

        // Try User Role
        let rQuery = supabase.from('user_roles').select('email, name, rank');
        if (idToUse) rQuery = rQuery.eq('id', idToUse);
        else rQuery = rQuery.eq('email', emailToUse);
        const { data: roleData } = await rQuery.maybeSingle();

        authorData = {
            email: profile?.email || roleData?.email || emailToUse,
            name: profile?.full_name || roleData?.name || emailToUse.split('@')[0] || '익명',
            rank: profile?.rank || roleData?.rank || ''
        };
    }

    return NextResponse.json({
        post: {
            ...post,
            author: authorData || { name: '알 수 없음', email: '' }
        }
    });
}

export async function PATCH(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { title, content, attachments } = body;

        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        const isAdmin = roleData?.role === 'admin';

        let query = supabase.from('posts').update({ title, content, attachments, updated_at: new Date().toISOString() }).eq('id', id);
        if (!isAdmin) query = query.eq('author_id', user.id);

        const { data, error } = await query.select().single();
        if (error) throw error;
        return NextResponse.json({ post: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { data: roleData } = await supabase.from('user_roles').select('role').eq('email', user.email).single();
        const isAdmin = roleData?.role === 'admin';

        let query = supabase.from('posts').delete().eq('id', id);
        if (!isAdmin) query = query.eq('author_id', user.id);

        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
