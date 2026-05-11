import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const pageKey = searchParams.get('page_key');
        if (!pageKey) return NextResponse.json({ error: 'page_key is required' }, { status: 400 });

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('user_ui_prefs')
            .select('settings')
            .eq('user_id', user.id)
            .eq('page_key', pageKey)
            .single();

        if (error && error.code !== 'PGRST116') {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data: data?.settings || {} });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { page_key, settings } = body;
        if (!page_key) return NextResponse.json({ error: 'page_key is required' }, { status: 400 });

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('user_ui_prefs')
            .upsert({
                user_id: user.id,
                page_key: page_key,
                settings: settings,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, page_key' })
            .select();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ data, ok: true });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
