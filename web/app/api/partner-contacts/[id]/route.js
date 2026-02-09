import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;
    const { data, error } = await supabase
        .from('partner_contacts')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
}

export async function PATCH(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { data, error } = await supabase
            .from('partner_contacts')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const supabase = await createClient();
    const { id } = await params;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase
        .from('partner_contacts')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
