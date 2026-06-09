import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    buildAsanDashboardFinancialForecast,
    buildAsanDashboardPeriodOptions,
} from '@/utils/asanDashboardView.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DISPATCH_FORECAST_VIEW_TYPES = ['integrated', 'glovis', 'mobis'];
const DISPATCH_FORECAST_PERIODS = ['daily', 'weekly', 'monthly', 'total'];
const ROUTE_UNIT_CACHE_TABLE = 'branch_performance_monthly_route_unit_amount_cache';
const ROUTE_UNIT_CACHE_SELECT = [
    'key',
    'revenue_amount',
    'purchase_amount',
    'unit_profit',
    'sales_item',
    'region',
    'work_site',
    'carrier',
    'category',
    'pickup',
    'billing_pickup',
    'shipment',
    'type',
    'bill_to',
    'pay_to',
    'row_count',
    'revenue',
    'purchase',
    'profit',
    'period_start',
    'period_end',
    'periods',
    'total_group_count',
    'total_row_count',
    'total_revenue',
    'total_purchase',
    'total_profit',
].join(',');

let adminClient;

function getSupabaseAdminClient() {
    if (adminClient) return adminClient;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
    return adminClient;
}

function normalizeViewType(value = 'integrated') {
    const type = String(value || 'integrated').trim().toLowerCase();
    return DISPATCH_FORECAST_VIEW_TYPES.includes(type) ? type : 'integrated';
}

function normalizePeriod(value = 'daily') {
    const period = String(value || 'daily').trim().toLowerCase();
    return DISPATCH_FORECAST_PERIODS.includes(period) ? period : 'daily';
}

function resolveOptionKey(options = [], requested = '', fallback = '') {
    if (!requested) return fallback;
    if (options.some((option) => option.key === requested)) return requested;
    const monthLike = String(requested).padStart(2, '0');
    const monthMatch = options.filter((option) => option.key.endsWith(`-${monthLike}`));
    return monthMatch[monthMatch.length - 1]?.key || fallback;
}

function findWeekOptionForDate(weeks = [], dateKey = '') {
    return weeks.find((week) => dateKey >= week.start && dateKey <= week.end) || null;
}

function numberValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? '').replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRouteText(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || '';
}

async function withTiming(timings, key, task) {
    const startedAt = Date.now();
    try {
        return await task();
    } finally {
        if (timings && key) timings[key] = Date.now() - startedAt;
    }
}

async function loadDispatchItems(request, viewType, { mode = 'date', date = '', from = '', to = '' } = {}) {
    const url = new URL(request.url);
    url.pathname = '/api/branches/asan/dispatch';
    const params = new URLSearchParams({
        type: viewType,
        mode,
        t: String(Date.now()),
    });
    if (date) params.set('date', date);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    url.search = params.toString();

    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
        throw new Error(payload.error || '배차 원장 조회 실패');
    }
    return payload.data || [];
}

async function findLatestRouteUnitMonth(supabase) {
    const { data, error } = await supabase
        .from(ROUTE_UNIT_CACHE_TABLE)
        .select('filter_year,filter_month,period_end')
        .eq('branch_id', 'asan')
        .eq('scope_mode', 'month')
        .order('filter_year', { ascending: false })
        .order('filter_month', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) return null;
    const year = Number(data?.filter_year || 0);
    const month = Number(data?.filter_month || 0);
    if (!year || !month) return null;
    return {
        year,
        month,
        key: `${year}-${String(month).padStart(2, '0')}`,
        label: data?.period_end || `${year}-${String(month).padStart(2, '0')} 마감월`,
    };
}

function routeUnitCacheRowsToPrice(payload = {}, scope = {}) {
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.groups) ? payload.groups : []);
    const totalsSource = Array.isArray(payload) ? rows[0] || {} : payload;
    const groups = rows.map((row) => {
        const revenueAmount = numberValue(row.revenue_amount);
        const purchaseAmount = numberValue(row.purchase_amount);
        const periods = Array.isArray(row.periods) ? row.periods.filter(Boolean).sort() : [];
        return {
            key: row.key || [revenueAmount, purchaseAmount, row.sales_item, row.region, row.work_site, row.carrier, row.category, row.pickup, row.billing_pickup, row.shipment, row.type, row.bill_to, row.pay_to].join('||'),
            revenueAmount,
            purchaseAmount,
            unitRevenue: revenueAmount,
            unitPurchase: purchaseAmount,
            unitProfit: revenueAmount - purchaseAmount,
            salesItem: normalizeRouteText(row.sales_item),
            region: normalizeRouteText(row.region),
            workSite: normalizeRouteText(row.work_site),
            carrier: normalizeRouteText(row.carrier),
            category: normalizeRouteText(row.category),
            pickup: normalizeRouteText(row.pickup),
            billingPickup: normalizeRouteText(row.billing_pickup),
            shipment: normalizeRouteText(row.shipment),
            type: normalizeRouteText(row.type),
            billTo: normalizeRouteText(row.bill_to),
            payTo: normalizeRouteText(row.pay_to),
            rowCount: numberValue(row.row_count),
            revenue: numberValue(row.revenue),
            purchase: numberValue(row.purchase),
            profit: numberValue(row.profit),
            periods,
            periodLabel: periods.length ? (periods.length === 1 ? periods[0] : `${periods[0]} ~ ${periods[periods.length - 1]}`) : '-',
            unitBasis: 'monthly-amount-cache',
        };
    });
    return {
        scope,
        basis: '월간 금액표',
        datasetBasis: '월간 마감자료 current 원장',
        engine: 'supabase-direct-monthly-amount-cache',
        groups,
        totals: {
            revenue: numberValue(totalsSource.total_revenue),
            purchase: numberValue(totalsSource.total_purchase),
            profit: numberValue(totalsSource.total_profit),
            rowCount: numberValue(totalsSource.total_row_count),
        },
        summary: {
            periodStart: rows[0]?.period_start || '',
            periodEnd: rows[0]?.period_end || scope.month || '',
            groupCount: numberValue(totalsSource.total_group_count || groups.length),
            returnedGroupCount: groups.length,
            truncated: numberValue(totalsSource.total_group_count) > groups.length,
        },
    };
}

