import { NextResponse } from 'next/server';

/**
 * 카카오 로컬 API를 이용한 장소/주소 통합 검색 프록시
 * 키워드 검색 → 결과 없으면 주소 검색 fallback
 * 좌표(lng, lat) 포함하여 반환
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    if (!keyword || keyword.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Kakao API key is not configured' }, { status: 500 });
    }

    const headers = { Authorization: `KakaoAK ${apiKey}` };

    try {
        // 1. 키워드 검색 (장소명, 업체명 등)
        let kwResults = [];

        // 검색어가 (동|읍|면) 으로 끝나는 경우, 행정복지센터를 추가 검색해서 결과를 맨 앞에 세팅
        if (/(동|읍|면)$/.test(keyword.trim())) {
            const adminRes = await fetch(
                `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword.trim() + ' 행정복지센터')}&size=3`,
                { headers }
            );
            const adminData = await adminRes.json();
            const adminResults = (adminData.documents || []).map(doc => ({
                type: 'place',
                name: doc.place_name,
                address: doc.address_name,
                roadAddress: doc.road_address_name || '',
                category: doc.category_name || '',
                lng: doc.x,
                lat: doc.y,
            }));
            kwResults = [...adminResults];
        }

        const kwRes = await fetch(
            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&size=5`,
            { headers }
        );
        const kwData = await kwRes.json();
        const baseKwResults = (kwData.documents || []).map(doc => ({
            type: 'place',
            name: doc.place_name,
            address: doc.address_name,
            roadAddress: doc.road_address_name || '',
            category: doc.category_name || '',
            lng: doc.x,
            lat: doc.y,
        }));
        kwResults = [...kwResults, ...baseKwResults];

        // 2. 주소 검색 (도로명, 지번 등)
        const addrRes = await fetch(
            `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(keyword)}&size=3`,
            { headers }
        );
        const addrData = await addrRes.json();
        const addrResults = (addrData.documents || []).map(doc => ({
            type: 'address',
            name: doc.address_name,
            address: doc.address?.address_name || doc.address_name,
            roadAddress: doc.road_address?.address_name || '',
            category: '주소',
            lng: doc.x,
            lat: doc.y,
        }));

        // 3. 통합: 키워드 결과 우선, 주소 결과 보충 (중복 제거)
        const seen = new Set();
        const combined = [];
        for (const item of [...kwResults, ...addrResults]) {
            const key = `${parseFloat(item.lng).toFixed(4)},${parseFloat(item.lat).toFixed(4)}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(item);
            }
            if (combined.length >= 8) break;
        }

        return NextResponse.json({ results: combined });
    } catch (error) {
        console.error('Place Search Error:', error);
        return NextResponse.json({ error: '장소 검색 실패' }, { status: 500 });
    }
}
