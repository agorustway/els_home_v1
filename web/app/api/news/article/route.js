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

    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return NextResponse.json({ error: 'http/https만 허용' }, { status: 400 });
        }

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            throw new Error(`언론사 사이트 응답 오류 (HTTP ${res.status})`);
        }

        const buffer = await res.arrayBuffer();
        const decoder = new TextDecoder('utf-8');
        let html = decoder.decode(buffer);

        if (html.toLowerCase().includes('charset="euc-kr"') || html.toLowerCase().includes('charset=euc-kr')) {
            const eucKrDecoder = new TextDecoder('euc-kr');
            html = eucKrDecoder.decode(buffer);
        }

        const finalUrl = res.url;
        const dom = new JSDOM(html, { url: finalUrl });
        const document = dom.window.document;

        // 불필요한 요소 제거
        const toRemove = document.querySelectorAll('script, style, iframe, noscript, .ad, .advertisement, #ads, ins.adsbygoogle');
        toRemove.forEach(s => s.remove());

        const reader = new Readability(document, { charThreshold: 20 });
        let article = reader.parse();

        // Fallback for Korean News Sites
        if (!article || !article.content || article.content.length < 100) {
            const commonContentSelectors = [
                '#articleBodyContents', '#articleBody', '.article_view',
                '#newsct_article', '.article-body', '.view_content',
                '[itemprop="articleBody"]', 'article'
            ];

            for (const selector of commonContentSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim().length > 100) {
                    article = {
                        title: article?.title || document.title || '제목 없음',
                        content: element.innerHTML,
                        textContent: element.textContent.trim()
                    };
                    break;
                }
            }
        }

        if (!article || !article.content) {
            return NextResponse.json({
                error: '본문 내용을 추출할 수 없는 형식의 페이지이거나 접근이 제한되어 있습니다.',
                title: document.title || '기사 제목 없음',
                content: '',
                source: finalUrl
            });
        }

        const sanitized = DOMPurify.sanitize(article.content, {
            ALLOWED_TAGS,
            ADD_ATTR: ['href', 'src', 'alt', 'srcset', 'width', 'height', 'loading'],
        });

        return NextResponse.json({
            title: article.title || document.title || '',
            content: sanitized,
            source: finalUrl,
        });

    } catch (e) {
        console.error('Article API Fetch Error:', e);
        return NextResponse.json({
            error: e.name === 'TimeoutError' ? '서버 응답 시간이 초과되었습니다.' : (e.message || '본문을 가져오는 중 오류가 발생했습니다.'),
            title: '',
            content: ''
        }, { status: 200 });
    }
}
