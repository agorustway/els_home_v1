import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('form_templates').select('*').eq('id', id).single();
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
        const updates = {};
        if (body.title !== undefined) updates.title = body.title;
        if (body.description !== undefined) updates.description = body.description;
        if (body.file_name !== undefined) updates.file_name = body.file_name;
        if (body.file_path !== undefined) updates.file_path = body.file_path;
        if (body.file_url !== undefined) updates.file_url = body.file_url;
        if (body.category !== undefined) updates.category = body.category;
        const { data, error } = await supabase.from('form_templates').update(updates).eq('id', id).select().single();
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
    const { error } = await supabase.from('form_templates').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
