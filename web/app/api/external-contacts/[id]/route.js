import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from('external_contacts').select('*').eq('id', id).single();
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
        if (body.company_name !== undefined) updates.company_name = body.company_name;
        if (body.contact_type !== undefined) updates.contact_type = body.contact_type;
        if (body.address !== undefined) updates.address = body.address;
        if (body.phone !== undefined) updates.phone = body.phone;
        if (body.email !== undefined) updates.email = body.email;
        if (body.contact_person !== undefined) updates.contact_person = body.contact_person;
        if (body.memo !== undefined) updates.memo = body.memo;
        const { data, error } = await supabase.from('external_contacts').update(updates).eq('id', id).select().single();
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
    const { error } = await supabase.from('external_contacts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
