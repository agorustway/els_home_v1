import { NextResponse } from 'next/server';
import { getAuthenticatedAdminClient } from '@/lib/api-auth';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';

function normalizeDriverContactPayload(body) {
    const updates = { ...body };
    if (body.phone !== undefined) updates.phone = normalizeKoreanPhoneNumberInput(body.phone);
    return updates;
}

export async function GET(request, { params }) {
    const { adminSupabase: supabase } = await getAuthenticatedAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { data, error } = await supabase
        .from('driver_contacts')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
}

export async function PATCH(request, { params }) {
    const { user, adminSupabase: supabase } = await getAuthenticatedAdminClient();
    const { id } = await params;

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { data, error } = await supabase
            .from('driver_contacts')
            .update(normalizeDriverContactPayload(body))
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
    const { user, adminSupabase: supabase } = await getAuthenticatedAdminClient();
    const { id } = await params;

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase
        .from('driver_contacts')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
