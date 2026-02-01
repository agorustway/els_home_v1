import { NextResponse } from 'next/server';

function stripCdata(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractThumbnail(block) {
    const mediaThumb = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    if (mediaThumb?.[1]) return mediaThumb[1].trim();
    const mediaContent = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    if (mediaContent?.[1]) return mediaContent[1].trim();
    const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (enclosure?.[1]) return enclosure[1].trim();
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    if (descMatch?.[1]) {
        const desc = stripCdata(descMatch[1]);
        const img = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (img?.[1]) return img[1].trim();
    }
    return null;
}

function parseRssItems(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const block = m[1];
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        const pubDateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
        const title = titleMatch ? stripCdata(titleMatch[1]).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
        const link = linkMatch ? linkMatch[1].trim() : '';
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
        const thumbnail = extractThumbnail(block);
        if (title) items.push({ title, link, pubDate, thumbnail: thumbnail || null });
    }
    return items.slice(0, 20);
}

async function fetchOgImage(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Accept: 'text/html' },
            redirect: 'follow',
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        return m?.[1]?.trim() || null;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const res = await fetch('https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntranetNews/1.0)' },
            next: { revalidate: 300 },
        });
        if (!res.ok) throw new Error('뉴스 가져오기 실패');
        const xml = await res.text();
        const items = parseRssItems(xml);
        const needThumb = items.filter((it) => it.link && !it.thumbnail).slice(0, 6);
        const thumbs = await Promise.allSettled(needThumb.map((it) => fetchOgImage(it.link)));
        needThumb.forEach((it, i) => {
            const r = thumbs[i];
            if (r.status === 'fulfilled' && r.value) it.thumbnail = r.value;
        });
        return NextResponse.json({ items, updatedAt: new Date().toISOString() });
    } catch (e) {
        return NextResponse.json({ error: e.message, items: [] }, { status: 500 });
    }
}
