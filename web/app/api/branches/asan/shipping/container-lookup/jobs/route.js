import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getJobsUrl() {
    const backendUrl = String(process.env.ELS_BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (!backendUrl) return null;
    return `${backendUrl}/api/branches/asan/shipping/container-lookup/jobs`;
}

async function proxyJobRequest(req, method) {
    const jobsUrl = getJobsUrl();
    if (!jobsUrl) {
        return NextResponse.json({ ok: false, error: 'ELS_BACKEND_URL 미설정: 백그라운드 조회는 NAS 백엔드가 필요합니다.' }, { status: 503 });
    }

    const url = new URL(req.url);
    const targetUrl = new URL(jobsUrl);
    const id = url.searchParams.get('id');
    if (id) targetUrl.searchParams.set('id', id);

    const init = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (method !== 'GET') {
        init.body = await req.text();
    }

    const res = await fetch(targetUrl.toString(), init);
    const text = await res.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { ok: false, error: text || '백그라운드 조회 응답 파싱 실패' };
    }
    return NextResponse.json(payload, { status: res.status });
}

export async function GET(req) {
    return proxyJobRequest(req, 'GET');
}

export async function POST(req) {
    return proxyJobRequest(req, 'POST');
}

export async function DELETE(req) {
    return proxyJobRequest(req, 'DELETE');
}
