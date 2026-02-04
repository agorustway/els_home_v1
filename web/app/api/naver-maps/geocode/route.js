import { NextResponse } from 'next/server';

/**
 * Naver Maps Geocoding API를 호출하는 백엔드 프록시입니다.
 * 클라이언트에서 직접 API 키를 노출하지 않도록 서버에서 요청을 중계합니다.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'Address query is required' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

    // Debugging environment variables
    console.log('Naver Geocoding API - Client ID:', clientId ? 'LOADED' : 'NOT LOADED');
    console.log('Naver Geocoding API - Client Secret:', clientSecret ? 'LOADED' : 'NOT LOADED', clientSecret ? `(Length: ${clientSecret.length})` : '');

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Naver API credentials are not configured on the server.' }, { status: 500 });
    }

    const apiUrl = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;

    try {
        const apiRes = await fetch(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': clientId,
                'X-NCP-APIGW-API-KEY': clientSecret,
            },
        });

        const data = await apiRes.json();
        
        if (apiRes.status !== 200 || data.status !== 'OK') {
             return NextResponse.json({ error: data.errorMessage || 'Failed to fetch from Naver Geocoding API', details: data }, { status: apiRes.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying to Naver Geocoding API:', error);
        return NextResponse.json({ error: 'Failed to proxy request to Naver Geocoding API.', details: error.message }, { status: 500 });
    }
}
