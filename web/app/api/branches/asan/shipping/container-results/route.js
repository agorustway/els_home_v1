import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminClient } from '@/utils/supabase/server';
import {
    buildContainerLookupMapFromRows,
    buildContainerLookupRecord,
    groupContainerHistoryRows,
} from '@/utils/containerHistoryResults.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TABLE = 'branch_shipping_container_lookups';
const DEFAULT_PATH = '/아산지점/2026_자체보관리스트.xlsx';

function normalizePath(value) {
    const path = String(value || DEFAULT_PATH).replace(/\\/g, '/').trim();
    return path.startsWith('/') ? path : `/${path}`;
}

function normalizeContainers(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim().toUpperCase()).filter(Boolean);
    return String(value || '')
        .split(',')
        .map(v => v.trim().toUpperCase())
        .filter(Boolean);
}

function rowsFromBody(body) {
    if (Array.isArray(body?.rows)) return body.rows;
    if (body?.results && typeof body.results === 'object') {
        return Object.values(body.results).flatMap(record => {
            if (Array.isArray(record)) return record;
            if (Array.isArray(record?.resultRows)) return record.resultRows;
            if (Array.isArray(record?.rows)) return record.rows;
            return [];
        });
    }
    return [];
}

function isMissingTableError(error) {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return message.includes(TABLE) || message.includes('relation') || error?.code === '42P01';
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const filePath = normalizePath(searchParams.get('path'));
    const containers = normalizeContainers(searchParams.get('containers'));

    if (!containers.length) {
        return NextResponse.json({ data: {}, count: 0 });
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('run_id, container_no, result_rows, main_row, main_status, terminal, move_time, vehicle_no, looked_up_at')
        .eq('branch_id', 'asan')
        .eq('file_path', filePath)
        .in('container_no', containers)
        .order('looked_up_at', { ascending: false })
        .limit(Math.min(containers.length * 20, 2000));

    if (error) {
        if (isMissingTableError(error)) {
            return NextResponse.json({ data: {}, count: 0, warning: 'container lookup table missing' });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const latest = {};
    (data || []).forEach((row) => {
        if (latest[row.container_no]) return;
        latest[row.container_no] = {
            containerNo: row.container_no,
            resultRows: row.result_rows || [],
            mainRow: row.main_row || [],
            lookedUpAt: row.looked_up_at,
            runId: row.run_id,
        };
    });

    return NextResponse.json({ data: latest, count: Object.keys(latest).length });
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const filePath = normalizePath(body.path || body.file_path);
    const rows = rowsFromBody(body);
    const targets = normalizeContainers(body.containers);

    if (!rows.length) {
        return NextResponse.json({ error: '저장할 컨테이너 이력조회 결과가 없습니다.' }, { status: 400 });
    }

    const lookedUpAt = new Date().toISOString();
    const runId = randomUUID();
    const grouped = groupContainerHistoryRows(rows, targets);
    const resultMap = buildContainerLookupMapFromRows(rows, targets, lookedUpAt);

    const payload = Object.entries(grouped).map(([containerNo, containerRows]) => {
        const record = buildContainerLookupRecord(containerNo, containerRows, lookedUpAt);
        return {
            run_id: runId,
            branch_id: 'asan',
            file_path: filePath,
            container_no: containerNo,
            result_rows: record.resultRows,
            main_row: record.mainRow,
            main_status: String(record.mainRow?.[2] || ''),
            terminal: String(record.mainRow?.[4] || ''),
            move_time: String(record.mainRow?.[5] || ''),
            vehicle_no: String(record.mainRow?.[13] || ''),
            lookup_source: body.lookup_source || 'asan_shipping',
            looked_up_at: lookedUpAt,
            updated_at: lookedUpAt,
        };
    });

    const supabase = await createAdminClient();
    const { error } = await supabase.from(TABLE).insert(payload);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        run_id: runId,
        count: payload.length,
        data: resultMap,
    });
}
