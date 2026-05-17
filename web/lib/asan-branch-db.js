import { createClient } from '@supabase/supabase-js';
import { findWorkDateColumnIndex } from '@/utils/asanShippingView.mjs';

const DEFAULT_ASAN_SHIPPING_PATH = '/아산지점/2026_자체보관리스트.xlsx';
const DEFAULT_ASAN_ANNUAL_PERFORMANCE_PATH = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
const DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET = '합계';

let adminClient;

function getSupabaseAdmin() {
    if (adminClient) return adminClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Supabase 관리자 환경변수가 없습니다.');
    }
    adminClient = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
    return adminClient;
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
    if (normalized.startsWith('/B_총무/')) normalized = `/아산지점${normalized}`;
    return normalized;
}

function parsePositiveInt(value, fallback, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
}

function searchTerms(search) {
    return String(search || '').split(',').map(term => term.trim()).filter(Boolean);
}

function searchFilterValue(term) {
    return String(term || '').replace(/[,\\]/g, ' ');
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

async function getPagedRows({ query, headers, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0 }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';

    if (sortIdx >= 0) {
        const { data, count, error } = await query.order('row_index', { ascending: true }).range(0, maxSortRows);
        if (error) throw new Error(error.message);

        const sortable = [];
        const blanks = [];
        for (const item of data || []) {
            const row = item.row_values || [];
            const value = sortValue(row[sortIdx]);
            if (!value) blanks.push(item);
            else sortable.push([value, item]);
        }

        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc ? sortable.map(([, item]) => item).concat(blanks) : blanks.concat(sortable.map(([, item]) => item));
        return {
            rows: ordered.slice(start, end + 1),
            total: count ?? ordered.length,
            sortKey,
            sortDir: sortDesc ? 'desc' : 'asc',
        };
    }

    const { data, count, error } = await query.order('row_index', { ascending: true }).range(start, end + 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const loadedThrough = start + pageRows.length;
    return {
        rows: pageRows,
        total: count ?? Math.max(Number(fallbackTotal) || 0, loadedThrough + (hasMore ? 1 : 0)),
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
    let query = supabase
        .from('branch_shipping_rows')
        .select('row_values,row_index', { count: 'exact' })
        .eq('branch_id', 'asan')
        .eq('file_path', normalizedPath);
    query = applySearch(query, search, searchMode);
    const dateFilter = applyDateMonthFilter(query, { headers, dateCol, months });
    query = dateFilter.query;

    const paged = await getPagedRows({
        query,
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
        total: paged.total || meta.row_count || 0,
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

export async function queryAsanAnnualPerformanceFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const normalizedPath = normalizePerformancePath(searchParams.get('path'));
    const sheetName = searchParams.get('sheet_name') || DEFAULT_ASAN_ANNUAL_PERFORMANCE_SHEET;
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, 5000);
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
    let query = supabase
        .from('branch_performance_rows')
        .select('row_values,row_index')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'annual')
        .eq('file_path', normalizedPath)
        .eq('sheet_name', meta.sheet_name || sheetName);
    if (currentSnapshotId) {
        query = query.eq('snapshot_id', currentSnapshotId);
    } else {
        query = query.eq('is_current', true);
    }
    query = applySearch(query, search, searchMode);

    const paged = await getPagedRows({
        query,
        headers,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: 19999,
        fallbackTotal: search ? 0 : meta.current_row_count || meta.row_count || 0,
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
        total: paged.total || meta.current_row_count || 0,
        page,
        page_size: pageSize,
        sort_key: paged.sortKey,
        sort_dir: paged.sortDir,
        source: 'supabase',
        read_path: 'next-direct',
    };
}
