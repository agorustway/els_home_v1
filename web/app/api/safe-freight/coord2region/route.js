import { NextResponse } from 'next/server';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const x = searchParams.get('x');
    const y = searchParams.get('y');

    if (!x || !y) {
        return NextResponse.json({ error: 'x and y coordinates are required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Kakao API key is not configured' }, { status: 500 });
    }

    const apiUrl = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;

    try {
        const res = await fetch(apiUrl, {
            headers: {
                'Authorization': `KakaoAK ${apiKey}`
            }
        });
        const data = await res.json();

        // 행정동(H)을 우선 추출, 없으면 법정동(B)
        let region = null;
        if (data.documents && data.documents.length > 0) {
            const hDong = data.documents.find(doc => doc.region_type === 'H');
            const bDong = data.documents.find(doc => doc.region_type === 'B');
            region = hDong || bDong || data.documents[0];
        }

        return NextResponse.json({ result: region });
    } catch (error) {
        console.error('Kakao coord2region Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Kakao API' }, { status: 500 });
    }
}
