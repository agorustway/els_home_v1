import { NextResponse } from 'next/server';

/**
 * Naver Maps Directions API (driving 5)를 호출하는 백엔드 프록시입니다.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const goal = searchParams.get('goal');
    const option = searchParams.get('option');

    if (!start || !goal) {
        return NextResponse.json({ error: 'Start and goal coordinates are required' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Naver API credentials are not configured on the server.' }, { status: 500 });
    }
    
    // 네이버 지도 API는 '경로 우선' 옵션을 trafast로 받습니다.
    const routeOption = option || 'trafast'; // 기본값: 추천경로
    const apiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=${routeOption}`;

    try {
        const apiRes = await fetch(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': clientId,
                'X-NCP-APIGW-API-KEY': clientSecret,
            },
        });

        const data = await apiRes.json();
        
        if (apiRes.status !== 200 || data.code !== 0) {
            return NextResponse.json({ error: data.message || 'Failed to fetch from Naver Directions API', details: data }, { status: apiRes.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying to Naver Directions API:', error);
        return NextResponse.json({ error: 'Failed to proxy request to Naver Directions API.', details: error.message }, { status: 500 });
    }
}
