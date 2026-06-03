import { NextResponse } from 'next/server';

const backendBaseUrl = () => (
    process.env.ELS_BACKEND_URL || process.env.NEXT_PUBLIC_ELS_BACKEND_URL || ''
).replace(/\/+$/, '');

const backendTransportHistorySyncUrl = () => `${backendBaseUrl()}/api/branches/asan/transport-history/sync`;

async function proxySync(method) {
    const backendUrl = backendTransportHistorySyncUrl();
    if (!backendBaseUrl()) {
        return NextResponse.json({ error: 'ELS_BACKEND_URL 미설정' }, { status: 503 });
    }

    try {
        const response = await fetch(backendUrl, {
            method,
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message || '운송내역 NAS 동기화 실패' }, { status: 500 });
    }
}

export async function GET() {
    return proxySync('GET');
}

export async function POST() {
    return proxySync('POST');
}
