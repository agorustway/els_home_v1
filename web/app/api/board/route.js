import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'free';
    const branch = searchParams.get('branch');
    const kind = searchParams.get('kind'); // 'daily' | 'monthly' for report

    // 1. Fetch posts (no join)
    let query = supabase
        .from('posts')
        .select('*')
        .eq('board_type', type)
        .order('created_at', { ascending: false });

    if (branch) {
        query = query.eq('branch_tag', branch);
    }
    if (type === 'report' && (kind === 'daily' || kind === 'monthly')) {
        query = query.eq('report_kind', kind);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Fetch Author Profiles using author_email
    const uniqueEmails = [...new Set(data.map(p => p.author_email).filter(Boolean))];

    // Fallback: If author_email is missing, try fetching profiles by id if profile table has id? 
    // Actually, profiles table ONLY has email now. So we MUST rely on author_email.
    // If author_email is null (old data not migrated), we can't show author info easily without migration.

    let profiles = [];
    if (uniqueEmails.length > 0) {
        const { data: pData } = await supabase
            .from('profiles')
            .select('email, full_name, avatar_url')
            .in('email', uniqueEmails);
        profiles = pData || [];
    }

    const profileMap = {};
    profiles.forEach(p => { profileMap[p.email] = p; });

    const mergedPosts = data.map(post => {
        const email = post.author_email;
        const profile = profileMap[email] || {};
        return {
            ...post,
            author: {
                email: email,
                name: profile.full_name || email?.split('@')[0] || '알 수 없음',
                avatar_url: profile.avatar_url,
                id: post.author_id // Keep ID for reference
            }
        };
    });

    return NextResponse.json({ posts: mergedPosts });
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, content, board_type, branch_tag, attachments, report_kind } = body;

        const row = {
            title,
            content,
            board_type,
            branch_tag,
            author_id: user.id,
            author_email: user.email,
            attachments: attachments || []
        };
        if (board_type === 'report' && (report_kind === 'daily' || report_kind === 'monthly')) {
            row.report_kind = report_kind;
        }

        const { data, error } = await supabase
            .from('posts')
            .insert([row])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ post: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}