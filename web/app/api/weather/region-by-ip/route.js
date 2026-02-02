import { NextResponse } from 'next/server';

const REGIONS = {
    seoul: { name: '서울', lat: 37.5665, lon: 126.978 },
    busan: { name: '부산', lat: 35.1796, lon: 129.0756 },
    incheon: { name: '인천', lat: 37.4563, lon: 126.7052 },
    daegu: { name: '대구', lat: 35.8714, lon: 128.6014 },
    daejeon: { name: '대전', lat: 36.3504, lon: 127.3845 },
    gwangju: { name: '광주', lat: 35.1595, lon: 126.8526 },
    ulsan: { name: '울산', lat: 35.5384, lon: 129.3114 },
    suwon: { name: '수원', lat: 37.2636, lon: 127.0286 },
    changwon: { name: '창원', lat: 35.2281, lon: 128.6811 },
    sejong: { name: '세종', lat: 36.5450, lon: 127.3505 },
    asan: { name: '아산', lat: 36.9243, lon: 127.0570 },
    dangjin: { name: '당진', lat: 36.9762, lon: 126.6867 },
    yesan: { name: '예산', lat: 36.6766, lon: 126.7515 },
};

function nearestRegionId(lat, lon) {
    let minD = Infinity;
    let id = 'asan';
    for (const [rid, r] of Object.entries(REGIONS)) {
        const d = (lat - r.lat) ** 2 + (lon - r.lon) ** 2;
        if (d < minD) { minD = d; id = rid; }
    }
    return id;
}

export async function GET(request) {
    try {
        const forwarded = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const ip = (forwarded?.split(',')[0]?.trim() || realIp || '').trim() || null;
        const fields = 'status,lat,lon,city,regionName';
        const url = ip
            ? `http://ip-api.com/json/${ip}?fields=${fields}`
            : `http://ip-api.com/json?fields=${fields}`;

        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (!res.ok) throw new Error('IP 조회 실패');
        const data = await res.json();

        if (data.status !== 'success' || data.lat == null || data.lon == null) {
            return NextResponse.json({ region: 'asan' });
        }

        // 1. 도시명(city/regionName) 우선 확인 (IP 좌표 오차 보정)
        const locationText = `${data.city} ${data.regionName}`.toLowerCase();
        if (locationText.includes('asan') || locationText.includes('아산')) return NextResponse.json({ region: 'asan' });
        if (locationText.includes('dangjin') || locationText.includes('당진')) return NextResponse.json({ region: 'dangjin' });
        if (locationText.includes('yesan') || locationText.includes('예산')) return NextResponse.json({ region: 'yesan' });
        if (locationText.includes('sejong') || locationText.includes('세종')) return NextResponse.json({ region: 'sejong' });

        // 2. 좌표 기반 가장 가까운 지역 매칭
        const region = nearestRegionId(data.lat, data.lon);
        return NextResponse.json({ region });
    } catch (e) {
        return NextResponse.json({ region: 'asan' });
    }
}
