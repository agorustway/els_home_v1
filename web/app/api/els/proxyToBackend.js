/**
 * ELS_BACKEND_URL 이 설정되어 있으면 요청을 NAS Docker 백엔드로 프록시.
 * Next.js API 라우트 상단에서 호출: if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
 */
import { NextResponse } from 'next/server';

const BASE = process.env.ELS_BACKEND_URL || '';

export async function proxyToBackend(req, pathname = null) {
    if (!BASE) return null;
    const url = new URL(req.url);
    const path = pathname != null ? pathname : url.pathname;
    const search = url.search;
    const backendUrl = BASE.replace(/\/$/, '') + path + search;
    const method = req.method;
    const headers = new Headers();
    req.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'host' || key.toLowerCase() === 'connection') return;
        headers.set(key, value);
    });

    let body;
    const contentType = req.headers.get('content-type') || '';
    if (method !== 'GET' && method !== 'HEAD') {
        if (contentType.includes('multipart/form-data')) {
            body = await req.arrayBuffer();
            headers.set('content-type', req.headers.get('content-type'));
        } else {
            body = await req.text();
            if (body && (contentType.includes('application/json') || !contentType)) {
                headers.set('content-type', 'application/json');
            }
        }
    }

    const res = await fetch(backendUrl, {
        method,
        headers,
        body: body ?? undefined,
    });

    const resHeaders = new Headers();
    res.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'transfer-encoding' || lower === 'connection') return;
        resHeaders.set(key, value);
    });

    if (res.body) {
        return new NextResponse(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
        });
    }
    return new NextResponse(null, { status: res.status, headers: resHeaders });
}
