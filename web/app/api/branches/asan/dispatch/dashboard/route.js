import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildAsanDashboardCachePayload, buildAsanDashboardViewerPayload } from '@/utils/asanDashboardView.mjs';
import { queryAsanAnnualRouteUnitPriceFromSupabase } from '@/lib/asan-branch-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DASHBOARD_CACHE_TABLE = 'branch_dispatch_dashboard_cache';
const DASHBOARD_VIEW_CACHE_TABLE = 'branch_dispatch_dashboard_view_cache';
const DISPATCH_DASHBOARD_VIEW_TYPES = ['integrated', 'glovis', 'mobis'];
const DASHBOARD_CACHE_POLICY_VERSION = 'financial-forecast-20260609';
const DASHBOARD_VIEWER_POLICY_VERSION = 'viewer-snapshot-financial-20260609';
const DASHBOARD_VIEWER_SNAPSHOT_KEY = 'default';

function getSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) return null;
    return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeViewType(value = 'integrated') {
    const type = String(value || 'integrated').trim().toLowerCase();
    return DISPATCH_DASHBOARD_VIEW_TYPES.includes(type) ? type : 'integrated';
}

function getRefreshTypes(value = 'integrated') {
    const type = String(value || 'integrated').trim().toLowerCase();
    return type === 'all' ? DISPATCH_DASHBOARD_VIEW_TYPES : [normalizeViewType(type)];
}

function hasRefreshAccess(request) {
    const allowedTokens = [
        process.env.ASAN_DISPATCH_DASHBOARD_CACHE_TOKEN,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ]
        .map((token) => String(token || '').trim())
        .filter(Boolean);
    if (allowedTokens.length === 0) return false;
    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || '';
    return allowedTokens.includes(bearer);
}

function makeSourceSignature(items = [], viewType = 'integrated') {
    const parts = (items || []).map((item) => [
        item.target_date || '',
        item.file_modified_at || '',
        item.updated_at || '',
        item.valid_row_count ?? item.row_count ?? item.data?.length ?? 0,
    ].join(':'));
    return `${viewType}|${DASHBOARD_CACHE_POLICY_VERSION}|${parts.join('|')}`;
}

function pickPreviousKey(options = [], key = '') {
    const index = options.findIndex((option) => option.key === key);
    return index > 0 ? options[index - 1].key : key;
}

function compactKeys(keys = []) {
    return [...new Set(keys.filter(Boolean))];
}

function pickDashboardInitialKeys(options = {}, activeDate = '') {
    const dates = options.dates || [];
    const weeks = options.weeks || [];
    const months = options.months || [];
    const latestDate = dates[dates.length - 1]?.key || '';
    const dayKey = dates.some((option) => option.key === activeDate) ? activeDate : latestDate;
    const dayIndex = dates.findIndex((option) => option.key === dayKey);
    const currentWeek = weeks.find((option) => dayKey >= option.start && dayKey <= option.end) || weeks[weeks.length - 1] || null;
    const currentWeekKey = currentWeek?.key || '';
    const defaultWeekKey = pickPreviousKey(weeks, currentWeekKey);
    const currentMonthKey = dayKey ? dayKey.slice(0, 7) : months[months.length - 1]?.key || '';
    const currentMonth = months.find((option) => option.key === currentMonthKey) || months[months.length - 1] || null;
    const defaultMonthKey = pickPreviousKey(months, currentMonth?.key || '');

    return {
        dayKeys: compactKeys([dayKey, dayIndex > 0 ? dates[dayIndex - 1]?.key : '']),
        weekKeys: compactKeys([currentWeekKey, defaultWeekKey, pickPreviousKey(weeks, defaultWeekKey)]),
        monthKeys: compactKeys([currentMonth?.key || '', defaultMonthKey, pickPreviousKey(months, defaultMonthKey)]),
    };
}

function pickObjectKeys(source = {}, keys = []) {
    return keys.reduce((acc, key) => {
        if (key && source[key]) acc[key] = source[key];
        return acc;
    }, {});
}

