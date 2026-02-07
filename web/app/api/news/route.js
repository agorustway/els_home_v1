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

function parseRssItems(xml, source = 'google') {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const block = m[1];
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        const pubDateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
        const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

        let title = titleMatch ? stripCdata(titleMatch[1]).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
        let link = linkMatch ? linkMatch[1].trim() : '';
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
        let thumbnail = extractThumbnail(block);

        // 연합뉴스 등은 타이틀 뒤에 매체가 붙는 경우가 있음
        if (source === 'google' && title.includes(' - ')) {
            title = title.split(' - ').slice(0, -1).join(' - ');
        }

        if (title) {
            items.push({
                title,
                link,
                pubDate,
                thumbnail: thumbnail || null,
                source: source === 'yna' ? '연합뉴스' : source === 'ytn' ? 'YTN' : '뉴스'
            });
        }
    }
    return items.slice(0, 30);
}

async function fetchOgImage(url) {
    if (!url) return null;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const html = await res.text();

        // 정교한 og:image 추출
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
            html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

        let imgUrl = ogImageMatch?.[1]?.trim() || null;

        if (imgUrl) {
            try {
                imgUrl = new URL(imgUrl, url).href;
            } catch {
                // ignore invalid urls
            }
        }

        return imgUrl;
    } catch {
        return null;
    }
}

export async function GET() {
    // 가장 안정적인 연합뉴스 RSS로 단일화
    const rssUrl = 'https://www.yna.co.kr/rss/news.xml';

    try {
        const res = await fetch(rssUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IntranetNews/1.0)' },
            next: { revalidate: 1800 },
        });
        if (!res.ok) throw new Error('연합뉴스 수집 실패');
        const xml = await res.text();
        const items = parseRssItems(xml, 'yna');

        // 썸네일이 없는 상위 10개 항목에 대해 og:image 시도
        const itemsToFetch = items.filter(it => !it.thumbnail).slice(0, 10);
        const thumbs = await Promise.allSettled(itemsToFetch.map(it => fetchOgImage(it.link)));

        itemsToFetch.forEach((it, i) => {
            const r = thumbs[i];
            if (r.status === 'fulfilled' && r.value) it.thumbnail = r.value;
        });

        return NextResponse.json({
            items,
            updatedAt: new Date().toISOString(),
            source: '연합뉴스'
        });
    } catch (e) {
        console.error('News API Error:', e);
        return NextResponse.json({ error: e.message, items: [] }, { status: 500 });
    }
}
