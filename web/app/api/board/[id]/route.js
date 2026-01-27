import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    // Next.js 15+ 대응: params를 await 처리
    const resolvedParams = await params;
    const { id } = resolvedParams;

    console.log(`[GET /api/board/${id}] Fetching post...`);

    const supabase = await createClient();

    // 1. 게시글 데이터만 먼저 조회 (조인 에러 방지)
    const { data: post, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single();

    if (postError) {
        console.error(`[GET /api/board/${id}] Supabase Post Error:`, postError);
        return NextResponse.json({ error: postError.message }, { status: 500 });
    }

    if (!post) {
        console.warn(`[GET /api/board/${id}] Post not found`);
        return NextResponse.json({ post: null }, { status: 404 });
    }

    // 2. 작성자 정보 별도 조회 (안전한 방식)
    let authorData = null;
    if (post.author_id) {
        // 먼저 profiles 조회
        const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', post.author_id)
            .single();

        if (profile) {
            authorData = {
                email: profile.email,
                name: profile.full_name
            };
        } else {
            // 프로필 없으면 user_roles라도 시도 (호환성)
            const { data: roleData } = await supabase
                .from('user_roles')
                .select('email')
                .eq('id', post.author_id)
                .single();
            if (roleData) {
                authorData = {
                    email: roleData.email,
                    name: roleData.email?.split('@')[0]
                };
            }
        }
    }

    // 데이터 합치기
    const enrichedPost = {
        ...post,
        author: authorData || { name: '알 수 없음', email: '' }
    };

    return NextResponse.json({ post: enrichedPost });
}

export async function PATCH(request, { params }) {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, content, attachments } = body;

        // Check if admin
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        const isAdmin = roleData?.role === 'admin';

        let query = supabase
            .from('posts')
            .update({ title, content, attachments, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (!isAdmin) {
            query = query.eq('author_id', user.id); // Only author can update if not admin
        }

        const { data, error } = await query.select().single();

        if (error) throw error;

        return NextResponse.json({ post: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Check if admin or author
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .single();

        const isAdmin = roleData?.role === 'admin';

        let query = supabase.from('posts').delete().eq('id', id);
        if (!isAdmin) {
            query = query.eq('author_id', user.id);
        }

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
