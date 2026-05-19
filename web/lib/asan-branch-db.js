import { createClient } from '@supabase/supabase-js';
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
    normalized = normalized.replace(/^\/volume[12]\//, '/');
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
    const fallbackCount = Math.max(Number(fallbackTotal) || 0, loadedThrough + (hasMore ? 1 : 0));
    return {
        rows: pageRows,
        total: count ?? fallbackCount,
        totalEstimated: count == null && hasMore && !(Number(fallbackTotal) || 0),
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
                yearly: [],
                weekday: [],
            }, item);
            bucket.monthly = mergeInlineSeries(bucket.monthly, item.monthly, 'period');
            bucket.yearly = mergeInlineSeries(bucket.yearly, item.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, item.weekday, 'day');
        }
    }
    return Array.from(map.values())
        .map(item => finalizeMetricItem(item, totalRevenue))
        .sort((a, b) => Math.abs(numberValue(b.revenue)) - Math.abs(numberValue(a.revenue)))
        .slice(0, limit);
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

function mergeBreakdowns(metas, totalRevenue) {
    const sections = new Map();
    for (const meta of metas) {
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
            bucket.items.push(...(section.items || []));
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
            bucket.monthly = mergeInlineSeries(bucket.monthly, segment.monthly, 'period');
            bucket.yearly = mergeInlineSeries(bucket.yearly, segment.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, segment.weekday, 'day');
            bucket.topWorkSites = mergeNamedMetricList([bucket.topWorkSites, segment.topWorkSites], totalRevenue, 12);
            bucket.topClients = mergeNamedMetricList([bucket.topClients, segment.topClients], totalRevenue, 12);
            bucket.topRoutes = mergeNamedMetricList([bucket.topRoutes, segment.topRoutes], totalRevenue, 12);
            bucket.topCategories = mergeNamedMetricList([bucket.topCategories, segment.topCategories], totalRevenue, 12);
            bucket.topPickups = mergeNamedMetricList([bucket.topPickups, segment.topPickups], totalRevenue, 12);
        }
    }
    const order = ['own_direct', 'els_solution', 'outsourced', 'unclassified'];
    return Array.from(segments.values())
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
        for (const vehicle of summaryOf(meta).vehiclePerformance || []) {
            const key = String(vehicle.vehicleNo || vehicle.name || vehicle.label || '').trim();
            if (!key) continue;
            if (!vehicles.has(key)) {
                vehicles.set(key, {
                    ...vehicle,
                    name: vehicle.name || key,
                    vehicleNo: vehicle.vehicleNo || key,
                    driverSet: new Set(),
                    revenue: 0,
                    purchase: 0,
                    profit: 0,
                    rowCount: 0,
                    monthly: [],
                    yearly: [],
                    weekday: [],
                });
            }
            const bucket = vehicles.get(key);
            addMetricFields(bucket, vehicle);
            bucket.monthly = mergeInlineSeries(bucket.monthly, vehicle.monthly, 'period');
            bucket.yearly = mergeInlineSeries(bucket.yearly, vehicle.yearly, 'year');
            bucket.weekday = mergeInlineSeries(bucket.weekday, vehicle.weekday, 'day');
            String(vehicle.drivers || '').split(',').map(item => item.trim()).filter(Boolean).forEach(driver => bucket.driverSet.add(driver));
        }
    }
    return Array.from(vehicles.values())
        .map((item) => {
            const finalized = finalizeMetricItem(item, totalRevenue);
            finalized.drivers = Array.from(item.driverSet || []).slice(0, 5).join(', ');
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

async function getAnnualPagedRows({ query, headers, metaBySnapshot, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0 }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';
    const baseOrdered = query
        .order('year_value', { ascending: true, nullsFirst: false })
        .order('month_value', { ascending: true, nullsFirst: false })
        .order('file_path', { ascending: true })
        .order('row_index', { ascending: true });
    const attachHeaders = row => ({
        ...row,
        source_headers: metaBySnapshot.get(row.snapshot_id)?.headers || metaBySnapshot.get(`${row.file_path}::${row.sheet_name}`)?.headers || [],
    });

    if (sortIdx >= 0) {
        const { data, error } = await baseOrdered.range(0, maxSortRows);
        if (error) throw new Error(error.message);
        const sortable = [];
        const blanks = [];
        for (const item of data || []) {
            const mapped = annualRowToValues(attachHeaders(item), headers);
            const value = sortValue(mapped[sortIdx]);
            if (!value) blanks.push({ ...item, mapped_values: mapped });
            else sortable.push([value, { ...item, mapped_values: mapped }]);
        }
        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc ? sortable.map(([, item]) => item).concat(blanks) : blanks.concat(sortable.map(([, item]) => item));
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

async function queryAsanAnnualPerformanceAggregateFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, 5000);
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
    let query = supabase
        .from('branch_performance_rows')
        .select('row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'annual');
    if (allMetasHaveSnapshot) {
        query = query.in('snapshot_id', snapshotIds);
    } else {
        query = query.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
    }
    query = applySearch(query, search, searchMode);

    const paged = await getAnnualPagedRows({
        query,
        headers,
        metaBySnapshot,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: 19999,
        fallbackTotal,
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
        total: paged.total || fallbackTotal,
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

function mergeMonthlySummaries(metas, monthlyFileSlots) {
    const monthly = new Map();
    const daily = new Map();
    const yearly = new Map();
    const monthlyReports = [];
    const carryover = { revenue: 0, purchase: 0, profit: 0 };
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
        const hasReport = Boolean(report?.hasReportRows);
        const reportTotals = report?.totals || {};
        const reportRevenue = Number(reportTotals.netRevenue || 0) || 0;
        const reportPurchase = Number(reportTotals.netPurchase || 0) || 0;
        const reportProfit = Number(reportTotals.netProfit || 0) || 0;
        const metricRevenue = hasReport ? reportRevenue : (Number(summary.totalRevenue || 0) || 0);
        const metricPurchase = hasReport ? reportPurchase : (Number(summary.totalPurchase || 0) || 0);
        const metricProfit = hasReport ? reportProfit : (Number(summary.totalProfit || 0) || 0);
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
        }

        if (hasReport) {
            const nextReport = {
                ...report,
                period: report.period || sourcePeriod,
                filePath: meta.file_path,
                fileName: String(meta.file_path || '').split('/').filter(Boolean).pop() || meta.file_path,
            };
            monthlyReports.push(nextReport);
            carryover.revenue += Number(report.carryover?.revenue || 0) || 0;
            carryover.purchase += Number(report.carryover?.purchase || 0) || 0;
            carryover.profit += Number(report.carryover?.profit || 0) || 0;
        }

        for (const item of summary.daily || []) {
            const date = String(item.date || '').trim();
            if (!date) continue;
            if (!daily.has(date)) {
                daily.set(date, {
                    date,
                    period: date.slice(0, 7),
                    revenue: 0,
                    purchase: 0,
                    profit: 0,
                    rowCount: 0,
                });
            }
            const bucket = daily.get(date);
            bucket.revenue += Number(item.revenue || 0) || 0;
            bucket.purchase += Number(item.purchase || 0) || 0;
            bucket.profit += Number(item.profit || 0) || 0;
            bucket.rowCount += Number(item.rowCount || 0) || 0;
        }

        for (const item of summary.monthly || []) {
            const period = String(item.period || '').trim();
            const metric = addMetric(period);
            if (!metric || period === sourcePeriod) continue;
            metric.revenue += Number(item.revenue || 0) || 0;
            metric.purchase += Number(item.purchase || 0) || 0;
            metric.profit += Number(item.profit || 0) || 0;
            metric.rowCount += Number(item.rowCount || 0) || 0;
        }

        for (const key of Object.keys(detected)) {
            for (const value of summary.detected?.[key] || []) detected[key].add(value);
        }
    }

    const monthlyList = Array.from(monthly.values())
        .map(item => ({
            ...item,
            revenue: Math.round(item.revenue * 100) / 100,
            purchase: Math.round(item.purchase * 100) / 100,
            profit: Math.round(item.profit * 100) / 100,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

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
            .sort((a, b) => a.date.localeCompare(b.date)),
        monthlyBasis: '파일월',
        monthlyFileCount: metas.length,
        monthlyFileSlots,
        monthlyReports: monthlyReports.sort((a, b) => String(a.period || '').localeCompare(String(b.period || ''))),
        carryover: {
            revenue: Math.round(carryover.revenue * 100) / 100,
            purchase: Math.round(carryover.purchase * 100) / 100,
            profit: Math.round(carryover.profit * 100) / 100,
        },
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

async function getMonthlyPagedRows({ query, headers, page, pageSize, sortKey, sortDir, maxSortRows, fallbackTotal = 0 }) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const sortIdx = headers.indexOf(sortKey);
    const sortDesc = String(sortDir || 'asc').toLowerCase() === 'desc';
    const baseOrdered = query
        .order('year_value', { ascending: true })
        .order('month_value', { ascending: true })
        .order('row_index', { ascending: true });

    if (sortIdx >= 0) {
        const { data, error } = await baseOrdered.range(0, maxSortRows);
        if (error) throw new Error(error.message);
        const sortable = [];
        const blanks = [];
        for (const item of data || []) {
            const values = monthlyRowToValues(item, headers);
            const value = sortValue(values[sortIdx]);
            if (!value) blanks.push({ ...item, mapped_values: values });
            else sortable.push([value, { ...item, mapped_values: values }]);
        }
        sortable.sort((a, b) => compareSortTuple(a[0], b[0]) * (sortDesc ? -1 : 1));
        const ordered = sortDesc ? sortable.map(([, item]) => item).concat(blanks) : blanks.concat(sortable.map(([, item]) => item));
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

export async function queryAsanMonthlyPerformanceFromSupabase(searchParams) {
    const supabase = getSupabaseAdmin();
    const defaultYear = new Date().getFullYear();
    const baseYear = parsePositiveInt(searchParams.get('year'), defaultYear, 2100);
    const extraMonths = parsePositiveInt(searchParams.get('extra_months'), 3, 12);
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(searchParams.get('page_size'), 500, 5000);
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
    let query = supabase
        .from('branch_performance_rows')
        .select('row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id')
        .eq('branch_id', 'asan')
        .eq('dataset_type', 'monthly');
    if (usesDiffCurrent) {
        query = query.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
    } else if (snapshotIds.length) {
        query = query.in('snapshot_id', snapshotIds);
    } else {
        query = query.eq('is_current', true).in('file_path', metas.map(meta => meta.file_path));
    }
    query = applySearch(query, search, searchMode);

    const paged = await getMonthlyPagedRows({
        query,
        headers,
        page,
        pageSize,
        sortKey,
        sortDir,
        maxSortRows: 19999,
        fallbackTotal,
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
        total: paged.total || fallbackTotal,
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
