import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('posts')
        .select(`
            *,
            author:author_id (
                email
            )
        `)
        .eq('id', id)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ post: data });
}

export async function PATCH(request, { params }) {
    const { id } = params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, content, attachments } = body;

        const { data, error } = await supabase
            .from('posts')
            .update({ title, content, attachments, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('author_id', user.id) // Only author can update
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ post: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const { id } = params;
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
            .eq('id', user.id)
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
