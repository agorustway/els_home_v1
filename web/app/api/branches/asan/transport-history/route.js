import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    getTransportHistoryQueryMode,
    makeTransportHistoryMetaItem,
    normalizeTransportHistoryHeaders,
    normalizeTransportHistoryMonth,
} from '@/utils/asanTransportHistory.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRANSPORT_HISTORY_META_SELECT = 'id,branch_id,target_month,sheet_name,headers,source_headers,file_modified_at,updated_at,row_count,valid_row_count,metadata';
const TRANSPORT_HISTORY_META_FALLBACK_SELECT = 'id,branch_id,target_month,sheet_name,headers,source_headers,data,file_modified_at,updated_at,metadata';

function getSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey);
}

function transportHistoryCountColumnMissing(error) {
    const message = String(error?.message || '').toLowerCase();
    return Boolean(error) && (message.includes('row_count') || message.includes('valid_row_count'));
}

function normalizeTransportHistoryRecord(item = {}) {
    return {
        ...item,
        headers: normalizeTransportHistoryHeaders(item.headers || []),
        source_headers: item.source_headers || item.headers || [],
        data: Array.isArray(item.data) ? item.data : [],
    };
}

export async function GET(request) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json(
            { error: 'Supabase 환경변수가 설정되지 않았습니다.' },
            { status: 503 }
        );
    }

    const { searchParams } = new URL(request.url);
    const mode = getTransportHistoryQueryMode(searchParams.get('mode'));
    const month = normalizeTransportHistoryMonth(searchParams.get('month') || searchParams.get('date'));
    const sheetName = String(searchParams.get('sheet') || '').trim();

    if (mode === 'date' && !month) {
        return NextResponse.json({ error: 'month required' }, { status: 400 });
    }

    const buildQuery = (selectColumns) => {
        let query = supabase
            .from('branch_transport_history')
            .select(selectColumns)
            .eq('branch_id', 'asan')
            .order('target_month', { ascending: true })
            .order('sheet_name', { ascending: true });

        if (mode === 'date') {
            query = query.eq('target_month', month);
        }
        if (sheetName) {
            query = query.eq('sheet_name', sheetName);
        }
        return query;
    };

    let { data, error } = await buildQuery(mode === 'meta' ? TRANSPORT_HISTORY_META_SELECT : '*');
    if (mode === 'meta' && transportHistoryCountColumnMissing(error)) {
        ({ data, error } = await buildQuery(TRANSPORT_HISTORY_META_FALLBACK_SELECT));
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const records = (data || []).map(normalizeTransportHistoryRecord);
    if (mode === 'meta') {
        return NextResponse.json({ data: records.map(makeTransportHistoryMetaItem), mode });
    }

    return NextResponse.json({ data: records, mode });
}