function makeInitialDashboardPayload(payload = {}, activeDate = '') {
    if (!payload || payload.version !== 1) return payload;
    const keys = pickDashboardInitialKeys(payload.options || {}, activeDate);
    const trimMode = (modeCache = {}) => ({
        daily: pickObjectKeys(modeCache.daily, keys.dayKeys),
        weekly: pickObjectKeys(modeCache.weekly, keys.weekKeys),
        monthly: pickObjectKeys(modeCache.monthly, keys.monthKeys),
        total: modeCache.total,
        timeline: modeCache.timeline || [],
        weekday: {
            weeks: pickObjectKeys(modeCache.weekday?.weeks, keys.weekKeys),
            months: pickObjectKeys(modeCache.weekday?.months, keys.monthKeys),
        },
    });

    return {
        ...payload,
        payloadScope: 'initial',
        modes: Object.fromEntries(
            Object.entries(payload.modes || {}).map(([mode, modeCache]) => [mode, trimMode(modeCache)])
        ),
        basisDiff: {
            daily: pickObjectKeys(payload.basisDiff?.daily, keys.dayKeys),
            weekly: pickObjectKeys(payload.basisDiff?.weekly, keys.weekKeys),
            monthly: pickObjectKeys(payload.basisDiff?.monthly, keys.monthKeys),
        },
        financial: payload.financial ? {
            ...payload.financial,
            daily: pickObjectKeys(payload.financial.daily, keys.dayKeys),
            weekly: pickObjectKeys(payload.financial.weekly, keys.weekKeys),
            monthly: pickObjectKeys(payload.financial.monthly, keys.monthKeys),
        } : payload.financial,
    };
}

function prepareDashboardCacheForResponse(cache = null, scope = 'full', activeDate = '') {
    if (!cache || scope !== 'initial') return cache;
    return {
        ...cache,
        payload: makeInitialDashboardPayload(cache.payload, activeDate),
    };
}

function isMissingTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01' || message.includes('does not exist');
}

function prepareDashboardViewerForResponse(viewer = null) {
    if (!viewer?.payload || viewer.payload.viewerPolicyVersion !== DASHBOARD_VIEWER_POLICY_VERSION) return null;
    return {
        view_type: viewer.view_type,
        snapshot_key: viewer.snapshot_key || DASHBOARD_VIEWER_SNAPSHOT_KEY,
        payload: viewer.payload,
        source_signature: viewer.source_signature,
        source_synced_at: viewer.source_synced_at,
        updated_at: viewer.updated_at,
    };
}

async function loadDispatchItems(request, viewType, mode = 'full') {
    const url = new URL(request.url);
    url.pathname = '/api/branches/asan/dispatch';
    url.search = new URLSearchParams({
        type: viewType,
        mode,
        t: String(Date.now()),
    }).toString();

    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
        throw new Error(payload.error || '배차 원장 조회 실패');
    }
    return payload.data || [];
}

async function loadDispatchItemsForCache(request, viewType) {
    return loadDispatchItems(request, viewType, 'full');
}

async function loadDispatchItemsForSignature(request, viewType) {
    return loadDispatchItems(request, viewType, 'meta');
}

async function loadLatestRouteUnitPrice() {
    try {
        const params = new URLSearchParams({
            analysis: 'route-unit-price',
            unit_scope: 'month',
        });
        const data = await queryAsanAnnualRouteUnitPriceFromSupabase(params);
        return data?.routeUnitPrice || null;
    } catch {
        return null;
    }
}

async function readDashboardViewerCache({ supabase, viewType }) {
    const { data, error } = await supabase
        .from(DASHBOARD_VIEW_CACHE_TABLE)
        .select('view_type,snapshot_key,payload,source_signature,source_synced_at,updated_at')
        .eq('branch_id', 'asan')
        .eq('view_type', viewType)
        .eq('snapshot_key', DASHBOARD_VIEWER_SNAPSHOT_KEY)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error)) return { data: null, error };
        throw new Error(error.message);
    }
    return { data, error: null };
}

async function writeDashboardViewerCache({ supabase, viewType, cachePayload, sourceSignature, sourceSyncedAt, now }) {
    const viewerPayload = buildAsanDashboardViewerPayload({
        cachePayload,
        viewType,
        viewerPolicyVersion: DASHBOARD_VIEWER_POLICY_VERSION,
    });
    if (!viewerPayload) return null;

    const { data, error } = await supabase
        .from(DASHBOARD_VIEW_CACHE_TABLE)
        .upsert({
            branch_id: 'asan',
            view_type: viewType,
            snapshot_key: DASHBOARD_VIEWER_SNAPSHOT_KEY,
            payload: viewerPayload,
            source_signature: sourceSignature,
            source_synced_at: sourceSyncedAt || now,
            updated_at: now,
        }, { onConflict: 'branch_id,view_type,snapshot_key' })
        .select('view_type,snapshot_key,payload,source_signature,source_synced_at,updated_at')
        .single();

    if (error) {
        if (isMissingTableError(error)) return null;
        throw new Error(error.message);
    }
    return data;
}

