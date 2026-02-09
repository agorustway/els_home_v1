import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('internal_contacts')
        .select('*')
        .order('name', { ascending: true });
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
            name: body.name || '',
            department: body.department ?? '',
            position: body.position ?? '',
            phone: body.phone ?? '',
            email: body.email ?? '',
            photo_url: body.photo_url ?? '',
            memo: body.memo ?? '',
        };
        const { data, error } = await supabase.from('internal_contacts').insert([row]).select().single();
        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
