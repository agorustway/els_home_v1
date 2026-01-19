import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'free';
    const branch = searchParams.get('branch');

    let query = supabase
        .from('posts')
        .select(`
            *,
            author:user_roles!author_id (
                email
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

    return NextResponse.json({ posts: data });
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
        console.log('Creating post:', { title, board_type, author_id: user.id });

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

        if (error) {
            console.error('Post creation error:', error);
            throw error;
        }

        return NextResponse.json({ post: data });
    } catch (error) {
        console.error('Board API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
