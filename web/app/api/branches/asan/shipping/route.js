import { NextResponse } from 'next/server';
import { proxyToBackend } from '../../../els/proxyToBackend';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/shipping');
    }
    return NextResponse.json({ error: "ELS_BACKEND_URL 미설정" }, { status: 500 });
}

export async function POST(req) {
    if (process.env.ELS_BACKEND_URL) {
        return proxyToBackend(req, '/api/branches/asan/shipping');
    }
    return NextResponse.json({ error: "ELS_BACKEND_URL 미설정" }, { status: 500 });
}
