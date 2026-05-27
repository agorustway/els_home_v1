import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';

const PREF_FALLBACKS = Object.freeze({
    asan_shipping_admin_p1: {
        pageKey: 'asan_shipping_default',
        ownerEmail: 'orakami@gmail.com',
        fallbackPageKey: 'asan_shipping_preset_1',
    },
});

async function findUserIdByEmail(adminSupabase, email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return '';

    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('id,email')
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();
    if (profile?.id) return profile.id;

    const { data: role } = await adminSupabase
        .from('user_roles')
        .select('id,email')
        .ilike('email', normalizedEmail)
        .limit(1)
        .maybeSingle();
    return role?.id || '';
}

async function readAllowedFallbackPrefs(pageKey, fallbackToken) {
    const fallback = PREF_FALLBACKS[fallbackToken];
    if (!fallback || fallback.pageKey !== pageKey) return null;

    const adminSupabase = await createAdminClient();
    const ownerId = await findUserIdByEmail(adminSupabase, fallback.ownerEmail);
    if (!ownerId) return null;

    const { data, error } = await adminSupabase
        .from('user_ui_prefs')
        .select('settings')
        .eq('user_id', ownerId)
        .eq('page_key', fallback.fallbackPageKey)
        .maybeSingle();

    if (error || !data?.settings) return null;
    return data.settings;
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const pageKey = searchParams.get('page_key');
        const fallbackToken = searchParams.get('fallback');
        if (!pageKey) return NextResponse.json({ error: 'page_key is required' }, { status: 400 });

        const supabase = await createClient();
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

        if (data) return NextResponse.json({ data: data.settings || {}, source: 'user' });

        const fallbackSettings = await readAllowedFallbackPrefs(pageKey, fallbackToken);
        if (fallbackSettings) {
            return NextResponse.json({ data: fallbackSettings, source: 'fallback' });
        }

        return NextResponse.json({ data: {}, source: 'empty' });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { page_key, settings } = body;
        if (!page_key) return NextResponse.json({ error: 'page_key is required' }, { status: 400 });

        const supabase = await createClient();
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
