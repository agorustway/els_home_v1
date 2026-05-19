import { NextResponse } from 'next/server';
import { proxyToBackend } from '../../../../els/proxyToBackend';
import { queryAsanAnnualPerformanceFromSupabase } from '@/lib/asan-branch-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    const url = new URL(req.url);
    const source = (url.searchParams.get('source') || 'supabase').toLowerCase();
    if (source === 'excel' || source === 'status') {
        if (process.env.ELS_BACKEND_URL) {
            return proxyToBackend(req, '/api/branches/asan/performance/annual');
        }
        return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 연간실적 동기화 상태 조회 실패' }, { status: 500 });
    }

    if (source !== 'excel') {
        try {
            const data = await queryAsanAnnualPerformanceFromSupabase(url.searchParams);
            return NextResponse.json({ data });
        } catch (error) {
            return NextResponse.json({ error: error.message || '연간실적 DB 조회 실패' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정 또는 연간실적 DB 조회 실패' }, { status: 500 });
}

export async function POST(req) {
    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/performance/annual');
    }
    return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정' }, { status: 500 });
}
