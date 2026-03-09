import { NextResponse } from 'next/server';

/**
 * Naver Maps Directions 15 API 프록시
 * - 최대 15개 경유지
 * - 차종(cartype) 지정 가능
 * - 출발시간(departtime) 지정 가능
 * - 다중 경로 옵션(trafast, tracomfort 등) 동시 요청
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');         // lng,lat
    const goal = searchParams.get('goal');            // lng,lat
    const waypoints = searchParams.get('waypoints');  // lng1,lat1|lng2,lat2|...
    const option = searchParams.get('option') || 'trafast:tracomfort:traoptimal:traavoidtoll:traavoidcaronly';
    const cartype = searchParams.get('cartype') || '6';  // 6=대형화물차
    const fueltype = searchParams.get('fueltype') || 'diesel';
    const departtime = searchParams.get('departtime') || '';

    if (!start || !goal) {
        return NextResponse.json(
            { error: '출발지(start)와 도착지(goal) 좌표가 필요합니다.' },
            { status: 400 }
        );
    }

    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return NextResponse.json(
            { error: 'Naver API 인증 정보가 서버에 설정되지 않았습니다.' },
            { status: 500 }
        );
    }

    // Directions 15 엔드포인트
    const params = new URLSearchParams({
        start,
        goal,
        option,
        cartype,
        fueltype,
    });

    if (waypoints) {
        params.set('waypoints', waypoints);
    }
    if (departtime) {
        params.set('departtime', departtime);
    }

    const apiUrl = `https://maps.apigw.ntruss.com/map-direction-15/v1/driving?${params.toString()}`;

    try {
        const apiRes = await fetch(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': clientId,
                'X-NCP-APIGW-API-KEY': clientSecret,
            },
        });

        const data = await apiRes.json();

        if (apiRes.status !== 200 || data.code !== 0) {
            console.error('Directions 15 API Error:', data);
            return NextResponse.json(
                { error: data.message || '경로 탐색 실패', code: data.code, details: data },
                { status: apiRes.status || 500 }
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Directions 15 Proxy Error:', error);
        return NextResponse.json(
            { error: '네이버 경로 탐색 API 호출 실패', details: error.message },
            { status: 500 }
        );
    }
}
