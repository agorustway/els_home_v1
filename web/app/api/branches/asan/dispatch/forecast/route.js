import { NextResponse } from 'next/server';
import { queryAsanAnnualRouteUnitPriceFromSupabase } from '@/lib/asan-branch-db';
import { buildAsanDashboardFinancialForecast } from '@/utils/asanDashboardView.mjs';

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

async function loadDispatchItems(request, viewType) {
    const url = new URL(request.url);
    url.pathname = '/api/branches/asan/dispatch';
    url.search = new URLSearchParams({
        type: viewType,
        mode: 'full',
        t: String(Date.now()),
    }).toString();

    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
        throw new Error(payload.error || '배차 원장 조회 실패');
    }
    return payload.data || [];
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
        const [sourceItems, routeUnitPrice] = await Promise.all([
            loadDispatchItems(request, viewType),
            loadLatestRouteUnitPrice(),
        ]);
        const forecast = buildAsanDashboardFinancialForecast({
            sourceItems,
            viewType,
            routeUnitPrice,
            selectedDay,
            selectedWeek,
            selectedMonth,
            activePeriod,
        });
        return NextResponse.json({
            ok: true,
            viewType,
            forecast,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error.message || '예측 손익 조회 실패',
        }, { status: 500 });
    }
}
