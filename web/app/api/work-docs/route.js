import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('work_docs')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emails = [...new Set(data.map((d) => d.author_email).filter(Boolean))];
    let profiles = [];
    if (emails.length > 0) {
        const { data: pData } = await supabase
            .from('profiles')
            .select('email, full_name, name')
            .in('email', emails);
        profiles = pData || [];
    }
    const profileMap = {};
    profiles.forEach((p) => { profileMap[p.email] = p; });

    const list = data.map((row) => ({
        ...row,
        author_name: profileMap[row.author_email]?.full_name || profileMap[row.author_email]?.name || row.author_email?.split('@')[0] || '알 수 없음',
    }));

    return NextResponse.json({ list });
}

export async function POST(request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { title, content, category, attachments } = body;
        const row = {
            title: title || '',
            content: content ?? '',
            category: category || '일반',
            attachments: Array.isArray(attachments) ? attachments : [],
            author_id: user.id,
            author_email: user.email,
        };
        const { data, error } = await supabase.from('work_docs').insert([row]).select().single();
        if (error) throw error;
        return NextResponse.json({ item: data });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
