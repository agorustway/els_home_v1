import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('work_docs').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ item: null }, { status: 404 });

    let author_name = data.author_email?.split('@')[0];
    if (data.author_email) {
        const { data: p } = await supabase.from('profiles').select('full_name, name').eq('email', data.author_email).single();
        if (p) author_name = p.full_name || p.name || author_name;
    }

    return NextResponse.json({ item: { ...data, author_name } });
}

export async function PATCH(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { title, content, category, attachments } = body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (category !== undefined) updates.category = category;
        if (attachments !== undefined) updates.attachments = Array.isArray(attachments) ? attachments : [];

        const { data, error } = await supabase.from('work_docs').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase.from('work_docs').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
