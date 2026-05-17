import { NextResponse } from 'next/server';
import { proxyToBackend } from '../../../els/proxyToBackend';
import { queryAsanShippingFromSupabase } from '@/lib/asan-branch-db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    const url = new URL(req.url);
    const source = (url.searchParams.get('source') || 'supabase').toLowerCase();
    if (source !== 'excel') {
        try {
            const data = await queryAsanShippingFromSupabase(url.searchParams);
            if (data) return NextResponse.json({ data });
        } catch (error) {
            if (!process.env.ELS_BACKEND_URL) {
                return NextResponse.json({ error: error.message || '선적관리 DB 조회 실패' }, { status: 500 });
            }
        }
    }

    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/shipping');
    }
    return NextResponse.json({ error: "ELS_BACKEND_URL 미설정 또는 선적관리 DB 미적재" }, { status: 500 });
}

export async function POST(req) {
    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/shipping');
    }
    return NextResponse.json({ error: "ELS_BACKEND_URL 미설정" }, { status: 500 });
}
