import { NextResponse } from 'next/server';
import { getDaemonUrl } from '../daemon';

export async function POST() {
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
