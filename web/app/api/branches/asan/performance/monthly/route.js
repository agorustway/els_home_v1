import { NextResponse } from 'next/server';
import { proxyToBackend } from '../../../../els/proxyToBackend';
import {
    queryAsanMonthlyPerformanceDashboardFromSupabase,
    queryAsanMonthlyPerformanceFromSupabase,
} from '@/lib/asan-branch-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    const url = new URL(req.url);
    const source = (url.searchParams.get('source') || 'supabase').toLowerCase();
    if (source === 'excel' || source === 'status') {
        if (process.env.ELS_BACKEND_URL) {
            return proxyToBackend(req, '/api/branches/asan/performance/monthly');
        }
        return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 월간실적 동기화 상태 조회 실패' }, { status: 500 });
    }

    if (source !== 'excel') {
        try {
            const dashboard = ['1', 'true', 'yes'].includes(String(url.searchParams.get('dashboard') || '').toLowerCase());
            const data = dashboard
                ? await queryAsanMonthlyPerformanceDashboardFromSupabase(url.searchParams)
                : await queryAsanMonthlyPerformanceFromSupabase(url.searchParams);
            return NextResponse.json({ data });
        } catch (error) {
            return NextResponse.json({ error: error.message || '월간실적 DB 조회 실패' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 월간실적 DB 조회 실패' }, { status: 500 });
}

export async function POST(req) {
    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/performance/monthly');
    }
    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정' }, { status: 500 });
}
