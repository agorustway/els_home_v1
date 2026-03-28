import { NextResponse } from 'next/server';

/**
 * GET /api/vehicle-tracking/geocode?lat=&lng=
 * 역지오코딩 서버 프록시 (앱에서 Naver API 직접 호출 대신 사용)
 * - CORS 안전: 앱(Capacitor) → 이 엔드포인트 → Naver API
 * - Naver API 키 서버 보관 (클라이언트에 노출 안됨)
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));

    if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json({ error: 'lat, lng가 필요합니다.' }, { status: 400 });
    }

    // 좌표 범위 검증 (대한민국 영역)
    if (lat < 33 || lat > 38.5 || lng < 124 || lng > 132) {
        return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'coords_only' },
            { headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }

    try {
        const naverKeyId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
        const naverSecret = process.env.NAVER_MAP_CLIENT_SECRET;

        if (!naverKeyId || !naverSecret) {
            // API 키 없으면 좌표 그대로 반환
            return NextResponse.json(
                { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'coords_no_key' },
                { headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const naverRes = await fetch(
            `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${lng},${lat}&output=json&orders=admcode,legalcode`,
            {
                headers: {
                    'X-NCP-APIGW-API-KEY-ID': naverKeyId,
                    'X-NCP-APIGW-API-KEY': naverSecret,
                },
                // 타임아웃 3초 (앱 UX 고려)
                signal: AbortSignal.timeout(3000),
            }
        );

        if (!naverRes.ok) {
            throw new Error(`Naver API HTTP ${naverRes.status}`);
        }

        const naverData = await naverRes.json();

        let address = null;
        if (naverData.status?.code === 0 && naverData.results?.length > 0) {
            const reg = naverData.results[0].region;
            // 축약버전: 시/도 + 시/군/구 + 읍/면/동 (앱의 abbreviateAddr와 같은 결과)
            const parts = [
                reg.area1?.name,
                reg.area2?.name,
                reg.area3?.name,
            ].filter(Boolean);

            // 특별시/광역시 등 긴 이름 축약
            address = parts
                .map(s => s
                    .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
                    .replace(/(도|시|구|동|읍|면|리)$/g, '')
                )
                .filter(s => s.length > 0)
                .join(' ');
        }

        return NextResponse.json(
            { address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'naver' },
            { headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (e) {
        console.error('Geocode proxy error:', e.message);
        // 실패 시 좌표 반환 (앱이 멈추지 않도록)
        return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, source: 'error_fallback', error: e.message },
            {
                status: 200, // GPS 전송은 계속되어야 하므로 200 반환
                headers: { 'Access-Control-Allow-Origin': '*' }
            }
        );
    }
}

// Capacitor HTTP 브릿지 CORS 대응
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
    });
}
