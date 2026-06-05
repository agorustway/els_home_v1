import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildAsanDashboardCachePayload } from '@/utils/asanDashboardView.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DASHBOARD_CACHE_TABLE = 'branch_dispatch_dashboard_cache';
const DISPATCH_DASHBOARD_VIEW_TYPES = ['integrated', 'glovis', 'mobis'];

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
    return `${viewType}|${parts.join('|')}`;
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

async function writeDashboardCache({ supabase, request, viewType }) {
    const sourceItems = await loadDispatchItemsForCache(request, viewType);
    const dashboardPayload = buildAsanDashboardCachePayload({ sourceItems, viewType });
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
    return data;
}

export async function GET(request) {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return NextResponse.json({ ok: false, error: 'Supabase 환경변수가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const viewType = normalizeViewType(searchParams.get('type'));
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
            return NextResponse.json({ ok: true, cache: refreshed, viewType, refreshed: true });
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
                cache: refreshed,
                viewType,
                refreshed: true,
                previousUpdatedAt: data.updated_at,
            });
        }
    } catch (refreshError) {
        return NextResponse.json({
            ok: true,
            cache: data,
            viewType,
            stale: true,
            refreshError: refreshError.message,
        });
    }
    return NextResponse.json({ ok: true, cache: data, viewType });
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
            const cache = await writeDashboardCache({ supabase, request, viewType });
            refreshed.push({
                viewType,
                updated_at: cache.updated_at,
                source_synced_at: cache.source_synced_at,
            });
        }
        return NextResponse.json({ ok: true, refreshed });
    } catch (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
