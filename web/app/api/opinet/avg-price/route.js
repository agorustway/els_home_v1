import { NextResponse } from 'next/server';

/**
 * 오피넷(Opinet) API를 사용해 전국 주유소의 평균 유가 정보를 가져옵니다.
 * 이 API는 경유(Diesel)의 평균 가격을 조회하는 데 사용됩니다.
 */
export async function GET(request) {
    const apiKey = process.env.OPINET_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'Opinet API key is not configured on the server.' }, { status: 500 });
    }

    // 경유 코드: D047
    const productCode = 'D047';
    const apiUrl = `http://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${apiKey}&prodcd=${productCode}`;

    try {
        const apiRes = await fetch(apiUrl);
        const data = await apiRes.json();

        if (!data || !data.RESULT || !data.RESULT.OIL) {
            throw new Error('Invalid data structure from Opinet API');
        }

        const dieselInfo = data.RESULT.OIL[0];

        return NextResponse.json({
            productName: dieselInfo.PRODNM,
            price: parseFloat(dieselInfo.PRICE),
            tradeDate: dieselInfo.TRADE_DT,
        });
    } catch (error) {
        console.error('Error fetching from Opinet API:', error);
        return NextResponse.json({ error: 'Failed to fetch data from Opinet API.', details: error.message }, { status: 500 });
    }
}
