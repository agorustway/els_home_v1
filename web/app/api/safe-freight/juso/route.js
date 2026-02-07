import { NextResponse } from 'next/server';

/**
 * 카카오 로컬 API를 이용한 주소 검색 프록시
 * 행정동(h_name) 정보를 포함하기 위해 사용합니다.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    if (!keyword) {
        return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Kakao API key is not configured' }, { status: 500 });
    }

    const apiUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(keyword)}`;

    try {
        const res = await fetch(apiUrl, {
            headers: {
                'Authorization': `KakaoAK ${apiKey}`
            }
        });
        const data = await res.json();

        // 안전운임 페이지 UI에서 기대하는 형식으로 변환
        const formattedJuso = (data.documents || []).map(doc => {
            const addr = doc.address || {};
            const road = doc.road_address || {};

            return {
                roadAddr: road.address_name || doc.address_name,
                jibunAddr: addr.address_name || doc.address_name,
                // 행정동 우선, 없으면 법정동
                admNm: `${addr.region_1depth_name} ${addr.region_2depth_name} ${addr.region_3depth_h_name || addr.region_3depth_name}`,
                siNm: addr.region_1depth_name,
                sggNm: addr.region_2depth_name,
                emdNm: addr.region_3depth_h_name || addr.region_3depth_name,
                hDong: addr.region_3depth_h_name,
                bDong: addr.region_3depth_name
            };
        });

        return NextResponse.json({ results: { juso: formattedJuso } });
    } catch (error) {
        console.error('Kakao API Proxy Error:', error);
        return NextResponse.json({ error: 'Failed to fetch from Kakao API' }, { status: 500 });
    }
}
