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

async function loadDispatchItems(request, viewType, { mode = 'date', date = '' } = {}) {
    const url = new URL(request.url);
    url.pathname = '/api/branches/asan/dispatch';
    const params = new URLSearchParams({
        type: viewType,
        mode,
        t: String(Date.now()),
    });
    if (date) params.set('date', date);
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
    const rows = Array.isArray(payload.groups) ? payload.groups : [];
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
        engine: 'supabase-rpc-monthly-amount-cache',
        groups,
        totals: {
            revenue: numberValue(payload.total_revenue),
            purchase: numberValue(payload.total_purchase),
            profit: numberValue(payload.total_profit),
            rowCount: numberValue(payload.total_row_count),
        },
        summary: {
            periodStart: rows[0]?.period_start || '',
            periodEnd: rows[0]?.period_end || scope.month || '',
            groupCount: numberValue(payload.total_group_count || groups.length),
            returnedGroupCount: groups.length,
            truncated: numberValue(payload.total_group_count) > groups.length,
        },
    };
}

async function loadForecastSourceItems(request, viewType, { selectedDay = '', selectedWeek = '', selectedMonth = '' } = {}) {
    const metaItems = await loadDispatchItems(request, viewType, { mode: 'meta' });
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

    const dateItems = await Promise.all(
        [...dateKeys].map((date) => loadDispatchItems(request, viewType, { mode: 'date', date }))
    );
    return {
        sourceItems: dateItems.flat().filter((item) => item?.target_date),
        selectedDay: dayKey,
        selectedWeek: weekKey,
        selectedMonth: monthKey,
        sourceDateCount: dateKeys.size,
        metaDateCount: options.dates.length,
    };
}

async function loadLatestRouteUnitPrice() {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return null;
    const latest = await findLatestRouteUnitMonth(supabase);
    const scope = latest
        ? { mode: 'month', year: String(latest.year), month: latest.key, label: latest.label }
        : { mode: 'all', year: '', month: '', label: '전체 기간' };
    const request = supabase.rpc('asan_monthly_route_unit_amount_payload', {
        p_scope: latest ? 'month' : 'all',
        p_year: latest?.year || null,
        p_month: latest?.month || null,
        p_limit: 10000,
    });
    const executable = typeof request.abortSignal === 'function' && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? request.abortSignal(AbortSignal.timeout(8000))
        : request;
    const { data, error } = await executable;
    if (error) return null;
    return routeUnitCacheRowsToPrice(data, scope);
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const viewType = normalizeViewType(searchParams.get('type'));
        const activePeriod = normalizePeriod(searchParams.get('activePeriod'));
        const selectedDay = String(searchParams.get('activeDate') || '').trim();
        const selectedWeek = String(searchParams.get('selectedWeek') || '').trim();
        const selectedMonth = String(searchParams.get('selectedMonth') || '').trim();
        const [sourceState, routeUnitPrice] = await Promise.all([
            loadForecastSourceItems(request, viewType, { selectedDay, selectedWeek, selectedMonth }),
            loadLatestRouteUnitPrice(),
        ]);
        const forecast = buildAsanDashboardFinancialForecast({
            sourceItems: sourceState.sourceItems,
            viewType,
            routeUnitPrice,
            selectedDay: sourceState.selectedDay,
            selectedWeek: sourceState.selectedWeek,
            selectedMonth: sourceState.selectedMonth,
            activePeriod,
        });
        return NextResponse.json({
            ok: true,
            viewType,
            forecast,
            sourceDateCount: sourceState.sourceDateCount,
            metaDateCount: sourceState.metaDateCount,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error.message || '예측 손익 조회 실패',
        }, { status: 500 });
    }
}
