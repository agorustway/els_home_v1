import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createUnavailableSupabaseClient } from '@/utils/supabase/unavailableClient';
import { findWorkDateColumnIndex } from '@/utils/asanShippingView.mjs';
import {
    buildMonthlyPerformanceFileSlots,
    buildMonthlyPerformancePeriods,
} from '@/utils/asanPerformanceView.mjs';

const DEFAULT_ASAN_SHIPPING_PATH = '/아산지점/2026_자체보관리스트.xlsx';
const DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
const DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET = '합계';
const ANNUAL_AGGREGATE_PATH = '/아산지점/B_총무/C_마감/연간실적-통합';
const ANNUAL_AGGREGATE_SHEET = '연간실적 통합';
const ANNUAL_SOURCE_FILE_HEADER = '원본파일';
const MONTHLY_META_SELECT = 'file_path,sheet_name,header_row,headers,row_count,current_row_count,summary,file_modified_at,synced_at';
const SUPABASE_RANGE_CHUNK_SIZE = 1000;
const DASHBOARD_SNAPSHOT_VERSION = 3;
const DASHBOARD_SNAPSHOT_TABLE = 'branch_performance_dashboard_snapshots';

let adminClient;

function getSupabaseAdmin() {
    if (adminClient) return adminClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        return createUnavailableSupabaseClient('Supabase 관리자 환경변수가 없습니다.');
    }
    adminClient = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
    return adminClient;
}

function hashSnapshotSource(value) {
    return crypto
        .createHash('sha1')
        .update(JSON.stringify(value))
        .digest('hex');
}

function maxTimestamp(values = []) {
    return values.reduce((latest, value) => {
        if (!value) return latest;
        if (!latest) return value;
        return new Date(value || 0) > new Date(latest || 0) ? value : latest;
    }, '');
}

function isDashboardSnapshotUnavailable(error) {
    const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    return text.includes('42p01')
        || text.includes(DASHBOARD_SNAPSHOT_TABLE)
        || text.includes('relation')
        || text.includes('does not exist');
}

function normalizeSnapshotPayload(payload = {}, source = 'supabase-dashboard-snapshot') {
    return {
        ...payload,
        data: Array.isArray(payload.data) ? [] : payload.data,
        page: 1,
        page_size: 0,
        source,
        read_path: 'dashboard-snapshot',
    };
}

async function readDashboardSnapshot({ dashboardType, scopeKey, sourceSignature }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from(DASHBOARD_SNAPSHOT_TABLE)
        .select('payload,source_signature,source_synced_at,computed_at')
        .eq('branch_id', 'asan')
        .eq('dashboard_type', dashboardType)
        .eq('scope_key', scopeKey)
        .limit(1);
    if (error) {
        if (isDashboardSnapshotUnavailable(error)) return null;
        throw new Error(error.message);
    }
    const row = data?.[0];
    if (!row || row.source_signature !== sourceSignature || !row.payload) return null;
    return {
        ...row.payload,
        source: 'supabase-dashboard-snapshot',
        read_path: 'dashboard-snapshot',
        dashboard_snapshot: {
            hit: true,
            dashboard_type: dashboardType,
            scope_key: scopeKey,
            computed_at: row.computed_at,
            source_synced_at: row.source_synced_at,
        },
    };
}

