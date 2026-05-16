import { randomUUID } from 'crypto';
import { createAdminClient } from '@/utils/supabase/server';
import {
    buildContainerLookupMapFromRows,
    buildContainerLookupRecord,
    groupContainerHistoryRows,
} from '@/utils/containerHistoryResults.mjs';

export const TABLE = 'branch_shipping_container_lookups';
export const DEFAULT_PATH = '/아산지점/2026_자체보관리스트.xlsx';

export function normalizePath(value) {
    const path = String(value || DEFAULT_PATH).replace(/\\/g, '/').trim();
    return path.startsWith('/') ? path : `/${path}`;
}

export function normalizeContainers(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim().toUpperCase()).filter(Boolean);
    return String(value || '')
        .split(',')
        .map(v => v.trim().toUpperCase())
        .filter(Boolean);
}

export function rowsFromBody(body) {
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

export function isMissingTableError(error) {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return message.includes(TABLE) || message.includes('relation') || error?.code === '42P01';
}

export async function saveContainerLookupRows({
    filePath,
    rows,
    containers,
    lookupSource = 'asan_shipping',
    lookedUpAt = new Date().toISOString(),
}) {
    const normalizedPath = normalizePath(filePath);
    const targets = normalizeContainers(containers);
    const grouped = groupContainerHistoryRows(rows, targets);
    const resultMap = buildContainerLookupMapFromRows(rows, targets, lookedUpAt);
    const runId = randomUUID();

    const payload = Object.entries(grouped).map(([containerNo, containerRows]) => {
        const record = buildContainerLookupRecord(containerNo, containerRows, lookedUpAt);
        if (!record) return null;
        return {
            run_id: runId,
            branch_id: 'asan',
            file_path: normalizedPath,
            container_no: containerNo,
            result_rows: record.resultRows,
            main_row: record.mainRow,
            main_status: String(record.mainRow?.[2] || ''),
            terminal: String(record.mainRow?.[4] || ''),
            move_time: String(record.mainRow?.[5] || ''),
            vehicle_no: String(record.mainRow?.[13] || ''),
            lookup_source: lookupSource,
            looked_up_at: lookedUpAt,
            updated_at: lookedUpAt,
        };
    }).filter(Boolean);

    if (!payload.length) {
        return {
            ok: true,
            runId,
            count: 0,
            data: {},
        };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase.from(TABLE).insert(payload);
    if (error) throw error;

    return {
        ok: true,
        runId,
        count: payload.length,
        data: resultMap,
    };
}