async function loadForecastSourceItems(request, viewType, { selectedDay = '', selectedWeek = '', selectedMonth = '', timings = null } = {}) {
    const metaItems = await withTiming(timings, 'dispatchMetaMs', () => loadDispatchItems(request, viewType, { mode: 'meta' }));
    const options = buildAsanDashboardPeriodOptions(metaItems);
    const latestDate = options.dates[options.dates.length - 1]?.key || selectedDay || '';
    const dayKey = resolveOptionKey(options.dates, selectedDay, latestDate);
    const currentWeekKey = findWeekOptionForDate(options.weeks, dayKey)?.key || options.weeks[options.weeks.length - 1]?.key || '';
    const weekKey = resolveOptionKey(options.weeks, selectedWeek, currentWeekKey);
    const weekOption = options.weeks.find((option) => option.key === weekKey) || null;
    const currentMonthKey = dayKey ? dayKey.slice(0, 7) : options.months[options.months.length - 1]?.key || '';
    const monthKey = resolveOptionKey(options.months, selectedMonth, currentMonthKey);
    const dateKeys = new Set();
    if (dayKey) dateKeys.add(dayKey);
    (options.dates || []).forEach((option) => {
        if (weekOption && option.key >= weekOption.start && option.key <= weekOption.end) dateKeys.add(option.key);
        if (monthKey && option.key.startsWith(monthKey)) dateKeys.add(option.key);
    });

    const sortedDateKeys = [...dateKeys].sort();
    const rangeItems = sortedDateKeys.length
        ? await withTiming(timings, 'dispatchRangeMs', () => loadDispatchItems(request, viewType, {
            mode: 'range',
            from: sortedDateKeys[0],
            to: sortedDateKeys[sortedDateKeys.length - 1],
        }))
        : [];
    return {
        sourceItems: rangeItems.filter((item) => item?.target_date),
        selectedDay: dayKey,
        selectedWeek: weekKey,
        selectedMonth: monthKey,
        sourceDateCount: dateKeys.size,
        metaDateCount: options.dates.length,
    };
}

async function loadLatestRouteUnitPrice(timings = null) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return null;
    const latest = await withTiming(timings, 'routeUnitLatestMs', () => findLatestRouteUnitMonth(supabase));
    const scope = latest
        ? { mode: 'month', year: String(latest.year), month: latest.key, label: latest.label }
        : { mode: 'all', year: '', month: '', label: '전체 기간' };
    const request = supabase
        .from(ROUTE_UNIT_CACHE_TABLE)
        .select(ROUTE_UNIT_CACHE_SELECT)
        .eq('branch_id', 'asan')
        .eq('scope_mode', latest ? 'month' : 'all')
        .eq('filter_year', latest?.year || 0)
        .eq('filter_month', latest?.month || 0)
        .order('rank_order', { ascending: true })
        .limit(10000);
    const executable = typeof request.abortSignal === 'function' && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? request.abortSignal(AbortSignal.timeout(4000))
        : request;
    const rows = await withTiming(timings, 'routeUnitRowsMs', async () => {
        const { data, error } = await executable;
        if (error) return null;
        return data || [];
    });
    if (!rows) return null;
    return routeUnitCacheRowsToPrice(rows, scope);
}

export async function GET(request) {
    try {
        const startedAt = Date.now();
        const { searchParams } = new URL(request.url);
        const timings = {};
        const viewType = normalizeViewType(searchParams.get('type'));
        const activePeriod = normalizePeriod(searchParams.get('activePeriod'));
        const selectedDay = String(searchParams.get('activeDate') || '').trim();
        const selectedWeek = String(searchParams.get('selectedWeek') || '').trim();
        const selectedMonth = String(searchParams.get('selectedMonth') || '').trim();
        const [sourceState, routeUnitPrice] = await Promise.all([
            loadForecastSourceItems(request, viewType, { selectedDay, selectedWeek, selectedMonth, timings }),
            loadLatestRouteUnitPrice(timings),
        ]);
        const forecast = await withTiming(timings, 'computeMs', async () => buildAsanDashboardFinancialForecast({
            sourceItems: sourceState.sourceItems,
            viewType,
            routeUnitPrice,
            selectedDay: sourceState.selectedDay,
            selectedWeek: sourceState.selectedWeek,
            selectedMonth: sourceState.selectedMonth,
            activePeriod,
        }));
        timings.totalMs = Date.now() - startedAt;
        return NextResponse.json({
            ok: true,
            viewType,
            forecast,
            routeUnitEngine: routeUnitPrice?.engine || '',
            routeUnitGroupCount: routeUnitPrice?.summary?.returnedGroupCount || 0,
            sourceDateCount: sourceState.sourceDateCount,
            metaDateCount: sourceState.metaDateCount,
            timings,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error.message || '예측 손익 조회 실패',
        }, { status: 500 });
    }
}
