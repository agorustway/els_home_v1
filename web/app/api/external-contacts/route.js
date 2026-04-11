import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('external_contacts')
        .select('*')
        .order('company_name', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ list: data || [] });
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const body = await request.json();
        const row = {
            company_name: body.company_name || '',
            contact_type: body.contact_type || '고객사',
            address: body.address ?? '',
            phone: body.phone ?? '',
            email: body.email ?? '',
            contact_person: body.contact_person ?? '',
            memo: body.memo ?? '',
        };
        const { data, error } = await supabase.from('external_contacts').insert([row]).select().single();
        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
