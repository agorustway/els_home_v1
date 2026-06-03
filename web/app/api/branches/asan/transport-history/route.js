import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    buildTransportHistoryRowsPage,
    getTransportHistoryQueryMode,
    makeTransportHistoryMetaItem,
    normalizeTransportHistoryDay,
    normalizeTransportHistoryHeaders,
    normalizeTransportHistoryMonth,
    normalizeTransportHistoryYear,
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
    const year = normalizeTransportHistoryYear(searchParams.get('year'));
    const day = normalizeTransportHistoryDay(searchParams.get('date') || searchParams.get('day'));
    const dateFrom = normalizeTransportHistoryDay(searchParams.get('date_from') || searchParams.get('from'));
    const dateTo = normalizeTransportHistoryDay(searchParams.get('date_to') || searchParams.get('to'));
    const dateColumn = String(searchParams.get('date_col') || searchParams.get('dateColumn') || '').trim();
    const sheetName = String(searchParams.get('sheet') || '').trim();
    const limit = Number(searchParams.get('limit') || 100);
    const offset = Number(searchParams.get('offset') || 0);
    const search = String(searchParams.get('search') || '').trim();
    const sortKey = String(searchParams.get('sort') || '').trim();
    const sortDirection = String(searchParams.get('direction') || '').trim().toLowerCase();

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

        if (year && mode !== 'date') {
            query = query
                .gte('target_month', `${year}-01-01`)
                .lt('target_month', `${Number(year) + 1}-01-01`);
        }
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

    if (mode === 'rows') {
        const page = buildTransportHistoryRowsPage(records, {
            limit,
            offset,
            search,
            sortKey,
            sortDirection,
            date: day,
            dateFrom,
            dateTo,
            dateColumn,
        });
        return NextResponse.json({
            data: [{
                branch_id: 'asan',
                target_month: year ? `${year}-01-01` : 'all',
                sheet_name: '전체',
                headers: page.headers,
                source_headers: page.headers,
                data: page.data,
                row_count: page.row_count,
                valid_row_count: page.valid_row_count,
                metadata: {
                    year: year || null,
                    paged: true,
                    date: day || null,
                    dateFrom: dateFrom || null,
                    dateTo: dateTo || null,
                    dateColumn: dateColumn || null,
                },
                total: page.total,
                limit: page.limit,
                offset: page.offset,
                has_more: page.has_more,
            }],
            mode,
        });
    }

    return NextResponse.json({ data: records, mode });
}
