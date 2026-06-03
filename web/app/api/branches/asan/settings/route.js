import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '/아산지점/2026_수출리스트.xlsx';

function getSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeSettings(data) {
    if (!data) return null;
    return {
        ...data,
        shipping_container_auto_lookup_enabled: data.shipping_container_auto_lookup_enabled !== false,
        transport_history_path: data.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH,
    };
}

function isTransportHistoryPathColumnMissing(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    return Boolean(error) && (
        message.includes('transport_history_path')
        || code === 'PGRST204'
        || (message.includes('schema cache') && message.includes('branch_dispatch_settings'))
    );
}

export async function GET() {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json(
            { error: 'Supabase 환경변수가 설정되지 않았습니다.' },
            { status: 503 }
        );
    }

    const { data, error } = await supabase
        .from('branch_dispatch_settings')
        .select('*')
        .eq('branch_id', 'asan')
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: normalizeSettings(data) });
}

export async function PATCH(request) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json(
            { error: 'Supabase 환경변수가 설정되지 않았습니다.' },
            { status: 503 }
        );
    }

    const body = await request.json();
    const { data: current, error: currentError } = await supabase
        .from('branch_dispatch_settings')
        .select('*')
        .eq('branch_id', 'asan')
        .maybeSingle();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });

    const payload = {
        branch_id: 'asan',
        glovis_path: Object.prototype.hasOwnProperty.call(body, 'glovis_path')
            ? (body.glovis_path || '')
            : (current?.glovis_path || ''),
        mobis_path: Object.prototype.hasOwnProperty.call(body, 'mobis_path')
            ? (body.mobis_path || '')
            : (current?.mobis_path || ''),
        updated_at: new Date().toISOString()
    };

    if (Object.prototype.hasOwnProperty.call(body, 'transport_history_path')) {
        payload.transport_history_path = body.transport_history_path || TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'shipping_container_auto_lookup_enabled')) {
        payload.shipping_container_auto_lookup_enabled = body.shipping_container_auto_lookup_enabled !== false;
    }

    let { data, error } = await supabase
        .from('branch_dispatch_settings')
        .upsert(payload, { onConflict: 'branch_id' })
        .select()
        .single();

    if (error && Object.prototype.hasOwnProperty.call(payload, 'transport_history_path') && isTransportHistoryPathColumnMissing(error)) {
        const retryPayload = { ...payload };
        const requestedTransportHistoryPath = retryPayload.transport_history_path;
        delete retryPayload.transport_history_path;
        const retryResult = await supabase
            .from('branch_dispatch_settings')
            .upsert(retryPayload, { onConflict: 'branch_id' })
            .select()
            .single();
        data = retryResult.data ? {
            ...retryResult.data,
            transport_history_path: requestedTransportHistoryPath,
            transport_history_path_unpersisted: true,
        } : null;
        error = retryResult.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: normalizeSettings(data) });
}
