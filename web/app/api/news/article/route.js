import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'div', 'span'];

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url || typeof url !== 'string') {
        return NextResponse.json({ error: 'url 필요' }, { status: 400 });
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return NextResponse.json({ error: '잘못된 URL' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'http/https만 허용' }, { status: 400 });
    }

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const finalUrl = res.url;

        const dom = new JSDOM(html, { url: finalUrl });
        const reader = new Readability(dom.window.document, { charThreshold: 100 });
        const article = reader.parse();
        if (!article) {
            return NextResponse.json({ error: '본문 추출 실패', title: '', content: '' }, { status: 200 });
        }

        const sanitized = DOMPurify.sanitize(article.content, {
            ALLOWED_TAGS,
            ADD_ATTR: ['href', 'src', 'alt', 'srcset', 'width', 'height', 'loading'],
        });

        return NextResponse.json({
            title: article.title || '',
            content: sanitized,
            source: finalUrl,
        });
    } catch (e) {
        const msg = e.message || '본문 가져오기 실패';
        return NextResponse.json({ error: msg, title: '', content: '' }, { status: 500 });
    }
}
