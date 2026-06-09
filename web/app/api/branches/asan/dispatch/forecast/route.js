import { NextResponse } from 'next/server';
import { queryAsanAnnualRouteUnitPriceFromSupabase } from '@/lib/asan-branch-db';
import {
    buildAsanDashboardFinancialForecast,
    buildAsanDashboardPeriodOptions,
} from '@/utils/asanDashboardView.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DISPATCH_FORECAST_VIEW_TYPES = ['integrated', 'glovis', 'mobis'];
const DISPATCH_FORECAST_PERIODS = ['daily', 'weekly', 'monthly', 'total'];

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
    const params = new URLSearchParams({
        analysis: 'route-unit-price',
        unit_scope: 'month',
    });
    const data = await queryAsanAnnualRouteUnitPriceFromSupabase(params);
    return data?.routeUnitPrice || null;
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
