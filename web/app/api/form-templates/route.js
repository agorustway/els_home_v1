import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .order('created_at', { ascending: false });
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
            title: body.title || '',
            description: body.description ?? '',
            file_name: body.file_name ?? '',
            file_path: body.file_path ?? '',
            file_url: body.file_url ?? '',
            category: body.category || '일반',
            author_id: user.id,
            author_email: user.email,
        };
        const { data, error } = await supabase.from('form_templates').insert([row]).select().single();
        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
