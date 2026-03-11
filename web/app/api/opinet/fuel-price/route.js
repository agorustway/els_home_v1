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
        const recentUrl = `https://www.opinet.co.kr/api/avgRecentPrice.do?code=${apiKey}&out=json`;

        const [res, recentRes] = await Promise.all([
            fetch(apiUrl, { next: { revalidate: 3600 } }),
            fetch(recentUrl, { next: { revalidate: 3600 } })
        ]);

        const text = await res.text();
        const recentText = await recentRes.text();

        const cleaned = text.trim();
        const data = JSON.parse(cleaned);

        const recentCleaned = recentText.trim();
        let recentData = { RESULT: { OIL: [] } };
        try {
            recentData = JSON.parse(recentCleaned);
        } catch(e) {}

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
                weekLog: [],
                weekDiff: 0,
                monthDiff: 0, // 1달 데이터는 API 제한으로 추산값 또는 0 처리
            };
        }

        // 7일(1주)치 히스토리 매핑
        if (recentData?.RESULT?.OIL) {
            for (const item of recentData.RESULT.OIL) {
                if(oils[item.PRODCD]) {
                    oils[item.PRODCD].weekLog.push({ date: item.DATE, price: parseFloat(item.PRICE) });
                }
            }
        }

        // 1주일 변동폭 계산 (최신 - 7일전)
        for (const cd in oils) {
            const history = oils[cd].weekLog.sort((a,b) => a.date.localeCompare(b.date));
            if(history.length >= 2) {
                const oldest = history[0].price;
                const newest = history[history.length - 1].price;
                oils[cd].weekDiff = +(newest - oldest).toFixed(2);
                oils[cd].monthDiff = +(oils[cd].weekDiff * 4.2).toFixed(2); // 1달 데이터가 없어서 4주 평균으로 1달 변동폭 추산. (사용자 요청사항 대응)
            }
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
