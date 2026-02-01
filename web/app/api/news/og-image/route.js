import { NextResponse } from 'next/server';

/** GET ?url=... → { image: og:image URL or null } */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url || typeof url !== 'string') {
        return NextResponse.json({ image: null }, { status: 400 });
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return NextResponse.json({ image: null }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ image: null }, { status: 400 });
    }

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return NextResponse.json({ image: null });
        const html = await res.text();
        const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        const image = ogMatch?.[1]?.trim() || null;
        return NextResponse.json({ image });
    } catch {
        return NextResponse.json({ image: null });
    }
}
