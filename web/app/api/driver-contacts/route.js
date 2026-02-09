import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('driver_contacts')
        .select('*')
        .order('name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ list: data });
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { data, error } = await supabase
            .from('driver_contacts')
            .insert([body])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
