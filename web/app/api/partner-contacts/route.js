import { NextResponse } from 'next/server';
import { getAuthenticatedAdminClient } from '@/lib/api-auth';
import { normalizeKoreanPhoneNumberInput } from '@/utils/koreanPhoneNumber.mjs';

function normalizePartnerContactPayload(body) {
    return {
        ...body,
        phone: normalizeKoreanPhoneNumberInput(body.phone ?? ''),
        manager_phone: normalizeKoreanPhoneNumberInput(body.manager_phone ?? ''),
    };
}

export async function GET(request) {
    const { adminSupabase: supabase } = await getAuthenticatedAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await supabase
        .from('partner_contacts')
        .select('*')
        .order('company_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ list: data });
}

export async function POST(request) {
    const { user, adminSupabase: supabase } = await getAuthenticatedAdminClient();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { data, error } = await supabase
            .from('partner_contacts')
            .insert([normalizePartnerContactPayload(body)])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
