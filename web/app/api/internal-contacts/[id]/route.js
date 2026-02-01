import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('internal_contacts').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ item: null }, { status: 404 });
    return NextResponse.json({ item: data });
}

export async function PATCH(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = await request.json();
        const updates = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.department !== undefined) updates.department = body.department;
        if (body.position !== undefined) updates.position = body.position;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.email !== undefined) updates.email = body.email;
        if (body.photo_url !== undefined) updates.photo_url = body.photo_url;
        if (body.memo !== undefined) updates.memo = body.memo;
        if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order) || 0;
        const { data, error } = await supabase.from('internal_contacts').update(updates).eq('id', id).select().single();
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
    const { error } = await supabase.from('internal_contacts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
