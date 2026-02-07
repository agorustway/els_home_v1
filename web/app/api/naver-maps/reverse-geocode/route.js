import { NextResponse } from 'next/server';

/**
 * Naver Maps Reverse Geocoding API를 호출하는 백엔드 프록시입니다.
 * 좌표를 받아 도로명 주소와 지번 주소를 모두 반환합니다.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const coords = searchParams.get('coords');

    if (!coords) {
        return NextResponse.json({ error: 'Coordinates are required' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Naver API credentials are not configured on the server.' }, { status: 500 });
    }

    const orders = searchParams.get('orders') || 'roadaddr,jibun';
    // `orders` 파라미터에 roadaddr(도로명), jibun(지번)을 모두 요청합니다.
    const apiUrl = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coords}&orders=${orders}&output=json`;

    try {
        const apiRes = await fetch(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': clientId,
                'X-NCP-APIGW-API-KEY': clientSecret,
            },
        });

        const data = await apiRes.json();

        if (apiRes.status !== 200 || data.status.code !== 0) {
            return NextResponse.json({ error: data.status.message || 'Failed to fetch from Naver Reverse Geocoding API', details: data }, { status: apiRes.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying to Naver Reverse Geocoding API:', error);
        return NextResponse.json({ error: 'Failed to proxy request to Naver Reverse Geocoding API.', details: error.message }, { status: 500 });
    }
}
