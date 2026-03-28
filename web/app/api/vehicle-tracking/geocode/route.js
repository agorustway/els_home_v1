import { NextResponse } from 'next/server';

/**
 * GET /api/vehicle-tracking/geocode?lat=&lng=
 * 역지오코딩 서버 프록시 (카카오 Coord2Address API 사용)
 * - 앱(Capacitor) → 이 엔드포인트 → 카카오 API
 * - 카카오 REST API 키 서버 보관 (클라이언트 노출 없음)
 * - 응답: { address: '서울 강남 역삼', source: 'kakao' }
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));

    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json({ error: 'lat, lng가 필요합니다.' }, { status: 400, headers: corsHeaders });
    }

    // 대한민국 좌표 범위 기본 검증
    if (lat < 33 || lat > 38.5 || lng < 124 || lng > 132) {
        return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'coords_out_of_range' },
            { headers: corsHeaders }
        );
    }

    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;

    if (!kakaoKey) {
        console.warn('[geocode] NEXT_PUBLIC_KAKAO_REST_API_KEY 환경변수 없음 → 좌표 반환');
        return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'coords_no_key' },
            { headers: corsHeaders }
        );
    }

    try {
        // 카카오 좌표→주소 API (coord2address)
        // x=경도(lng), y=위도(lat)
        const kakaoRes = await fetch(
            `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
            {
                headers: {
                    'Authorization': `KakaoAK ${kakaoKey}`,
                },
                signal: AbortSignal.timeout(3000),
            }
        );

        if (!kakaoRes.ok) {
            throw new Error(`카카오 API HTTP ${kakaoRes.status}`);
        }

        const data = await kakaoRes.json();

        // 카카오 응답 구조: data.documents[0].address (법정동) or road_address (도로명)
        const doc = data?.documents?.[0];
        if (!doc) {
            return NextResponse.json(
                { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'kakao_no_result' },
                { headers: corsHeaders }
            );
        }

        // 법정동 주소 우선, 없으면 도로명
        const addrObj = doc.address || doc.road_address;
        if (!addrObj) {
            return NextResponse.json(
                { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'kakao_empty' },
                { headers: corsHeaders }
            );
        }

        // 주소 축약 (서울특별시 강남구 역삼동 → 서울 강남 역삼)
        const fullAddr = doc.address
            ? `${doc.address.region_1depth_name} ${doc.address.region_2depth_name} ${doc.address.region_3depth_name}`
            : `${doc.road_address.region_1depth_name} ${doc.road_address.region_2depth_name} ${doc.road_address.road_name}`;

        const shortAddr = abbreviateAddr(fullAddr);

        return NextResponse.json(
            { address: shortAddr, full: fullAddr, source: 'kakao' },
            { headers: corsHeaders }
        );

    } catch (e) {
        console.error('[geocode] 카카오 API 오류:', e.message);
        // 실패해도 좌표를 반환 (앱 흐름을 막지 않기 위해 200 반환)
        return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'error_fallback', error: e.message },
            { status: 200, headers: corsHeaders }
        );
    }
}

/**
 * 주소 축약 함수 (앱의 abbreviateAddr와 동일 로직)
 * 서울특별시 강남구 역삼동 → 서울 강남 역삼
 */
function abbreviateAddr(full) {
    if (!full) return '';
    return full
        .split(' ')
        .map(s => s
            .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
            .replace(/(도|시|구|동|읍|면|리)$/g, '')
        )
        .filter(s => s.trim().length > 0)
        .join(' ')
        .trim();
}

// Capacitor HTTP 브릿지 CORS 대응
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
