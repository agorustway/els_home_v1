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
    sejong: { name: '세종', lat: 36.4801, lon: 127.2892 },
    asan: { name: '아산', lat: 36.7897, lon: 127.0017 },
};

const WEATHER_LABELS = { 0: '맑음', 1: '대체로 맑음', 2: '약간 흐림', 3: '흐림', 45: '안개', 48: '서리 안개', 51: '이슬비', 61: '비', 63: '비(강함)', 71: '눈', 80: '소나기', 95: '뇌우' };

function weatherCodeToLabel(code) {
    if (code == null) return '';
    return WEATHER_LABELS[code] ?? '';
}

function nearestRegionId(lat, lon) {
    let minD = Infinity;
    let id = 'asan';
    for (const [rid, r] of Object.entries(REGIONS)) {
        const d = (lat - r.lat) ** 2 + (lon - r.lon) ** 2;
        if (d < minD) { minD = d; id = rid; }
    }
    return id;
}

/** 날씨코드·체감온도로 생활/안전 예보 문장 생성 (정제된 예보 문장) */
function buildAdvisoryText(weatherCode, apparentTemp) {
    const lines = [];
    const code = weatherCode != null ? Number(weatherCode) : null;

    // 눈: 71~77 — 도로·미끄럼·외출 주의
    if (code >= 71 && code <= 77) {
        lines.push('오늘 눈이 예상되며 도로와 인도가 미끄러울 수 있습니다. 외출 시 발을 굴리지 않도록 주의하시고, 차량 운행 시 속도를 줄여 주세요.');
    }
    // 비/소나기: 51~67, 80~82
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        lines.push('비가 내리면 노면이 미끄러울 수 있으니 우산을 챙기시고, 보행·운전 시 안전에 유의하세요.');
    }
    // 안개: 45, 48
    else if (code === 45 || code === 48) {
        lines.push('안개가 짙어 시야가 좋지 않을 수 있습니다. 운전 시 속도를 줄이고 전조등을 켜 주시기 바랍니다.');
    }
    // 뇌우: 95~99
    else if (code >= 95) {
        lines.push('뇌우가 예상됩니다. 실외 활동을 피하시고 건물 안에서 대기하시기 바랍니다.');
    }
    // 흐림만 있을 때는 강수·미끄럼 문장 생략
    else if (code >= 2 && code <= 3) {
        lines.push('흐린 날씨가 이어지겠습니다. 필요 시 우산을 준비하시면 좋겠습니다.');
    }

    // 체감온도 기반 옷차림·건강 조언
    if (apparentTemp != null) {
        const t = Number(apparentTemp);
        if (t < -15) {
            lines.push('한파가 이어져 체감온도가 매우 낮습니다. 두꺼운 옷으로 보온하시고, 노약자·어린이는 외출을 줄이시기 바랍니다.');
        } else if (t < -5) {
            lines.push('체감온도가 낮아 쌀쌀합니다. 겉옷을 두껍게 입으시고 감기 예방에 유의하세요.');
        } else if (t < 5) {
            lines.push('쌀쌀한 날씨입니다. 따뜻하게 입으시고 건강에 유의하세요.');
        } else if (t >= 30) {
            lines.push('무더위가 예상됩니다. 물을 자주 드시고, 외출 시에는 모자·선크림을 꼭 챙기세요.');
        } else if (t >= 25) {
            lines.push('덥겠습니다. 시원하게 보내시고 수분 섭취에 힘쓰세요.');
        }
    }

    return lines.length > 0 ? lines.join(' ') : null;
}

/** 오늘 일별·시간별 데이터로 짧은 날씨 예보 + 생활 예보 문장 생성 */
function buildDailySummary(daily, hourlyWithApparent) {
    if (!daily?.time?.[0]) return null;
    const max = daily.temperature_2m_max?.[0];
    const min = daily.temperature_2m_min?.[0];
    const code = daily.weathercode?.[0];
    const condition = weatherCodeToLabel(code);
    const parts = [];
    if (max != null && min != null) parts.push(`오늘 낮 최고 ${Math.round(max)}°C, 밤 최저 ${Math.round(min)}°C`);
    else if (max != null) parts.push(`오늘 최고 ${Math.round(max)}°C`);
    else if (min != null) parts.push(`오늘 최저 ${Math.round(min)}°C`);
    if (condition) parts.push(condition === '맑음' ? '맑겠습니다' : condition === '대체로 맑음' ? '대체로 맑겠습니다' : `${condition}이 예상됩니다`);
    if (parts.length === 0) return null;
    let summary = parts.join('로 ') + '. 오늘 낮부터 밤까지 이 날씨가 이어질 전망입니다.';

    const apparentTemps = (hourlyWithApparent || []).map((h) => h.apparent_temperature).filter((v) => v != null);
    const apparentMin = apparentTemps.length > 0 ? Math.min(...apparentTemps) : null;
    const advisory = buildAdvisoryText(code, apparentMin);
    if (advisory) summary += ' ' + advisory;

    return summary;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const regionId = searchParams.get('region');
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');

    let lat, lon, regionName, regionIdFinal;
    if (latParam != null && lonParam != null && !Number.isNaN(Number(latParam)) && !Number.isNaN(Number(lonParam))) {
        lat = Number(latParam);
        lon = Number(lonParam);
        regionIdFinal = nearestRegionId(lat, lon);
        regionName = '현위치';
    } else {
        const rid = regionId || 'asan';
        const region = REGIONS[rid] || REGIONS.asan;
        lat = region.lat;
        lon = region.lon;
        regionIdFinal = rid;
        regionName = region.name;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,precipitation_probability,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia/Seoul&past_days=0&forecast_days=2`;
        const res = await fetch(url, { next: { revalidate: 600 } });
        if (!res.ok) throw new Error('날씨 API 오류');
        const data = await res.json();

        const hourly = (data.hourly?.time || []).slice(0, 24).map((time, i) => ({
            time,
            temp: data.hourly?.temperature_2m?.[i] ?? null,
            code: data.hourly?.weathercode?.[i] ?? null,
            pop: data.hourly?.precipitation_probability?.[i] ?? null,
            apparent_temperature: data.hourly?.apparent_temperature?.[i] ?? null,
        }));

        const dailySummary = buildDailySummary(data.daily, hourly);

        return NextResponse.json({
            region: { id: regionIdFinal, name: regionName },
            regions: Object.entries(REGIONS).map(([id, r]) => ({ id, name: r.name })),
            hourly,
            dailySummary: dailySummary || undefined,
            updatedAt: new Date().toISOString(),
        });
    } catch (e) {
        return NextResponse.json({ error: e.message, regions: Object.entries(REGIONS).map(([id, r]) => ({ id, name: r.name })) }, { status: 500 });
    }
}
