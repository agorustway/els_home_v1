import { NextResponse } from 'next/server';
import { getDaemonUrl } from '../daemon';
import { proxyToBackend } from '../proxyToBackend';

export async function POST(req) {
    const proxied = await proxyToBackend(req);
    if (proxied) return proxied;
    try {
        const baseUrl = getDaemonUrl();
        await fetch(`${baseUrl}/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }).catch(() => {});
        return NextResponse.json({ ok: true });
    } catch (_) {
        return NextResponse.json({ ok: true });
    }
}
