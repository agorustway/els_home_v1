import { NextResponse } from 'next/server';

/**
 * 오피넷(OPINET) 전국 평균 유가 API 프록시
 * - 경유, 휘발유, LPG 등 전체 유종 가격 반환
 * - 클라이언트에서 API 키 노출 방지
 */
export async function GET() {
    const apiKey = process.env.OPINET_API_KEY;

    if (!apiKey) {
        return NextResponse.json(
            { error: '오피넷 API 키가 서버에 설정되지 않았습니다.' },
            { status: 500 }
        );
    }

    try {
        const apiUrl = `https://www.opinet.co.kr/api/avgAllPrice.do?code=${apiKey}&out=json`;
        const res = await fetch(apiUrl, { next: { revalidate: 3600 } }); // 1시간 캐시
        const text = await res.text();

        // 오피넷 응답이 가끔 앞뒤로 공백/줄바꿈 있음
        const cleaned = text.trim();
        const data = JSON.parse(cleaned);

        if (!data?.RESULT?.OIL) {
            return NextResponse.json(
                { error: '오피넷 API 응답 형식이 올바르지 않습니다.' },
                { status: 502 }
            );
        }

        // 유종별로 정리
        const oils = {};
        for (const item of data.RESULT.OIL) {
            oils[item.PRODCD] = {
                code: item.PRODCD,
                name: item.PRODNM,
                price: parseFloat(item.PRICE),
                diff: parseFloat(item.DIFF),
                date: item.TRADE_DT,
            };
        }

        return NextResponse.json({
            date: data.RESULT.OIL[0]?.TRADE_DT || '',
            oils,
            // 주요 유종 바로 접근
            diesel: oils['D047'] || null,       // 경유
            gasoline: oils['B027'] || null,      // 휘발유
            premiumGas: oils['B034'] || null,    // 고급휘발유
            lpg: oils['K015'] || null,           // LPG
            kerosene: oils['C004'] || null,      // 등유
        });
    } catch (error) {
        console.error('OPINET API Error:', error);
        return NextResponse.json(
            { error: '오피넷 유가 API 호출 실패', details: error.message },
            { status: 500 }
        );
    }
}