async function writeDashboardCache({ supabase, request, viewType }) {
    const sourceItems = await loadDispatchItemsForCache(request, viewType);
    const routeUnitPrice = await loadLatestRouteUnitPrice();
    const dashboardPayload = buildAsanDashboardCachePayload({ sourceItems, viewType, routeUnitPrice });
    const now = new Date().toISOString();
    const sourceSignature = makeSourceSignature(sourceItems, viewType);
    const sourceSyncedAt = sourceItems.reduce((latest, item) => {
        const value = item.updated_at || item.file_modified_at || '';
        return value && value > latest ? value : latest;
    }, '');

    const { data, error } = await supabase
        .from(DASHBOARD_CACHE_TABLE)
        .upsert({
            branch_id: 'asan',
            view_type: viewType,
            payload: dashboardPayload,
            source_signature: sourceSignature,
            source_synced_at: sourceSyncedAt || now,
            updated_at: now,
        }, { onConflict: 'branch_id,view_type' })
        .select('view_type,payload,source_signature,source_synced_at,updated_at')
        .single();

    if (error) throw new Error(error.message);
    const viewer = await writeDashboardViewerCache({
        supabase,
        viewType,
        cachePayload: dashboardPayload,
        sourceSignature,
        sourceSyncedAt: sourceSyncedAt || now,
        now,
    });
    return { cache: data, viewer };
}

export async function GET(request) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json({ ok: false, error: 'Supabase 환경변수가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const viewType = normalizeViewType(searchParams.get('type'));
    const scope = searchParams.get('scope') === 'initial' ? 'initial' : 'full';
    const activeDate = String(searchParams.get('activeDate') || '').trim();

    if (scope === 'initial') {
        try {
            const viewerResult = await readDashboardViewerCache({ supabase, viewType });
            const viewer = prepareDashboardViewerForResponse(viewerResult.data);
            const viewerDay = String(viewer?.payload?.selection?.day || '').trim();
            if (viewer && (!activeDate || viewerDay === activeDate)) {
                return NextResponse.json({
                    ok: true,
                    viewer,
                    viewType,
                    scope,
                    viewerHit: true,
                });
            }
        } catch {
            // viewer cache는 첫 화면 최적화용이다. 실패 시 기존 cache 경로로 안전하게 fallback한다.
        }
    }

    const { data, error } = await supabase
        .from(DASHBOARD_CACHE_TABLE)
        .select('view_type,payload,source_signature,source_synced_at,updated_at')
        .eq('branch_id', 'asan')
        .eq('view_type', viewType)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ ok: false, error: error.message, setupRequired: true }, { status: 500 });
    }
    if (!data) {
        try {
            const refreshed = await writeDashboardCache({ supabase, request, viewType });
            return NextResponse.json({
                ok: true,
                cache: prepareDashboardCacheForResponse(refreshed.cache, scope, activeDate),
                viewer: prepareDashboardViewerForResponse(refreshed.viewer),
                viewType,
                refreshed: true,
                scope,
            });
        } catch (refreshError) {
            return NextResponse.json({
                ok: false,
                cache: null,
                needsRefresh: true,
                viewType,
                error: refreshError.message,
            });
        }
    }

    try {
        const signatureItems = await loadDispatchItemsForSignature(request, viewType);
        const currentSignature = makeSourceSignature(signatureItems, viewType);
        if (currentSignature && data.source_signature !== currentSignature) {
            const refreshed = await writeDashboardCache({ supabase, request, viewType });
            return NextResponse.json({
                ok: true,
                cache: prepareDashboardCacheForResponse(refreshed.cache, scope, activeDate),
                viewer: prepareDashboardViewerForResponse(refreshed.viewer),
                viewType,
                refreshed: true,
                scope,
                previousUpdatedAt: data.updated_at,
            });
        }
    } catch (refreshError) {
        return NextResponse.json({
            ok: true,
            cache: prepareDashboardCacheForResponse(data, scope, activeDate),
            viewType,
            stale: true,
            scope,
            refreshError: refreshError.message,
        });
    }
    return NextResponse.json({
        ok: true,
        cache: prepareDashboardCacheForResponse(data, scope, activeDate),
        viewType,
        scope,
    });
}

export async function POST(request) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json({ ok: false, error: 'Supabase 환경변수가 설정되지 않았습니다.' }, { status: 503 });
    }
    if (!hasRefreshAccess(request)) {
        return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const requestedType = body.type || searchParams.get('type') || 'integrated';
    const refreshed = [];

    try {
        for (const viewType of getRefreshTypes(requestedType)) {
            const { cache, viewer } = await writeDashboardCache({ supabase, request, viewType });
            refreshed.push({
                viewType,
                updated_at: cache.updated_at,
                source_synced_at: cache.source_synced_at,
                viewer_updated_at: viewer?.updated_at || null,
            });
        }
        return NextResponse.json({ ok: true, refreshed });
    } catch (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
