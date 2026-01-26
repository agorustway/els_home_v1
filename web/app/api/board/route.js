import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'free';
    const branch = searchParams.get('branch');

    // Join with user_roles to get author info, but realize multiple IDs share the same email
    let query = supabase
        .from('posts')
        .select(`
            *,
            author:user_roles!author_id (
                email,
                name
            )
        `)
        .eq('board_type', type)
        .order('created_at', { ascending: false });

    if (branch) {
        query = query.eq('branch_tag', branch);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Post-processing: If we have author_email, we should really be using the profile name
    // to ensure consistency across providers.
    const uniqueEmails = [...new Set(data.filter(p => p.author?.email || p.author_email).map(p => p.author?.email || p.author_email))];

    const { data: profiles } = await supabase
        .from('profiles')
        .select('email, full_name, avatar_url')
        .in('email', uniqueEmails);

    const profileMap = {};
    profiles?.forEach(p => { profileMap[p.email] = p; });

    const mergedPosts = data.map(post => {
        const email = post.author?.email || post.author_email;
        const profile = profileMap[email];
        return {
            ...post,
            author: {
                ...post.author,
                name: profile?.full_name || post.author?.name || email?.split('@')[0],
                avatar_url: profile?.avatar_url
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
        const { title, content, board_type, branch_tag, attachments } = body;

        // Save both author_id and author_email for robust identity merging
        const { data, error } = await supabase
            .from('posts')
            .insert([
                {
                    title,
                    content,
                    board_type,
                    branch_tag,
                    author_id: user.id,
                    attachments: attachments || []
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ post: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}