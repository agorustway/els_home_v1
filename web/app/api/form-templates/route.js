import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emails = [...new Set(data.map((d) => d.author_email).filter(Boolean))];
    let profiles = [];
    let roles = [];

    if (emails.length > 0) {
        // Fetch profiles
        const { data: pData } = await supabase
            .from('profiles')
            .select('email, full_name, name')
            .in('email', emails);
        profiles = pData || [];

        // Fetch user_roles (fallback for name)
        const { data: rData } = await supabase
            .from('user_roles')
            .select('email, name')
            .in('email', emails);
        roles = rData || [];
    }

    const nameMap = {};
    roles.forEach((r) => {
        if (r.email && r.name) nameMap[r.email] = r.name;
    });
    profiles.forEach((p) => {
        if (p.email && (p.full_name || p.name)) nameMap[p.email] = p.full_name || p.name;
    });

    const list = data.map((row) => ({
        ...row,
        author_name: nameMap[row.author_email] || row.author_email?.split('@')[0] || '알 수 없음',
    }));

    return NextResponse.json({ list });
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