async function writeDashboardSnapshot({ dashboardType, scopeKey, sourceSignature, sourceSyncedAt, payload }) {
    const supabase = getSupabaseAdmin();
    const row = {
        branch_id: 'asan',
        dashboard_type: dashboardType,
        scope_key: scopeKey,
        source_signature: sourceSignature,
        source_synced_at: sourceSyncedAt || null,
        payload,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
        .from(DASHBOARD_SNAPSHOT_TABLE)
        .upsert(row, { onConflict: 'branch_id,dashboard_type,scope_key' });
    if (error && !isDashboardSnapshotUnavailable(error)) throw new Error(error.message);
}

async function withDashboardSnapshot({
    dashboardType,
    scopeKey,
    sourceSignature,
    sourceSyncedAt,
    refresh = false,
    buildPayload,
}) {
    if (!refresh) {
        const cached = await readDashboardSnapshot({ dashboardType, scopeKey, sourceSignature });
        if (cached) return cached;
    }

    const built = await buildPayload();
    const payload = normalizeSnapshotPayload(built, 'supabase-dashboard-snapshot');
    await writeDashboardSnapshot({
        dashboardType,
        scopeKey,
        sourceSignature,
        sourceSyncedAt,
        payload,
    });
    return {
        ...payload,
        dashboard_snapshot: {
            hit: false,
            dashboard_type: dashboardType,
            scope_key: scopeKey,
            computed_at: new Date().toISOString(),
            source_synced_at: sourceSyncedAt || '',
        },
    };
}

function dashboardRefreshRequested(searchParams) {
    const value = String(searchParams.get('refresh_snapshot') || searchParams.get('refresh') || '').toLowerCase();
    return value === '1' || value === 'true' || value === 'yes' || value === 'y';
}

function cleanDashboardParams(searchParams) {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    params.set('page_size', '1');
    params.delete('search');
    params.delete('search_mode');
    params.delete('sort_key');
    params.delete('sort_dir');
    params.delete('source');
    params.delete('dashboard');
    params.delete('refresh_snapshot');
    params.delete('refresh');
    return params;
}

function summaryDashboardViewScope(searchParams) {
    const mode = String(searchParams.get('scope_mode') || searchParams.get('scope') || 'all').toLowerCase();
    return {
        mode: ['year', 'month', 'day'].includes(mode) ? mode : 'all',
        year: String(searchParams.get('scope_year') || searchParams.get('year_scope') || '').trim(),
        month: String(searchParams.get('scope_month') || searchParams.get('month_scope') || '').trim(),
        dayKey: String(searchParams.get('scope_day_key') || searchParams.get('day_key') || '').trim(),
    };
}

function summaryDashboardViewScopeKey(scope = {}) {
    if (scope.mode === 'year') return `scope:year:${scope.year || 'default'}`;
    if (scope.mode === 'month') return `scope:month:${scope.month || 'default'}`;
    if (scope.mode === 'day') return `scope:day:${scope.dayKey || 'default'}`;
    return 'scope:all';
}

function normalizeShippingPath(path) {
    let normalized = String(path || DEFAULT_ASAN_SHIPPING_PATH).replace(/\\/g, '/').trim();
    if (!normalized.startsWith('/')) normalized = `/${normalized}`;
    return normalized;
}

function normalizePerformancePath(path) {
    let normalized = String(path || DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH).replace(/\\/g, '/').trim();
    normalized = normalized.replace(/^[A-Za-z]:/, '');
    while (normalized.startsWith('//')) normalized = normalized.slice(1);
    if (!normalized.startsWith('/')) normalized = `/${normalized}`;
    normalized = normalized.replace(/^\/volume[12]\//, '/');
    if (normalized.startsWith('/B_총무/')) normalized = `/아산지점${normalized}`;
    return normalized;
}

function parsePositiveInt(value, fallback, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
}

function isPerformanceExportRequest(searchParams) {
    const value = String(searchParams.get('export') || searchParams.get('download') || '').toLowerCase();
    return ['1', 'true', 'yes', 'y', 'excel'].includes(value);
}

function searchTerms(search) {
    return String(search || '').split(/[;,，；]+/).map(term => term.trim()).filter(Boolean);
}

function searchFilterValue(term) {
    return String(term || '').replace(/[;,，；\\]/g, ' ');
}

const PERFORMANCE_SEARCH_COMPACT_RE = /[\s,，₩￦원()[\]{}<>·ㆍ\-_/\\'"`´“”‘’:：;；.]/g;
const PERFORMANCE_SEARCH_SCAN_BATCH_SIZE = 1000;
const PERFORMANCE_SEARCH_SCAN_MAX_ROWS = 600000;

function normalizePerformanceSearchText(value) {
    const raw = String(value ?? '').trim().toLocaleLowerCase('ko-KR');
    if (!raw) return '';
    const spaced = raw.replace(PERFORMANCE_SEARCH_COMPACT_RE, ' ').replace(/\s+/g, ' ').trim();
    const compact = raw.replace(PERFORMANCE_SEARCH_COMPACT_RE, '');
    return Array.from(new Set([raw, spaced, compact].filter(Boolean))).join(' ');
}

function performanceSearchTermParts(term) {
    const raw = String(term ?? '').trim().toLocaleLowerCase('ko-KR');
    if (!raw) return { alternatives: [], tokens: [] };
    const spaced = raw.replace(PERFORMANCE_SEARCH_COMPACT_RE, ' ').replace(/\s+/g, ' ').trim();
    const compact = raw.replace(PERFORMANCE_SEARCH_COMPACT_RE, '');
    return {
        alternatives: Array.from(new Set([raw, compact].filter(Boolean))),
        tokens: Array.from(new Set(spaced.split(/\s+/).filter(Boolean))),
    };
}

function collectPerformanceSearchValues(value, bucket) {
    if (value == null) return;
    if (Array.isArray(value)) {
        value.forEach(item => collectPerformanceSearchValues(item, bucket));
        return;
    }
    if (typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            bucket.push(key);
            collectPerformanceSearchValues(item, bucket);
        }
        return;
    }
    bucket.push(value);
}

function performanceSearchValuesFromRow(row = {}) {
    if (Array.isArray(row)) return row;
    const values = [];
    collectPerformanceSearchValues(row.mapped_values, values);
    collectPerformanceSearchValues(row.row_values, values);
    collectPerformanceSearchValues(row.row_data, values);
    values.push(
        row.file_path,
        row.sheet_name,
        row.year_value,
        row.month_value,
        row.row_index,
        row.snapshot_id,
    );
    return values;
}

function rowPerformanceSearchText(values = []) {
    return (Array.isArray(values) ? values : performanceSearchValuesFromRow(values))
        .map(normalizePerformanceSearchText)
        .filter(Boolean)
        .join(' ');
}

function rowMatchesPerformanceSearch(values = [], search = '', mode = 'or') {
    const terms = searchTerms(search);
    if (!terms.length) return true;
    const haystack = rowPerformanceSearchText(values);
    const matches = term => {
        const { alternatives, tokens } = performanceSearchTermParts(term);
        if (!alternatives.length && !tokens.length) return true;
        if (alternatives.some(piece => haystack.includes(piece))) return true;
        if (tokens.length > 1) return tokens.every(piece => haystack.includes(piece));
        return tokens.some(piece => haystack.includes(piece));
    };
    return String(mode || '').toLowerCase() === 'and'
        ? terms.every(matches)
        : terms.some(matches);
}

async function scanPerformanceSearchRows({
    baseOrdered,
    buildOrderedQuery,
    mapRow,
    search = '',
    searchMode = 'or',
    start = 0,
    end = 0,
    sortIdx = -1,
    sortDesc = false,
    maxScanRows = PERFORMANCE_SEARCH_SCAN_MAX_ROWS,
    batchSize = PERFORMANCE_SEARCH_SCAN_BATCH_SIZE,
}) {
    const shouldSort = sortIdx >= 0;
    const pageRows = [];
    const sortableRows = [];
    let total = 0;
    let exhausted = false;

    for (let offset = 0; offset < maxScanRows; offset += batchSize) {
        const rangeEnd = Math.min(offset + batchSize - 1, maxScanRows - 1);
        const orderedQuery = buildOrderedQuery ? buildOrderedQuery() : baseOrdered;
        const { data, error } = await orderedQuery.range(offset, rangeEnd);
        if (error) throw new Error(error.message);
        const rows = data || [];
        if (!rows.length) {
            exhausted = true;
            break;
        }

        for (const raw of rows) {
            const mapped = mapRow(raw);
            if (!rowMatchesPerformanceSearch(mapped, search, searchMode)) continue;
            if (shouldSort) {
                sortableRows.push(mapped);
            } else if (total >= start && pageRows.length <= end - start) {
                pageRows.push(mapped);
            }
            total += 1;
        }

        if (rows.length < rangeEnd - offset + 1) {
            exhausted = true;
            break;
        }
    }

    if (shouldSort) {
        const sortable = [];
        const blanks = [];
        for (const item of sortableRows) {
            const value = sortValue(item.mapped_values?.[sortIdx]);
            if (!value) blanks.push(item);
            else sortable.push([value, item]);
        }
        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc
            ? sortable.map(([, item]) => item).concat(blanks)
            : blanks.concat(sortable.map(([, item]) => item));
        return {
            rows: ordered.slice(start, end + 1),
            total: ordered.length,
            totalEstimated: !exhausted,
        };
    }

    return {
        rows: pageRows,
        total,
        totalEstimated: !exhausted,
    };
}

function normalizeMonthKeys(months) {
    const rawMonths = Array.isArray(months)
        ? months
        : String(months || '').split(',');
    const seen = new Set();
    const keys = [];
    rawMonths.forEach((month) => {
        const match = String(month || '').trim().match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
        if (!match) return;
        const key = `${match[1]}-${match[2]}`;
        if (seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    });
    return keys;
}

function nextMonthKey(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthRanges(months) {
    const ranges = normalizeMonthKeys(months)
        .sort()
        .map((key) => ({
            key,
            start: `${key}-01`,
            end: `${nextMonthKey(key)}-01`,
        }));
    const merged = [];
    ranges.forEach((range) => {
        const prev = merged[merged.length - 1];
        if (prev && prev.end === range.start) {
            prev.end = range.end;
            prev.keys.push(range.key);
        } else {
            merged.push({ ...range, keys: [range.key] });
        }
    });
    return merged;
}

function resolveShippingDateColumn(headers, requestedCol) {
    const requested = String(requestedCol || '').trim();
    if (requested && headers.includes(requested)) return requested;
    const workDateIdx = findWorkDateColumnIndex(headers);
    return workDateIdx >= 0 ? headers[workDateIdx] : '';
}

function applyDateMonthFilter(query, { headers = [], dateCol = '', months = [] } = {}) {
    const resolvedCol = resolveShippingDateColumn(headers, dateCol);
    const ranges = buildMonthRanges(months);
    if (!resolvedCol || ranges.length === 0) {
        return { query, dateCol: '', months: [] };
    }

    const columnExpr = `row_data->>${resolvedCol}`;
    if (ranges.length === 1) {
        return {
            query: query.gte(columnExpr, ranges[0].start).lt(columnExpr, ranges[0].end),
            dateCol: resolvedCol,
            months: ranges[0].keys,
        };
    }

    return {
        query: query.or(ranges.map(range => `and(${columnExpr}.gte.${range.start},${columnExpr}.lt.${range.end})`).join(',')),
        dateCol: resolvedCol,
        months: ranges.flatMap(range => range.keys),
    };
}

function sortValue(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const compact = text.replace(/,/g, '');
    if (/^-?\d+(?:\.\d+)?$/.test(compact)) return [0, Number(compact)];

    const date = text.match(/^(\d{4})[-/.]?(\d{1,2})?[-/.]?(\d{1,2})?(?:\.0)?$/);
    if (date) return [1, Number(date[1] || 0), Number(date[2] || 0), Number(date[3] || 0)];

    const time = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
    if (time) return [2, Number(time[1]), Number(time[2])];

    return [3, text.toLocaleLowerCase('ko-KR')];
}

function compareSortTuple(left, right) {
    const max = Math.max(left.length, right.length);
    for (let idx = 0; idx < max; idx += 1) {
        const a = left[idx] ?? '';
        const b = right[idx] ?? '';
        if (typeof a === 'string' || typeof b === 'string') {
            const compared = String(a).localeCompare(String(b), 'ko-KR');
            if (compared !== 0) return compared;
        } else if (a !== b) {
            return a - b;
        }
    }
    return 0;
}

function applySearch(query, search, mode = 'or') {
    const terms = searchTerms(search);
    if (terms.length === 1) {
        return query.ilike('search_text', `%${searchFilterValue(terms[0])}%`);
    }
    if (terms.length > 1) {
        if (String(mode || '').toLowerCase() === 'and') {
            return terms.reduce((nextQuery, term) => (
                nextQuery.ilike('search_text', `%${searchFilterValue(term)}%`)
            ), query);
        }
        return query.or(terms.map(term => `search_text.ilike.%${searchFilterValue(term)}%`).join(','));
    }
    return query;
}

function buildShippingRowsQuery(supabase, {
    normalizedPath,
    headers,
    search,
    searchMode,
    dateCol,
    months,
    count,
}) {
    const selectOptions = count ? { count } : undefined;
    let query = supabase
        .from('branch_shipping_rows')
        .select('row_values,row_index', selectOptions)
        .eq('branch_id', 'asan')
        .eq('file_path', normalizedPath);
    query = applySearch(query, search, searchMode);
    const dateFilter = applyDateMonthFilter(query, { headers, dateCol, months });
    return { query: dateFilter.query, dateFilter };
}

async function fetchRowsInChunks(buildQuery, start, end, chunkSize = SUPABASE_RANGE_CHUNK_SIZE) {
    const rows = [];
    let total = null;
    let cursor = Math.max(0, start);
    let finalEnd = Math.max(cursor, end);

    while (cursor <= finalEnd) {
        const chunkEnd = Math.min(finalEnd, cursor + chunkSize - 1);
        const { query } = buildQuery({ count: total == null ? 'exact' : undefined });
        const { data, count, error } = await query
            .order('row_index', { ascending: true })
            .range(cursor, chunkEnd);
        if (error) throw new Error(error.message);

        const chunkRows = data || [];
        rows.push(...chunkRows);

        if (total == null && count != null) {
            total = count;
            finalEnd = Math.min(finalEnd, Math.max(0, count - 1));
        }
        if (chunkRows.length === 0 || (total == null && chunkRows.length < chunkEnd - cursor + 1)) {
            break;
        }
        cursor = chunkEnd + 1;
    }

    return { rows, total };
}

async function getPagedRows({ buildQuery, headers, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0, search = '', searchMode = 'or' }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';
    const shouldFilter = searchTerms(search).length > 0;

    if (shouldFilter) {
        const scanned = await scanPerformanceSearchRows({
            buildOrderedQuery: () => buildQuery().query.order('row_index', { ascending: true }),
            mapRow: item => ({ ...item, mapped_values: item.row_values || [] }),
            search,
            searchMode,
            start,
            end,
            sortIdx,
            sortDesc,
        });
        return {
            rows: scanned.rows,
            total: scanned.total,
            totalEstimated: scanned.totalEstimated,
            sortKey: sortIdx >= 0 ? sortKey : '',
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    if (sortIdx >= 0) {
        const { rows: data, total } = await fetchRowsInChunks(buildQuery, 0, maxSortRows);
        const filtered = data || [];

        const sortable = [];
        const blanks = [];
        for (const item of filtered) {
            const row = item.row_values || [];
            const value = sortValue(row[sortIdx]);
            if (!value) blanks.push(item);
            else sortable.push([value, item]);
        }

        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortIdx >= 0
            ? (sortDesc ? sortable.map(([, item]) => item).concat(blanks) : blanks.concat(sortable.map(([, item]) => item)))
            : filtered;
        return {
            rows: ordered.slice(start, end + 1),
            total: shouldFilter ? ordered.length : (total ?? ordered.length),
            sortKey: sortIdx >= 0 ? sortKey : '',
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    const { rows, total } = await fetchRowsInChunks(buildQuery, start, end + 1);
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const loadedThrough = start + pageRows.length;
    const fallbackCount = Math.max(Number(fallbackTotal) || 0, loadedThrough + (hasMore ? 1 : 0));
    return {
        rows: pageRows,
        total: total ?? fallbackCount,
        totalEstimated: total == null && hasMore && !(Number(fallbackTotal) || 0),
        sortKey: '',
        sortDir: sortDesc ? 'desc' : 'asc',
    };
}

export async function queryAsanShippingFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const normalizedPath = normalizeShippingPath(searchParams.get('path'));
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 5000, 10000);
    const search = (searchParams.get('search') || '').trim();
    const searchMode = (searchParams.get('search_mode') || 'or').trim().toLowerCase();
    const sortKey = (searchParams.get('sort_key') || '').trim();
    const sortDir = searchParams.get('sort_dir') || 'asc';
    const dateCol = (searchParams.get('date_col') || '').trim();
    const months = searchParams.get('months') || '';

    const { data: metas, error: metaError } = await supabase
        .from('branch_shipping_files')
        .select('*')
        .eq('branch_id', 'asan')
        .eq('file_path', normalizedPath)
        .limit(1);
    if (metaError) throw new Error(metaError.message);

    const meta = metas?.[0];
    if (!meta) {
        return null;
    }

    const headers = Array.isArray(meta.headers) ? meta.headers : [];
    const buildQuery = (options = {}) => buildShippingRowsQuery(supabase, {
        normalizedPath,
        headers,
        search,
        searchMode,
        dateCol,
        months,
        count: options.count,
    });
    const { dateFilter } = buildQuery();

    const paged = await getPagedRows({
        buildQuery,
        headers,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: 9999,
        fallbackTotal: meta.row_count || 0,
    });

    return {
        headers,
        data: paged.rows.map(row => row.row_values || []),
        file_modified_at: meta.file_modified_at,
        synced_at: meta.synced_at,
        total: paged.total ?? meta.row_count ?? 0,
        total_is_estimated: Boolean(paged.totalEstimated),
        page,
        page_size: pageSize,
        sort_key: paged.sortKey,
        sort_dir: paged.sortDir,
        date_col: dateFilter.dateCol,
        months: dateFilter.months,
        source: 'supabase',
        read_path: 'next-direct',
    };
}

function emptyPerformanceData({ path, sheetName, page, pageSize }) {
    return {
        headers: [],
        data: [],
        summary: {
            totalRows: 0,
            analysisRows: 0,
            totalRevenue: 0,
            totalPurchase: 0,
            totalProfit: 0,
            profitRate: 0,
            yearly: [],
            monthly: [],
            topGroups: [],
            detected: {
                numericColumns: [],
                revenueColumns: [],
                purchaseColumns: [],
                profitColumns: [],
                groupColumns: [],
            },
        },
        file_path: path,
        sheet_name: sheetName,
        header_row: null,
        file_modified_at: null,
        synced_at: null,
        total: 0,
        page,
        page_size: pageSize,
        sort_key: '',
        sort_dir: 'asc',
        source: 'supabase-empty',
        read_path: 'next-direct',
        needs_sync: true,
    };
}

function shouldAggregateAnnualPerformance(searchParams) {
    const aggregate = String(searchParams.get('aggregate') || '').trim().toLowerCase();
    const path = String(searchParams.get('path') || '').trim().toLowerCase();
    return aggregate === 'all' || aggregate === 'current' || aggregate === 'merged' || path === '__all__';
}

function numberValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function roundMetric(value) {
    return Math.round(numberValue(value) * 100) / 100;
}

function blankCarryoverMetric(label = '') {
    return {
        label,
        revenue: 0,
        purchase: 0,
        profit: 0,
        rowCount: 0,
    };
}

function normalizeCarryoverMetric(metric = {}, fallbackLabel = '') {
    const revenue = roundMetric(metric.revenue);
    const purchase = roundMetric(metric.purchase);
    const profit = roundMetric(metric.profit || revenue - purchase);
    return {
        ...metric,
        label: metric.label || fallbackLabel,
        revenue,
        purchase,
        profit,
        rowCount: numberValue(metric.rowCount),
        profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
    };
}

function addCarryoverMetric(target, metric = {}) {
    target.revenue += numberValue(metric.revenue);
    target.purchase += numberValue(metric.purchase);
    target.profit += numberValue(metric.profit || numberValue(metric.revenue) - numberValue(metric.purchase));
    target.rowCount += numberValue(metric.rowCount);
}

function addCarryoverParties(map, items = []) {
    for (const item of items || []) {
        const key = String(item.name || item.label || '').trim() || '미분류';
        if (!map.has(key)) map.set(key, { ...blankCarryoverMetric(key), name: key });
        addCarryoverMetric(map.get(key), item);
    }
}

function carryoverPartiesFromMap(map, limit = 40) {
    return Array.from(map.values())
        .map(item => normalizeCarryoverMetric(item, item.name || item.label))
        .filter(item => item.revenue || item.purchase || item.profit || item.rowCount)
        .sort((a, b) => Math.abs(numberValue(b.revenue)) - Math.abs(numberValue(a.revenue)))
        .slice(0, limit);
}

function normalizeCarryoverCycle(summary = {}, report = null, sourcePeriod = '') {
    const cycle = summary.carryoverCycle && typeof summary.carryoverCycle === 'object' ? summary.carryoverCycle : null;
    const reportCarryover = report?.carryover || summary.carryover || {};
    const incoming = normalizeCarryoverMetric(cycle?.incoming || cycle?.included || {}, '청구이월 반영분');
    const outgoingSeed = cycle?.outgoing || reportCarryover || {};
    const outgoing = normalizeCarryoverMetric(outgoingSeed, '익월이월 발생분');
    return {
        sourcePeriod: cycle?.sourcePeriod || sourcePeriod,
        basis: cycle?.basis || '마감월',
        incoming,
        included: incoming,
        outgoing,
        targetPeriods: Array.isArray(cycle?.targetPeriods) ? cycle.targetPeriods : [],
    };
}

function addCarryoverFieldsToMonthly(bucket, incoming = {}, outgoing = {}) {
    bucket.incomingCarryoverRevenue = numberValue(bucket.incomingCarryoverRevenue) + numberValue(incoming.revenue);
    bucket.incomingCarryoverPurchase = numberValue(bucket.incomingCarryoverPurchase) + numberValue(incoming.purchase);
    bucket.incomingCarryoverProfit = numberValue(bucket.incomingCarryoverProfit) + numberValue(incoming.profit || numberValue(incoming.revenue) - numberValue(incoming.purchase));
    bucket.incomingCarryoverRows = numberValue(bucket.incomingCarryoverRows) + numberValue(incoming.rowCount);
    bucket.carryoverRevenue = numberValue(bucket.carryoverRevenue) + numberValue(outgoing.revenue);
    bucket.carryoverPurchase = numberValue(bucket.carryoverPurchase) + numberValue(outgoing.purchase);
    bucket.carryoverProfit = numberValue(bucket.carryoverProfit) + numberValue(outgoing.profit || numberValue(outgoing.revenue) - numberValue(outgoing.purchase));
    bucket.carryoverRows = numberValue(bucket.carryoverRows) + numberValue(outgoing.rowCount);
}

function finalizeCarryoverFields(item = {}) {
    for (const key of [
        'incomingCarryoverRevenue',
        'incomingCarryoverPurchase',
        'incomingCarryoverProfit',
        'incomingCarryoverRows',
        'carryoverRevenue',
        'carryoverPurchase',
        'carryoverProfit',
        'carryoverRows',
    ]) {
        if (key in item) item[key] = key.endsWith('Rows') ? numberValue(item[key]) : roundMetric(item[key]);
    }
    return item;
}

function lastPathName(value) {
    return String(value || '').split('/').filter(Boolean).pop() || String(value || '');
}

function summaryOf(meta = {}) {
    return meta.summary && typeof meta.summary === 'object' ? meta.summary : {};
}

function mergeDetectedColumns(metas) {
    const detected = {
        numericColumns: new Set(),
        revenueColumns: new Set(),
        purchaseColumns: new Set(),
        profitColumns: new Set(),
        groupColumns: new Set(),
    };

    for (const meta of metas) {
        const summary = summaryOf(meta);
        for (const key of Object.keys(detected)) {
            for (const value of summary.detected?.[key] || []) detected[key].add(value);
        }
    }

    return Object.fromEntries(Object.entries(detected).map(([key, set]) => [key, Array.from(set)]));
}

function addMetricFields(bucket, item = {}) {
    bucket.revenue += numberValue(item.revenue);
    bucket.purchase += numberValue(item.purchase);
    bucket.profit += numberValue(item.profit);
    bucket.rowCount += numberValue(item.rowCount);
}

function addMetricToMap(map, key, seed = {}, item = {}) {
    if (!key) return null;
    if (!map.has(key)) {
        map.set(key, {
            ...seed,
            revenue: 0,
            purchase: 0,
            profit: 0,
            rowCount: 0,
        });
    }
    const bucket = map.get(key);
    addMetricFields(bucket, item);
    return bucket;
}

function finalizeMetricItem(item, totalRevenue = 0) {
    const revenue = roundMetric(item.revenue);
    const purchase = roundMetric(item.purchase);
    const profit = roundMetric(item.profit);
    return {
        ...item,
        revenue,
        purchase,
        profit,
        rowCount: numberValue(item.rowCount),
        profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
        revenueShare: totalRevenue ? Math.round((revenue / totalRevenue) * 10000) / 100 : 0,
    };
}

function mergeMetricSeries(metas, field, keyOf, seedOf, sorter, limit = 1000) {
    const map = new Map();
    for (const meta of metas) {
        for (const item of summaryOf(meta)[field] || []) {
            const key = keyOf(item);
            addMetricToMap(map, key, seedOf(item, key), item);
        }
    }
    return Array.from(map.values())
        .map(item => finalizeMetricItem(item))
        .sort(sorter)
        .slice(0, limit);
}

function mergeNamedMetricList(lists, totalRevenue = 0, limit = 30) {
    const map = new Map();
    for (const items of lists) {
        for (const item of items || []) {
            const key = String(item.name || item.label || item.vehicleNo || '').trim();
            if (!key) continue;
            const bucket = addMetricToMap(map, key, {
                ...item,
                name: item.name || item.label || item.vehicleNo || key,
                label: item.label || item.name || item.vehicleNo || key,
                monthly: [],
                daily: [],
                yearly: [],
                weekday: [],
            }, item);
            bucket.monthly = mergeInlineSeries(bucket.monthly, item.monthly, 'period');
            bucket.daily = mergeInlineSeries(bucket.daily, item.daily, 'dateKey');
            bucket.yearly = mergeInlineSeries(bucket.yearly, item.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, item.weekday, 'day');
        }
    }
    return Array.from(map.values())
        .map(item => finalizeMetricItem(item, totalRevenue))
        .sort((a, b) => Math.abs(numberValue(b.revenue)) - Math.abs(numberValue(a.revenue)))
        .slice(0, limit);
}

function metricWithSourcePeriod(item = {}, sourcePeriod = '') {
    if (!sourcePeriod) return item;
    const [yearText, monthText] = String(sourcePeriod).split('-');
    return {
        ...item,
        monthly: [{
            period: sourcePeriod,
            year: Number(yearText),
            month: Number(monthText),
            revenue: numberValue(item.revenue),
            purchase: numberValue(item.purchase),
            profit: numberValue(item.profit),
            rowCount: numberValue(item.rowCount),
        }],
        daily: (item.daily || []).map(metric => ({
            ...metric,
            dateKey: `${sourcePeriod}::${metric.date || ''}`,
            period: sourcePeriod,
            sourcePeriod,
            workPeriod: metric.period || String(metric.date || '').slice(0, 7),
        })),
    };
}

function mergeInlineSeries(left = [], right = [], keyField = 'period') {
    const map = new Map();
    for (const item of [...(left || []), ...(right || [])]) {
        const key = String(item?.[keyField] ?? item?.period ?? item?.year ?? item?.label ?? '').trim();
        if (!key) continue;
        addMetricToMap(map, key, { ...item }, item);
    }
    return Array.from(map.values())
        .map(item => finalizeMetricItem(item))
        .sort((a, b) => String(a[keyField] ?? a.period ?? a.year ?? a.label).localeCompare(String(b[keyField] ?? b.period ?? b.year ?? b.label), 'ko-KR'));
}

function compactDashboardSeriesItem(item = {}, type = 'monthly') {
    const compact = {
        revenue: roundMetric(item.revenue),
        purchase: roundMetric(item.purchase),
        profit: roundMetric(item.profit),
        rowCount: numberValue(item.rowCount),
        profitRate: numberValue(item.profitRate),
    };
    for (const key of [
        'incomingCarryoverRevenue',
        'incomingCarryoverPurchase',
        'incomingCarryoverProfit',
        'incomingCarryoverRows',
        'carryoverRevenue',
        'carryoverPurchase',
        'carryoverProfit',
        'carryoverRows',
    ]) {
        if (key in item) compact[key] = key.endsWith('Rows') ? numberValue(item[key]) : roundMetric(item[key]);
    }
    if (type === 'daily') {
        compact.date = item.date || '';
        compact.period = item.period || '';
        compact.label = item.label || '';
        compact.day = item.day;
        return compact;
    }
    if (type === 'yearly') {
        compact.year = item.year || '';
        return compact;
    }
    if (type === 'weekday') {
        compact.day = item.day;
        compact.label = item.label || '';
        return compact;
    }
    compact.period = item.period || '';
    compact.year = item.year || '';
    compact.month = item.month || '';
    return compact;
}

function compactDashboardSeries(items = [], type = 'monthly') {
    return (Array.isArray(items) ? items : []).map(item => compactDashboardSeriesItem(item, type));
}

function compactDashboardNamedItem(item = {}, options = {}) {
    const {
        keepMonthly = true,
        keepDaily = false,
        keepYearly = false,
        keepWeekday = false,
        keepTopLists = false,
    } = options;
    const compact = {
        key: item.key || '',
        name: item.name || item.label || item.vehicleNo || '',
        label: item.label || item.name || item.vehicleNo || '',
        vehicleNo: item.vehicleNo || '',
        drivers: item.drivers || item.driver || '',
        carriers: item.carriers || item.carrier || '',
        description: item.description || '',
        filterTerms: Array.isArray(item.filterTerms) ? item.filterTerms.slice(0, 8) : [],
        revenue: roundMetric(item.revenue),
        purchase: roundMetric(item.purchase),
        profit: roundMetric(item.profit),
        rowCount: numberValue(item.rowCount),
        profitRate: numberValue(item.profitRate),
        revenueShare: numberValue(item.revenueShare),
    };
    if (keepMonthly) compact.monthly = compactDashboardSeries(item.monthly, 'monthly');
    if (keepDaily) compact.daily = compactDashboardSeries(item.daily, 'daily');
    if (keepYearly) compact.yearly = compactDashboardSeries(item.yearly, 'yearly');
    if (keepWeekday) compact.weekday = compactDashboardSeries(item.weekday, 'weekday');
    if (keepTopLists) {
        compact.topWorkSites = (Array.isArray(item.topWorkSites) ? item.topWorkSites : []).slice(0, 12).map(child => compactDashboardNamedItem(child, { keepMonthly: false }));
        compact.topClients = (Array.isArray(item.topClients) ? item.topClients : []).slice(0, 12).map(child => compactDashboardNamedItem(child, { keepMonthly: false }));
        compact.topRoutes = (Array.isArray(item.topRoutes) ? item.topRoutes : []).slice(0, 12).map(child => compactDashboardNamedItem(child, { keepMonthly: false }));
        compact.topCategories = (Array.isArray(item.topCategories) ? item.topCategories : []).slice(0, 12).map(child => compactDashboardNamedItem(child, { keepMonthly: false }));
        compact.topPickups = (Array.isArray(item.topPickups) ? item.topPickups : []).slice(0, 12).map(child => compactDashboardNamedItem(child, { keepMonthly: false }));
    }
    return compact;
}

function compactPerformanceDashboardSummary(summary = {}, type = 'annual') {
    const keepDaily = type === 'monthly';
    const compact = {
        ...summary,
        yearly: compactDashboardSeries(summary.yearly, 'yearly'),
        monthly: compactDashboardSeries(summary.monthly, 'monthly'),
        daily: compactDashboardSeries(summary.daily, 'daily'),
        weekday: compactDashboardSeries(summary.weekday, 'weekday'),
        topGroups: (summary.topGroups || []).map(item => compactDashboardNamedItem(item, { keepMonthly: false })),
        breakdowns: (summary.breakdowns || []).map(section => ({
            column: section.column || '',
            items: (section.items || []).map(item => compactDashboardNamedItem(item, { keepMonthly: true, keepDaily })),
        })),
        strategicSegments: (summary.strategicSegments || []).map(item => compactDashboardNamedItem(item, {
            keepMonthly: true,
            keepDaily,
            keepTopLists: true,
        })),
        vehiclePerformance: (summary.vehiclePerformance || []).map(item => compactDashboardNamedItem(item, {
            keepMonthly: true,
            keepDaily,
        })),
    };
    delete compact.weekly;
    delete compact.sourceFiles;
    return compact;
}

function mergeBreakdowns(metas, totalRevenue) {
    const sections = new Map();
    for (const meta of metas) {
        const sourcePeriod = metaSourcePeriod(meta);
        for (const section of summaryOf(meta).breakdowns || []) {
            const column = String(section.column || '').trim();
            if (!column) continue;
            if (!sections.has(column)) {
                sections.set(column, {
                    column,
                    items: [],
                });
            }
            const bucket = sections.get(column);
            bucket.items.push(...(section.items || []).map(item => metricWithSourcePeriod(item, sourcePeriod)));
        }
    }

    return Array.from(sections.values()).map(section => ({
        column: section.column,
        items: mergeNamedMetricList([section.items], totalRevenue, 60),
    }));
}

function mergeStrategicSegments(metas, totalRevenue) {
    const segments = new Map();
    for (const meta of metas) {
        const sourcePeriod = metaSourcePeriod(meta);
        for (const segment of summaryOf(meta).strategicSegments || []) {
            const key = String(segment.key || segment.label || '').trim();
            if (!key) continue;
            if (!segments.has(key)) {
                segments.set(key, {
                    ...segment,
                    revenue: 0,
                    purchase: 0,
                    profit: 0,
                    rowCount: 0,
                    monthly: [],
                    daily: [],
                    yearly: [],
                    weekday: [],
                    topWorkSites: [],
                    topClients: [],
                    topRoutes: [],
                    topCategories: [],
                    topPickups: [],
                });
            }
            const bucket = segments.get(key);
            addMetricFields(bucket, segment);
            bucket.monthly = mergeInlineSeries(bucket.monthly, metricWithSourcePeriod(segment, sourcePeriod).monthly, 'period');
            bucket.daily = mergeInlineSeries(bucket.daily, metricWithSourcePeriod(segment, sourcePeriod).daily, 'dateKey');
            bucket.yearly = mergeInlineSeries(bucket.yearly, segment.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, segment.weekday, 'day');
            bucket.topWorkSites = mergeNamedMetricList([bucket.topWorkSites, segment.topWorkSites], totalRevenue, 12);
            bucket.topClients = mergeNamedMetricList([bucket.topClients, segment.topClients], totalRevenue, 12);
            bucket.topRoutes = mergeNamedMetricList([bucket.topRoutes, segment.topRoutes], totalRevenue, 12);
            bucket.topCategories = mergeNamedMetricList([bucket.topCategories, segment.topCategories], totalRevenue, 12);
            bucket.topPickups = mergeNamedMetricList([bucket.topPickups, segment.topPickups], totalRevenue, 12);
        }
    }
    const order = ['own_direct', 'external_carrier', 'els_solution', 'outsourced', 'unclassified'];
    return Array.from(segments.values())
        .filter(item => ['own_direct', 'external_carrier'].includes(item.key))
        .map(item => finalizeMetricItem(item, totalRevenue))
        .sort((a, b) => {
            const ai = order.indexOf(a.key);
            const bi = order.indexOf(b.key);
            if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
            return Math.abs(numberValue(b.revenue)) - Math.abs(numberValue(a.revenue));
        });
}

function mergeVehiclePerformance(metas, totalRevenue) {
    const vehicles = new Map();
    for (const meta of metas) {
        const sourcePeriod = metaSourcePeriod(meta);
        for (const vehicle of summaryOf(meta).vehiclePerformance || []) {
            const key = String(vehicle.vehicleNo || vehicle.name || vehicle.label || '').trim();
            if (!key) continue;
            if (!vehicles.has(key)) {
                vehicles.set(key, {
                    ...vehicle,
                    name: vehicle.name || key,
                    vehicleNo: vehicle.vehicleNo || key,
                    carrierSet: new Set(),
                    driverSet: new Set(),
                    revenue: 0,
                    purchase: 0,
                    profit: 0,
                    rowCount: 0,
                    monthly: [],
                    daily: [],
                    yearly: [],
                    weekday: [],
                });
            }
            const bucket = vehicles.get(key);
            addMetricFields(bucket, vehicle);
            bucket.monthly = mergeInlineSeries(bucket.monthly, metricWithSourcePeriod(vehicle, sourcePeriod).monthly, 'period');
            bucket.daily = mergeInlineSeries(bucket.daily, metricWithSourcePeriod(vehicle, sourcePeriod).daily, 'dateKey');
            bucket.yearly = mergeInlineSeries(bucket.yearly, vehicle.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, vehicle.weekday, 'day');
            String(vehicle.carriers || vehicle.carrier || vehicle.carrierName || vehicle.payee || '').split(',').map(item => item.trim()).filter(Boolean).forEach(carrier => bucket.carrierSet.add(carrier));
            String(vehicle.drivers || '').split(',').map(item => item.trim()).filter(Boolean).forEach(driver => bucket.driverSet.add(driver));
        }
    }
    return Array.from(vehicles.values())
        .map((item) => {
            const finalized = finalizeMetricItem(item, totalRevenue);
            finalized.carriers = Array.from(item.carrierSet || []).slice(0, 5).join(', ');
            finalized.drivers = Array.from(item.driverSet || []).slice(0, 5).join(', ');
            delete finalized.carrierSet;
            delete finalized.driverSet;
            return finalized;
        })
        .sort((a, b) => Math.abs(numberValue(b.revenue)) - Math.abs(numberValue(a.revenue)))
        .slice(0, 300);
}

function mergeQualityObjects(metas, field) {
    const result = {};
    for (const meta of metas) {
        const value = summaryOf(meta)[field] || summaryOf(meta).ledgerValidation?.[field] || {};
        for (const [key, item] of Object.entries(value)) {
            if (typeof item === 'number') result[key] = numberValue(result[key]) + item;
            else if (key.toLowerCase().startsWith('min')) result[key] = !result[key] || String(item) < String(result[key]) ? item : result[key];
            else if (key.toLowerCase().startsWith('max')) result[key] = !result[key] || String(item) > String(result[key]) ? item : result[key];
            else if (result[key] == null) result[key] = item;
        }
    }
    return result;
}

function mergeLedgerValidation(metas, totalRows) {
    const result = mergeQualityObjects(metas, 'ledgerValidation');
    result.rowCountActual = totalRows;
    result.rowCountMeta = metas.reduce((sum, meta) => sum + numberValue(meta.current_row_count || meta.row_count), 0);
    result.amountQuality = mergeQualityObjects(metas, 'amountQuality');
    result.dateQuality = mergeQualityObjects(metas, 'dateQuality');
    return result;
}

function buildAnnualHeaders(metas) {
    const seen = new Set([ANNUAL_SOURCE_FILE_HEADER]);
    const headers = [ANNUAL_SOURCE_FILE_HEADER];
    for (const meta of metas) {
        for (const header of meta.headers || []) {
            if (seen.has(header)) continue;
            seen.add(header);
            headers.push(header);
        }
    }
    return headers;
}

function annualRowToValues(row, headers) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const fallbackValues = Array.isArray(row.row_values) ? row.row_values : [];
    const fallbackHeaders = Array.isArray(row.source_headers) ? row.source_headers : [];
    const fallbackMap = new Map(fallbackHeaders.map((header, idx) => [header, fallbackValues[idx] ?? '']));
    const fileName = lastPathName(row.file_path);

    return headers.map((header, idx) => {
        if (header === ANNUAL_SOURCE_FILE_HEADER) return fileName;
        if (Object.prototype.hasOwnProperty.call(rowData, header)) return rowData[header] ?? '';
        if (fallbackMap.has(header)) return fallbackMap.get(header) ?? '';
        return fallbackValues[idx - 1] ?? '';
    });
}

async function getAnnualPagedRows({ query, buildQuery, headers, metaBySnapshot, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0, orderBySnapshot = false, search = '', searchMode = 'or' }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';
    const orderQuery = rowsQuery => (orderBySnapshot
        ? rowsQuery
            .order('snapshot_id', { ascending: true })
            .order('row_index', { ascending: true })
        : rowsQuery
            .order('file_path', { ascending: true })
            .order('sheet_name', { ascending: true })
            .order('row_index', { ascending: true }));
    const baseOrdered = orderQuery(query);
    const buildBaseOrdered = buildQuery ? () => orderQuery(buildQuery()) : null;
    const attachHeaders = row => ({
        ...row,
        source_headers: metaBySnapshot.get(row.snapshot_id)?.headers || metaBySnapshot.get(`${row.file_path}::${row.sheet_name}`)?.headers || [],
    });
    const shouldFilter = searchTerms(search).length > 0;

    if (shouldFilter) {
        const scanned = await scanPerformanceSearchRows({
            baseOrdered,
            buildOrderedQuery: buildBaseOrdered,
            mapRow: item => {
                const row = attachHeaders(item);
                const mapped = annualRowToValues(row, headers);
                return { ...row, mapped_values: mapped };
            },
            search,
            searchMode,
            start,
            end,
            sortIdx,
            sortDesc,
        });
        return {
            rows: scanned.rows,
            total: scanned.total,
            totalEstimated: scanned.totalEstimated,
            sortKey: sortIdx >= 0 ? sortKey : '',
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    if (sortIdx >= 0) {
        const { data, error } = await baseOrdered.range(0, maxSortRows);
        if (error) throw new Error(error.message);
        const mappedRows = (data || []).map(item => {
            const row = attachHeaders(item);
            const mapped = annualRowToValues(row, headers);
            return { ...row, mapped_values: mapped };
        });
        const sortable = [];
        const blanks = [];
        for (const item of mappedRows) {
            const value = sortValue(item.mapped_values?.[sortIdx]);
            if (!value) blanks.push(item);
            else sortable.push([value, item]);
        }
        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc
            ? sortable.map(([, item]) => item).concat(blanks)
            : blanks.concat(sortable.map(([, item]) => item));
        return {
            rows: ordered.slice(start, end + 1),
            total: Math.max(numberValue(fallbackTotal), ordered.length),
            sortKey,
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    const { data, error } = await baseOrdered.range(start, end + 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const loadedThrough = start + pageRows.length;
    return {
        rows: pageRows.map(item => {
            const row = attachHeaders(item);
            return { ...row, mapped_values: annualRowToValues(row, headers) };
        }),
        total: Math.max(numberValue(fallbackTotal), loadedThrough + (hasMore ? 1 : 0)),
        totalEstimated: hasMore && !numberValue(fallbackTotal),
        sortKey: '',
        sortDir: sortDesc ? 'desc' : 'asc',
    };
}

function mergeAnnualSummaries(metas) {
    const snapshotIds = metas.map(meta => summaryOf(meta).currentSnapshotId || summaryOf(meta).snapshotId).filter(Boolean);
    const totalRows = metas.reduce((sum, meta) => sum + numberValue(meta.current_row_count || meta.row_count || summaryOf(meta).totalRows), 0);
    const analysisRows = metas.reduce((sum, meta) => sum + numberValue(summaryOf(meta).analysisRows || meta.current_row_count || meta.row_count), 0);
    const totalRevenue = roundMetric(metas.reduce((sum, meta) => sum + numberValue(summaryOf(meta).totalRevenue), 0));
    const totalPurchase = roundMetric(metas.reduce((sum, meta) => sum + numberValue(summaryOf(meta).totalPurchase), 0));
    const totalProfit = roundMetric(metas.reduce((sum, meta) => sum + numberValue(summaryOf(meta).totalProfit), 0));
    const monthly = mergeMetricSeries(
        metas,
        'monthly',
        item => String(item.period || ''),
        item => ({ period: item.period, year: item.year, month: item.month }),
        (a, b) => String(a.period).localeCompare(String(b.period)),
        400,
    );
    const yearlyMap = new Map();
    for (const item of monthly) {
        const year = String(item.year || String(item.period || '').slice(0, 4));
        if (!year) continue;
        addMetricToMap(yearlyMap, year, { year: Number(year) || year }, item);
    }
    if (!yearlyMap.size) {
        for (const meta of metas) {
            for (const item of summaryOf(meta).yearly || []) {
                const year = String(item.year || '');
                addMetricToMap(yearlyMap, year, { year: item.year }, item);
            }
        }
    }
    const yearly = Array.from(yearlyMap.values())
        .map(item => finalizeMetricItem(item))
        .sort((a, b) => String(a.year).localeCompare(String(b.year), 'ko-KR'));

    const daily = mergeMetricSeries(metas, 'daily', item => String(item.date || ''), item => ({ date: item.date, period: item.period }), (a, b) => String(a.date).localeCompare(String(b.date)), 800);
    const weekly = mergeMetricSeries(metas, 'weekly', item => String(item.weekStart || ''), item => ({ weekStart: item.weekStart, weekEnd: item.weekEnd }), (a, b) => String(a.weekStart).localeCompare(String(b.weekStart)), 800);
    const weekday = mergeMetricSeries(metas, 'weekday', item => String(item.day ?? item.label ?? ''), item => ({ day: item.day, label: item.label }), (a, b) => numberValue(a.day) - numberValue(b.day), 7);
    const sourceFiles = metas.map(meta => {
        const summary = summaryOf(meta);
        const periods = Array.isArray(summary.monthly) ? summary.monthly.map(item => item.period).filter(Boolean).sort() : [];
        return {
            filePath: meta.file_path,
            fileName: lastPathName(meta.file_path),
            sheetName: meta.sheet_name,
            rows: numberValue(meta.current_row_count || meta.row_count || summary.totalRows),
            snapshotId: summary.currentSnapshotId || summary.snapshotId || '',
            periodStart: summary.dateQuality?.minPeriod || periods[0] || '',
            periodEnd: summary.dateQuality?.maxPeriod || periods[periods.length - 1] || '',
            fileModifiedAt: meta.file_modified_at || '',
            syncedAt: meta.synced_at || '',
        };
    });

    const summary = {
        totalRows,
        analysisRows,
        totalRevenue,
        totalPurchase,
        totalProfit,
        profitRate: totalRevenue ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
        yearly,
        monthly,
        daily,
        weekly,
        weekday,
        monthlyBasis: metas.map(meta => summaryOf(meta).monthlyBasis).find(Boolean) || '마감월',
        topGroups: mergeNamedMetricList(metas.map(meta => summaryOf(meta).topGroups || []), totalRevenue, 30),
        breakdowns: mergeBreakdowns(metas, totalRevenue),
        strategicSegments: mergeStrategicSegments(metas, totalRevenue),
        vehiclePerformance: mergeVehiclePerformance(metas, totalRevenue),
        detected: mergeDetectedColumns(metas),
        amountQuality: mergeQualityObjects(metas, 'amountQuality'),
        dateQuality: mergeQualityObjects(metas, 'dateQuality'),
        vehicleDataQuality: mergeQualityObjects(metas, 'vehicleDataQuality'),
        ledgerValidation: mergeLedgerValidation(metas, totalRows),
        sourceFiles,
        annualFileCount: metas.length,
        currentSnapshotId: snapshotIds[0] || '',
        currentSnapshotIds: snapshotIds,
        currentSelectionMode: 'annual.allCurrentSnapshots',
        importMode: metas.length > 1 ? 'annual-multi-current' : (summaryOf(metas[0]).importMode || 'supabase'),
    };
    summary.periodStart = monthly[0]?.period || sourceFiles.map(item => item.periodStart).filter(Boolean).sort()[0] || '';
    summary.periodEnd = monthly[monthly.length - 1]?.period || sourceFiles.map(item => item.periodEnd).filter(Boolean).sort().at(-1) || '';
    return summary;
}

async function annualDashboardSourceState() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from('branch_performance_files')
        .select('file_path,sheet_name,row_count,current_row_count,file_modified_at,synced_at,summary')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'annual');
    if (error) throw new Error(error.message);
    const metas = (data || [])
        .filter(meta => {
            const summary = summaryOf(meta);
            return numberValue(meta.current_row_count || meta.row_count || summary.totalRows) > 0
                && (summary.currentSnapshotId || summary.snapshotId || meta.current_row_count || meta.row_count);
        })
        .sort((a, b) => (
            String(a.file_path).localeCompare(String(b.file_path), 'ko-KR')
            || String(a.sheet_name).localeCompare(String(b.sheet_name), 'ko-KR')
        ));
    const signature = hashSnapshotSource({
        version: DASHBOARD_SNAPSHOT_VERSION,
        dataset: 'annual',
        metas: metas.map(meta => {
            const summary = summaryOf(meta);
            return {
                file_path: meta.file_path,
                sheet_name: meta.sheet_name,
                row_count: meta.row_count || 0,
                current_row_count: meta.current_row_count || 0,
                file_modified_at: meta.file_modified_at || '',
                synced_at: meta.synced_at || '',
                snapshot_id: summary.currentSnapshotId || summary.snapshotId || '',
            };
        }),
    });
    return {
        metas,
        signature,
        sourceSyncedAt: maxTimestamp(metas.map(meta => meta.synced_at || meta.file_modified_at)),
    };
}

function buildAnnualDashboardPayloadFromMetas(metas) {
    const headers = buildAnnualHeaders(metas);
    const summary = compactPerformanceDashboardSummary(mergeAnnualSummaries(metas), 'annual');
    const total = metas.reduce((sum, meta) => sum + numberValue(meta.current_row_count || meta.row_count || summaryOf(meta).totalRows), 0);
    if (!metas.length) {
        return {
            ...emptyPerformanceData({
                path: ANNUAL_AGGREGATE_PATH,
                sheetName: ANNUAL_AGGREGATE_SHEET,
                page: 1,
                pageSize: 0,
            }),
            headers,
            summary,
            source: 'supabase-dashboard-empty',
        };
    }
    return {
        headers,
        data: [],
        summary,
        file_path: ANNUAL_AGGREGATE_PATH,
        sheet_name: ANNUAL_AGGREGATE_SHEET,
        header_row: null,
        file_modified_at: maxTimestamp(metas.map(meta => meta.file_modified_at)),
        synced_at: maxTimestamp(metas.map(meta => meta.synced_at)),
        total,
        total_is_estimated: false,
        page: 1,
        page_size: 0,
        sort_key: '',
        sort_dir: 'asc',
        source: 'supabase-dashboard-build',
        read_path: 'meta-summary',
    };
}

export async function queryAsanAnnualPerformanceDashboardFromSupabase(searchParams) {
    const state = await annualDashboardSourceState();
    return withDashboardSnapshot({
        dashboardType: 'annual',
        scopeKey: 'aggregate:all',
        sourceSignature: state.signature,
        sourceSyncedAt: state.sourceSyncedAt,
        refresh: dashboardRefreshRequested(searchParams),
        buildPayload: async () => buildAnnualDashboardPayloadFromMetas(state.metas),
    });
}

async function queryAsanAnnualPerformanceAggregateFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const exportRequested = isPerformanceExportRequest(searchParams);
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, exportRequested ? 50000 : 5000);
    const search = (searchParams.get('search') || '').trim();
    const searchMode = (searchParams.get('search_mode') || 'or').trim().toLowerCase();
    const sortKey = (searchParams.get('sort_key') || '').trim();
    const sortDir = searchParams.get('sort_dir') || 'asc';

    const { data: allMetas, error: metaError } = await supabase
        .from('branch_performance_files')
        .select('*')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'annual');
    if (metaError) throw new Error(metaError.message);

    const metas = (allMetas || [])
        .filter(meta => {
            const summary = summaryOf(meta);
            return numberValue(meta.current_row_count || meta.row_count || summary.totalRows) > 0
                && (summary.currentSnapshotId || summary.snapshotId || meta.current_row_count || meta.row_count);
        })
        .sort((a, b) => {
            const sa = summaryOf(a);
            const sb = summaryOf(b);
            const aPeriod = sa.periodStart || sa.dateQuality?.minPeriod || sa.monthly?.[0]?.period || a.file_modified_at || '';
            const bPeriod = sb.periodStart || sb.dateQuality?.minPeriod || sb.monthly?.[0]?.period || b.file_modified_at || '';
            return String(aPeriod).localeCompare(String(bPeriod), 'ko-KR')
                || String(a.file_path).localeCompare(String(b.file_path), 'ko-KR')
                || String(a.sheet_name).localeCompare(String(b.sheet_name), 'ko-KR');
        });
    const headers = buildAnnualHeaders(metas);
    const summary = mergeAnnualSummaries(metas);

    if (!metas.length) {
        return {
            ...emptyPerformanceData({
                path: ANNUAL_AGGREGATE_PATH,
                sheetName: ANNUAL_AGGREGATE_SHEET,
                page,
                pageSize,
            }),
            headers,
            summary,
            source: 'supabase-empty',
        };
    }

    const snapshotIds = metas.map(meta => summaryOf(meta).currentSnapshotId || summaryOf(meta).snapshotId).filter(Boolean);
    const allMetasHaveSnapshot = snapshotIds.length === metas.length;
    const metaBySnapshot = new Map();
    for (const meta of metas) {
        const snapshotId = summaryOf(meta).currentSnapshotId || summaryOf(meta).snapshotId;
        if (snapshotId) metaBySnapshot.set(snapshotId, meta);
        metaBySnapshot.set(`${meta.file_path}::${meta.sheet_name}`, meta);
    }
    const fallbackTotal = search ? 0 : metas.reduce((sum, meta) => sum + numberValue(meta.current_row_count || meta.row_count || summaryOf(meta).totalRows), 0);
    const buildRowsQuery = () => {
        let rowsQuery = supabase
            .from('branch_performance_rows')
            .select('row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id')
            .eq('branch_id', 'asan')
            .eq('dataset_type', 'annual');
        if (allMetasHaveSnapshot) {
            rowsQuery = rowsQuery.in('snapshot_id', snapshotIds);
        } else {
            rowsQuery = rowsQuery.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
        }
        return rowsQuery;
    };
    const query = buildRowsQuery();
    const paged = await getAnnualPagedRows({
        query,
        buildQuery: buildRowsQuery,
        headers,
        metaBySnapshot,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: exportRequested ? 49999 : 19999,
        fallbackTotal,
        orderBySnapshot: allMetasHaveSnapshot,
        search,
        searchMode,
    });

    return {
        headers,
        data: paged.rows.map(row => row.mapped_values || annualRowToValues(row, headers)),
        summary,
        file_path: ANNUAL_AGGREGATE_PATH,
        sheet_name: ANNUAL_AGGREGATE_SHEET,
        header_row: null,
        file_modified_at: metas.reduce((latest, meta) => (
            !latest || new Date(meta.file_modified_at || 0) > new Date(latest) ? meta.file_modified_at : latest
        ), ''),
        synced_at: metas.reduce((latest, meta) => (
            !latest || new Date(meta.synced_at || 0) > new Date(latest) ? meta.synced_at : latest
        ), ''),
        total: paged.total ?? fallbackTotal,
        total_is_estimated: Boolean(paged.totalEstimated),
        page,
        page_size: pageSize,
        sort_key: paged.sortKey,
        sort_dir: paged.sortDir,
        source: 'supabase',
        read_path: 'next-direct',
    };
}

async function queryAsanAnnualPerformanceFileFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const normalizedPath = normalizePerformancePath(searchParams.get('path'));
    const sheetName = searchParams.get('sheet_name') || DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET;
    const exportRequested = isPerformanceExportRequest(searchParams);
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, exportRequested ? 50000 : 5000);
    const search = (searchParams.get('search') || '').trim();
    const searchMode = (searchParams.get('search_mode') || 'or').trim().toLowerCase();
    const sortKey = (searchParams.get('sort_key') || '').trim();
    const sortDir = searchParams.get('sort_dir') || 'asc';

    const { data: metas, error: metaError } = await supabase
        .from('branch_performance_files')
        .select('*')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'annual')
        .eq('file_path', normalizedPath)
        .eq('sheet_name', sheetName)
        .limit(1);
    if (metaError) throw new Error(metaError.message);

    const meta = metas?.[0];
    if (!meta) {
        return emptyPerformanceData({
            path: normalizedPath,
            sheetName,
            page,
            pageSize,
        });
    }

    const headers = Array.isArray(meta.headers) ? meta.headers : [];
    const summary = meta.summary && typeof meta.summary === 'object' ? meta.summary : {};
    const currentSnapshotId = summary.currentSnapshotId || summary.snapshotId || '';
    const buildQuery = (options = {}) => {
        const selectOptions = options.count ? { count: options.count } : undefined;
        let query = supabase
            .from('branch_performance_rows')
            .select('row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id', selectOptions)
            .eq('branch_id', 'asan')
            .eq('dataset_type', 'annual')
            .eq('file_path', normalizedPath)
            .eq('sheet_name', meta.sheet_name || sheetName);
        if (currentSnapshotId) {
            query = query.eq('snapshot_id', currentSnapshotId);
        } else {
            query = query.eq('is_current', true);
        }
        return { query };
    };

    const paged = await getPagedRows({
        buildQuery,
        headers,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: exportRequested ? 49999 : 19999,
        fallbackTotal: search ? 0 : meta.current_row_count || meta.row_count || 0,
        search,
        searchMode,
    });

    return {
        headers,
        data: paged.rows.map(row => row.row_values || []),
        summary,
        file_path: meta.file_path,
        sheet_name: meta.sheet_name,
        header_row: meta.header_row,
        file_modified_at: meta.file_modified_at,
        synced_at: meta.synced_at,
        total: paged.total ?? meta.current_row_count ?? 0,
        total_is_estimated: Boolean(paged.totalEstimated),
        page,
        page_size: pageSize,
        sort_key: paged.sortKey,
        sort_dir: paged.sortDir,
        source: 'supabase',
        read_path: 'next-direct',
    };
}

export async function queryAsanAnnualPerformanceFromSupabase(searchParams) {
    if (shouldAggregateAnnualPerformance(searchParams)) {
        return queryAsanAnnualPerformanceAggregateFromSupabase(searchParams);
    }
    return queryAsanAnnualPerformanceFileFromSupabase(searchParams);
}

function monthlyPeriodKey(year, month) {
    const y = Number.parseInt(year, 10);
    const m = Number.parseInt(month, 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return '';
    return `${y}-${String(m).padStart(2, '0')}`;
}

function metaSourcePeriod(meta = {}) {
    const summary = meta.summary && typeof meta.summary === 'object' ? meta.summary : {};
    if (summary.sourcePeriod) return String(summary.sourcePeriod);
    return monthlyPeriodKey(summary.sourceYear, summary.sourceMonth);
}

function isMonthlyReportPrimaryReady(report = null) {
    if (!report?.hasReportRows) return false;
    if (report.quality && report.quality.primaryReady === false) return false;
    const totals = report.totals || {};
    const revenue = Number(totals.netRevenue || 0) || 0;
    const purchase = Number(totals.netPurchase || 0) || 0;
    const profit = Number(totals.netProfit || 0) || 0;
    return Boolean(revenue && (purchase || profit));
}

function mergeMonthlySummaries(metas, monthlyFileSlots) {
    const monthly = new Map();
    const daily = new Map();
    const yearly = new Map();
    const monthlyReports = [];
    const incomingCarryover = blankCarryoverMetric('청구이월 반영분');
    const outgoingCarryover = blankCarryoverMetric('익월이월 발생분');
    const incomingCarryoverClients = new Map();
    const incomingCarryoverVendors = new Map();
    const outgoingCarryoverClients = new Map();
    const outgoingCarryoverVendors = new Map();
    const carryoverPeriods = [];
    const detected = {
        numericColumns: new Set(),
        revenueColumns: new Set(),
        purchaseColumns: new Set(),
        profitColumns: new Set(),
        groupColumns: new Set(),
    };
    let totalRows = 0;
    let analysisRows = 0;
    let totalRevenue = 0;
    let totalPurchase = 0;
    let totalProfit = 0;

    const addMetric = (period, seed = {}) => {
        if (!period) return null;
        if (!monthly.has(period)) {
            const [yearText, monthText] = period.split('-');
            monthly.set(period, {
                period,
                year: Number(yearText),
                month: Number(monthText),
                revenue: 0,
                purchase: 0,
                profit: 0,
                rowCount: 0,
                ...seed,
            });
        }
        return monthly.get(period);
    };

    for (const meta of metas) {
        const summary = meta.summary && typeof meta.summary === 'object' ? meta.summary : {};
        const sourcePeriod = metaSourcePeriod(meta);
        const report = summary.monthlyReport && typeof summary.monthlyReport === 'object' ? summary.monthlyReport : null;
        const carryoverCycle = normalizeCarryoverCycle(summary, report, sourcePeriod);
        const hasReport = Boolean(report?.hasReportRows);
        const hasPrimaryReport = isMonthlyReportPrimaryReady(report);
        const reportTotals = report?.totals || {};
        const reportRevenue = Number(reportTotals.netRevenue || 0) || 0;
        const reportPurchase = Number(reportTotals.netPurchase || 0) || 0;
        const reportProfit = Number(reportTotals.netProfit || 0) || 0;
        const metricRevenue = hasPrimaryReport ? reportRevenue : (Number(summary.totalRevenue || 0) || 0);
        const metricPurchase = hasPrimaryReport ? reportPurchase : (Number(summary.totalPurchase || 0) || 0);
        const metricProfit = hasPrimaryReport ? reportProfit : (Number(summary.totalProfit || 0) || 0);
        totalRows += Number(meta.current_row_count || meta.row_count || summary.totalRows || 0) || 0;
        analysisRows += Number(summary.analysisRows || meta.current_row_count || meta.row_count || 0) || 0;
        totalRevenue += metricRevenue;
        totalPurchase += metricPurchase;
        totalProfit += metricProfit;

        const sourceMetric = addMetric(sourcePeriod);
        if (sourceMetric) {
            sourceMetric.revenue += metricRevenue;
            sourceMetric.purchase += metricPurchase;
            sourceMetric.profit += metricProfit;
            sourceMetric.rowCount += Number(summary.analysisRows || meta.current_row_count || meta.row_count || 0) || 0;
            addCarryoverFieldsToMonthly(sourceMetric, carryoverCycle.incoming, carryoverCycle.outgoing);
        }

        addCarryoverMetric(incomingCarryover, carryoverCycle.incoming);
        addCarryoverMetric(outgoingCarryover, carryoverCycle.outgoing);
        addCarryoverParties(incomingCarryoverClients, carryoverCycle.incoming.clientItems);
        addCarryoverParties(incomingCarryoverVendors, carryoverCycle.incoming.vendorItems);
        addCarryoverParties(outgoingCarryoverClients, carryoverCycle.outgoing.clientItems);
        addCarryoverParties(outgoingCarryoverVendors, carryoverCycle.outgoing.vendorItems);
        carryoverPeriods.push({
            period: sourcePeriod,
            incoming: carryoverCycle.incoming,
            included: carryoverCycle.incoming,
            outgoing: carryoverCycle.outgoing,
            targetPeriods: carryoverCycle.targetPeriods || [],
        });

        if (hasReport && report && !(report.carryover?.revenue || report.carryover?.purchase) && (carryoverCycle.outgoing.revenue || carryoverCycle.outgoing.purchase)) {
            report.carryover = carryoverCycle.outgoing;
        }

        if (hasReport) {
            const nextReport = {
                ...report,
                period: report.period || sourcePeriod,
                filePath: meta.file_path,
                fileName: String(meta.file_path || '').split('/').filter(Boolean).pop() || meta.file_path,
            };
            monthlyReports.push(nextReport);
        }

        for (const item of summary.daily || []) {
            const date = String(item.date || '').trim();
            if (!date) continue;
            const dailyKey = `${sourcePeriod}::${date}`;
            if (!daily.has(dailyKey)) {
                daily.set(dailyKey, {
                    date,
                    period: sourcePeriod,
                    sourcePeriod,
                    workPeriod: date.slice(0, 7),
                    revenue: 0,
                    purchase: 0,
                    profit: 0,
                    rowCount: 0,
                });
            }
            const bucket = daily.get(dailyKey);
            bucket.revenue += Number(item.revenue || 0) || 0;
            bucket.purchase += Number(item.purchase || 0) || 0;
            bucket.profit += Number(item.profit || 0) || 0;
            bucket.rowCount += Number(item.rowCount || 0) || 0;
        }

        for (const key of Object.keys(detected)) {
            for (const value of summary.detected?.[key] || []) detected[key].add(value);
        }
    }

    const monthlyList = Array.from(monthly.values())
        .map(item => finalizeCarryoverFields({
            ...item,
            revenue: Math.round(item.revenue * 100) / 100,
            purchase: Math.round(item.purchase * 100) / 100,
            profit: Math.round(item.profit * 100) / 100,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    const incomingFinal = {
        ...normalizeCarryoverMetric(incomingCarryover, '청구이월 반영분'),
        clientItems: carryoverPartiesFromMap(incomingCarryoverClients),
        vendorItems: carryoverPartiesFromMap(incomingCarryoverVendors),
    };
    const outgoingFinal = {
        ...normalizeCarryoverMetric(outgoingCarryover, '익월이월 발생분'),
        clientItems: carryoverPartiesFromMap(outgoingCarryoverClients),
        vendorItems: carryoverPartiesFromMap(outgoingCarryoverVendors),
    };
    const carryoverCycle = {
        basis: '마감월',
        incoming: incomingFinal,
        included: incomingFinal,
        outgoing: outgoingFinal,
        netChange: normalizeCarryoverMetric({
            label: '이월 순증감',
            revenue: outgoingFinal.revenue - incomingFinal.revenue,
            purchase: outgoingFinal.purchase - incomingFinal.purchase,
            profit: outgoingFinal.profit - incomingFinal.profit,
            rowCount: outgoingFinal.rowCount - incomingFinal.rowCount,
        }),
        periods: carryoverPeriods.sort((a, b) => String(a.period).localeCompare(String(b.period), 'ko-KR')),
    };

    for (const item of monthlyList) {
        const yearKey = String(item.year || '미지정');
        if (!yearly.has(yearKey)) yearly.set(yearKey, { year: yearKey, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const bucket = yearly.get(yearKey);
        bucket.revenue += Number(item.revenue || 0) || 0;
        bucket.purchase += Number(item.purchase || 0) || 0;
        bucket.profit += Number(item.profit || 0) || 0;
        bucket.rowCount += Number(item.rowCount || 0) || 0;
    }

    return {
        totalRows,
        analysisRows,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPurchase: Math.round(totalPurchase * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        profitRate: totalRevenue ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
        yearly: Array.from(yearly.values()).sort((a, b) => String(a.year).localeCompare(String(b.year), 'ko-KR')),
        monthly: monthlyList,
        daily: Array.from(daily.values())
            .map(item => ({
                ...item,
                revenue: Math.round(item.revenue * 100) / 100,
                purchase: Math.round(item.purchase * 100) / 100,
                profit: Math.round(item.profit * 100) / 100,
            }))
            .sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')) || a.date.localeCompare(b.date)),
        monthlyBasis: '마감월',
        monthlyFileCount: metas.length,
        monthlyFileSlots,
        monthlyReports: monthlyReports.sort((a, b) => String(a.period || '').localeCompare(String(b.period || ''))),
        breakdowns: mergeBreakdowns(metas, totalRevenue),
        strategicSegments: mergeStrategicSegments(metas, totalRevenue),
        vehiclePerformance: mergeVehiclePerformance(metas, totalRevenue),
        carryover: outgoingFinal,
        carryoverCycle,
        detected: Object.fromEntries(Object.entries(detected).map(([key, set]) => [key, Array.from(set)])),
    };
}

function buildMonthlyHeaders(metas) {
    const seen = new Set(['마감월', '원본파일']);
    const headers = ['마감월', '원본파일'];
    for (const meta of metas) {
        for (const header of meta.headers || []) {
            if (seen.has(header)) continue;
            seen.add(header);
            headers.push(header);
        }
    }
    return headers;
}

function monthlyRowToValues(row, headers) {
    const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const period = monthlyPeriodKey(row.year_value, row.month_value);
    const fileName = String(row.file_path || '').split('/').filter(Boolean).pop() || row.file_path || '';
    return headers.map((header) => {
        if (header === '마감월') return period;
        if (header === '원본파일') return fileName;
        return rowData[header] ?? '';
    });
}

async function getMonthlyPagedRows({ query, buildQuery, headers, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0, search = '', searchMode = 'or' }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';
    const orderQuery = rowsQuery => rowsQuery
        .order('year_value', { ascending: true })
        .order('month_value', { ascending: true })
        .order('row_index', { ascending: true });
    const baseOrdered = orderQuery(query);
    const buildBaseOrdered = buildQuery ? () => orderQuery(buildQuery()) : null;
    const shouldFilter = searchTerms(search).length > 0;

    if (shouldFilter) {
        const scanned = await scanPerformanceSearchRows({
            baseOrdered,
            buildOrderedQuery: buildBaseOrdered,
            mapRow: item => ({ ...item, mapped_values: monthlyRowToValues(item, headers) }),
            search,
            searchMode,
            start,
            end,
            sortIdx,
            sortDesc,
        });
        return {
            rows: scanned.rows,
            total: scanned.total,
            totalEstimated: scanned.totalEstimated,
            sortKey: sortIdx >= 0 ? sortKey : '',
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    if (sortIdx >= 0) {
        const { data, error } = await baseOrdered.range(0, maxSortRows);
        if (error) throw new Error(error.message);
        const mappedRows = (data || []).map(item => ({ ...item, mapped_values: monthlyRowToValues(item, headers) }));
        const sortable = [];
        const blanks = [];
        for (const item of mappedRows) {
            const value = sortValue(item.mapped_values?.[sortIdx]);
            if (!value) blanks.push(item);
            else sortable.push([value, item]);
        }
        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc
            ? sortable.map(([, item]) => item).concat(blanks)
            : blanks.concat(sortable.map(([, item]) => item));
        return {
            rows: ordered.slice(start, end + 1),
            total: Math.max(fallbackTotal, ordered.length),
            sortKey,
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    const { data, error } = await baseOrdered.range(start, end + 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const loadedThrough = start + pageRows.length;
    return {
        rows: pageRows.map(item => ({ ...item, mapped_values: monthlyRowToValues(item, headers) })),
        total: Math.max(Number(fallbackTotal) || 0, loadedThrough + (hasMore ? 1 : 0)),
        totalEstimated: hasMore && !(Number(fallbackTotal) || 0),
        sortKey: '',
        sortDir: sortDesc ? 'desc' : 'asc',
    };
}

async function monthlyDashboardSourceState(searchParams) {
    const supabase = getSupabaseAdmin();
    const defaultYear = new Date().getFullYear();
    const baseYear = parsePositiveInt(searchParams.get('year'), defaultYear, 2100);
    const extraMonths = parsePositiveInt(searchParams.get('extra_months'), 3, 12);
    const periodSet = new Set(buildMonthlyPerformancePeriods(baseYear, extraMonths).map(item => item.period));
    const { data, error } = await supabase
        .from('branch_performance_files')
        .select(MONTHLY_META_SELECT)
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'monthly');
    if (error) throw new Error(error.message);
    const metas = (data || [])
        .filter(meta => periodSet.has(metaSourcePeriod(meta)))
        .sort((a, b) => metaSourcePeriod(a).localeCompare(metaSourcePeriod(b)) || String(a.file_path).localeCompare(String(b.file_path), 'ko-KR'));
    const signature = hashSnapshotSource({
        version: DASHBOARD_SNAPSHOT_VERSION,
        dataset: 'monthly',
        baseYear,
        extraMonths,
        metas: metas.map(meta => {
            const summary = summaryOf(meta);
            return {
                period: metaSourcePeriod(meta),
                file_path: meta.file_path,
                sheet_name: meta.sheet_name,
                row_count: meta.row_count || 0,
                current_row_count: meta.current_row_count || 0,
                file_modified_at: meta.file_modified_at || '',
                synced_at: meta.synced_at || '',
                snapshot_id: summary.currentSnapshotId || summary.snapshotId || '',
            };
        }),
    });
    return {
        baseYear,
        extraMonths,
        metas,
        monthlyFileSlots: buildMonthlyPerformanceFileSlots(baseYear, { extraMonths }),
        signature,
        sourceSyncedAt: maxTimestamp(metas.map(meta => meta.synced_at || meta.file_modified_at)),
    };
}

function buildMonthlyDashboardPayloadFromMetas({ metas, baseYear, extraMonths, monthlyFileSlots }) {
    const headers = buildMonthlyHeaders(metas);
    const summary = compactPerformanceDashboardSummary(mergeMonthlySummaries(metas, monthlyFileSlots), 'monthly');
    const fallbackTotal = metas.reduce((sum, meta) => sum + (Number(meta.current_row_count || meta.row_count || 0) || 0), 0);
    if (!metas.length) {
        return {
            ...emptyPerformanceData({
                path: '/아산지점/B_총무/C_마감',
                sheetName: '월간실적',
                page: 1,
                pageSize: 0,
            }),
            headers,
            summary,
            base_year: baseYear,
            extra_months: extraMonths,
            monthlyFileSlots,
            source: 'supabase-dashboard-empty',
        };
    }
    return {
        headers,
        data: [],
        summary,
        file_path: '/아산지점/B_총무/C_마감',
        sheet_name: '월간실적',
        header_row: null,
        file_modified_at: maxTimestamp(metas.map(meta => meta.file_modified_at)),
        synced_at: maxTimestamp(metas.map(meta => meta.synced_at)),
        total: fallbackTotal,
        total_is_estimated: false,
        page: 1,
        page_size: 0,
        sort_key: '',
        sort_dir: 'asc',
        source: 'supabase-dashboard-build',
        read_path: 'meta-summary',
        base_year: baseYear,
        extra_months: extraMonths,
        monthlyFileSlots,
    };
}

export async function queryAsanMonthlyPerformanceDashboardFromSupabase(searchParams) {
    const params = cleanDashboardParams(searchParams);
    const state = await monthlyDashboardSourceState(params);
    return withDashboardSnapshot({
        dashboardType: 'monthly',
        scopeKey: `year:${state.baseYear}:extra:${state.extraMonths}`,
        sourceSignature: state.signature,
        sourceSyncedAt: state.sourceSyncedAt,
        refresh: dashboardRefreshRequested(searchParams),
        buildPayload: async () => buildMonthlyDashboardPayloadFromMetas(state),
    });
}

export async function queryAsanSummaryPerformanceDashboardFromSupabase(searchParams, buildExecutiveSummary, compactSource) {
    const annualParams = cleanDashboardParams(searchParams);
    annualParams.set('aggregate', 'all');
    const monthlyParams = cleanDashboardParams(searchParams);
    monthlyParams.delete('aggregate');
    const [annualState, monthlyState] = await Promise.all([
        annualDashboardSourceState(),
        monthlyDashboardSourceState(monthlyParams),
    ]);
    const scopeKey = `year:${monthlyState.baseYear}:extra:${monthlyState.extraMonths}`;
    const sourceSignature = hashSnapshotSource({
        version: DASHBOARD_SNAPSHOT_VERSION,
        dataset: 'summary',
        annual: annualState.signature,
        monthly: monthlyState.signature,
    });

    return withDashboardSnapshot({
        dashboardType: 'summary',
        scopeKey,
        sourceSignature,
        sourceSyncedAt: maxTimestamp([annualState.sourceSyncedAt, monthlyState.sourceSyncedAt]),
        refresh: dashboardRefreshRequested(searchParams),
        buildPayload: async () => {
            const [annual, monthly] = await Promise.all([
                queryAsanAnnualPerformanceDashboardFromSupabase(annualParams),
                queryAsanMonthlyPerformanceDashboardFromSupabase(monthlyParams),
            ]);
            return {
                summary: buildExecutiveSummary({ annual, monthly }),
                annual: compactSource(annual),
                monthly: compactSource(monthly),
            };
        },
    });
}

export async function queryAsanSummaryPerformanceDashboardViewFromSupabase(searchParams, buildExecutiveSummary, compactSource, buildDashboardView) {
    const monthlyParams = cleanDashboardParams(searchParams);
    monthlyParams.delete('aggregate');
    const [annualState, monthlyState] = await Promise.all([
        annualDashboardSourceState(),
        monthlyDashboardSourceState(monthlyParams),
    ]);
    const baseScopeKey = `year:${monthlyState.baseYear}:extra:${monthlyState.extraMonths}`;
    const baseSignature = hashSnapshotSource({
        version: DASHBOARD_SNAPSHOT_VERSION,
        dataset: 'summary',
        annual: annualState.signature,
        monthly: monthlyState.signature,
    });
    const scope = summaryDashboardViewScope(searchParams);
    const scopeKey = `${baseScopeKey}:${summaryDashboardViewScopeKey(scope)}`;
    const sourceSignature = hashSnapshotSource({
        version: DASHBOARD_SNAPSHOT_VERSION,
        dataset: 'summary-view',
        baseSignature,
        scope,
    });

    return withDashboardSnapshot({
        dashboardType: 'summary-view',
        scopeKey,
        sourceSignature,
        sourceSyncedAt: maxTimestamp([annualState.sourceSyncedAt, monthlyState.sourceSyncedAt]),
        refresh: dashboardRefreshRequested(searchParams),
        buildPayload: async () => {
            const full = await queryAsanSummaryPerformanceDashboardFromSupabase(
                searchParams,
                buildExecutiveSummary,
                compactSource,
            );
            return {
                summary: buildDashboardView(full.summary, scope),
                annual: full.annual,
                monthly: full.monthly,
            };
        },
    });
}

export async function queryAsanMonthlyPerformanceFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const defaultYear = new Date().getFullYear();
    const baseYear = parsePositiveInt(searchParams.get('year'), defaultYear, 2100);
    const extraMonths = parsePositiveInt(searchParams.get('extra_months'), 3, 12);
    const exportRequested = isPerformanceExportRequest(searchParams);
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, exportRequested ? 50000 : 5000);
    const search = (searchParams.get('search') || '').trim();
    const searchMode = (searchParams.get('search_mode') || 'or').trim().toLowerCase();
    const sortKey = (searchParams.get('sort_key') || '').trim();
    const sortDir = searchParams.get('sort_dir') || 'asc';
    const monthlyFileSlots = buildMonthlyPerformanceFileSlots(baseYear, { extraMonths });
    const periodSet = new Set(buildMonthlyPerformancePeriods(baseYear, extraMonths).map(item => item.period));

    const { data: allMetas, error: metaError } = await supabase
        .from('branch_performance_files')
        .select(MONTHLY_META_SELECT)
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'monthly');
    if (metaError) throw new Error(metaError.message);

    const metas = (allMetas || [])
        .filter(meta => periodSet.has(metaSourcePeriod(meta)))
        .sort((a, b) => metaSourcePeriod(a).localeCompare(metaSourcePeriod(b)) || String(a.file_path).localeCompare(String(b.file_path), 'ko-KR'));
    const headers = buildMonthlyHeaders(metas);
    const summary = mergeMonthlySummaries(metas, monthlyFileSlots);

    if (!metas.length) {
        return {
            ...emptyPerformanceData({
                path: '/아산지점/B_총무/C_마감',
                sheetName: '월간실적',
                page,
                pageSize,
            }),
            headers,
            summary,
            base_year: baseYear,
            extra_months: extraMonths,
            monthlyFileSlots,
        };
    }

    const snapshotIds = metas
        .map(meta => meta.summary?.currentSnapshotId || meta.summary?.snapshotId)
        .filter(Boolean);
    const usesDiffCurrent = metas.some(meta => (
        meta.summary?.importMode === 'diff-current' || meta.summary?.currentSelectionMode === 'is_current'
    ));
    const fallbackTotal = metas.reduce((sum, meta) => sum + (Number(meta.current_row_count || meta.row_count || 0) || 0), 0);
    const buildRowsQuery = () => {
        let rowsQuery = supabase
            .from('branch_performance_rows')
            .select('row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id')
            .eq('branch_id', 'asan')
            .eq('dataset_type', 'monthly');
        if (usesDiffCurrent) {
            rowsQuery = rowsQuery.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
        } else if (snapshotIds.length) {
            rowsQuery = rowsQuery.in('snapshot_id', snapshotIds);
        } else {
            rowsQuery = rowsQuery.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
        }
        return rowsQuery;
    };
    const query = buildRowsQuery();
    const paged = await getMonthlyPagedRows({
        query,
        buildQuery: buildRowsQuery,
        headers,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: exportRequested ? 49999 : 19999,
        fallbackTotal,
        search,
        searchMode,
    });

    return {
        headers,
        data: paged.rows.map(row => row.mapped_values || monthlyRowToValues(row, headers)),
        summary,
        file_path: '/아산지점/B_총무/C_마감',
        sheet_name: '월간실적',
        header_row: null,
        file_modified_at: metas.reduce((latest, meta) => (
            !latest || new Date(meta.file_modified_at || 0) > new Date(latest) ? meta.file_modified_at : latest
        ), ''),
        synced_at: metas.reduce((latest, meta) => (
            !latest || new Date(meta.synced_at || 0) > new Date(latest) ? meta.synced_at : latest
        ), ''),
        total: paged.total ?? fallbackTotal,
        total_is_estimated: Boolean(paged.totalEstimated),
        page,
        page_size: pageSize,
        sort_key: paged.sortKey,
        sort_dir: paged.sortDir,
        source: 'supabase',
        read_path: 'next-direct',
        base_year: baseYear,
        extra_months: extraMonths,
        monthlyFileSlots,
    };
}
