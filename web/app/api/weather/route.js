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
    sejong: { name: '세종', lat: 36.4800, lon: 127.2890 }, // 세종시청 중심
    asan: { name: '아산', lat: 36.7898, lon: 127.0018 },  // 아산시청 중심 (정밀화)
    dangjin: { name: '당진', lat: 36.9762, lon: 126.6867 }, // 당진지점
    yesan: { name: '예산', lat: 36.6766, lon: 126.7515 },   // 예산지점
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
        // 위경도 차이의 제곱합 (단순 거리 비교용)
        const d = (lat - r.lat) ** 2 + (lon - r.lon) ** 2;
        if (d < minD) { minD = d; id = rid; }
    }
    return { id, distance: Math.sqrt(minD) };
}

/** 날씨코드·체감온도로 생활/안전 예보 문장 생성 - 기상청 스타일 */
function buildAdvisoryText(weatherCode, apparentTemp) {
    const lines = [];
    const code = weatherCode != null ? Number(weatherCode) : null;

    // 강수 예보: 눈(71~77), 비(51~67, 80~82)
    if (code >= 71 && code <= 77) {
        lines.push('겨울철 동결로 인한 빙판길 미끄럼 사고에 각별히 유의하시고, 보행 시에는 주머니에서 손을 빼고 안전한 보폭을 유지해 주세요.');
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        lines.push('강수가 예상되므로 가시거리가 짧고 도로가 미끄러운 곳이 많겠으니 안전거리를 충분히 확보하시고 서행 운행하시기 바랍니다.');
    } else if (code === 45 || code === 48) {
        lines.push('짙은 안개로 인해 시정 거리가 매우 짧아질 수 있으므로, 차량 운행 시 안개등을 켜고 차간 거리를 평소보다 넓게 유지하세요.');
    } else if (code >= 95) {
        lines.push('천둥과 번개를 동반한 강한 비가 내릴 가능성이 있으니 낙뢰 예방을 위해 야외 활동을 자제하고 안전한 실내에서 대기하시기 바랍니다.');
    } else if (code >= 2 && code <= 3) {
        lines.push('종일 구름이 많거나 흐린 날씨가 이어지며 일조량이 부족할 수 있으니 야외 활동 시 참고하시기 바랍니다.');
    }

    // 기온 기반 건강/의복 정보
    if (apparentTemp != null) {
        const t = Number(apparentTemp);
        if (t < -15) {
            lines.push('영하권의 매우 강력한 한파가 지속되고 있습니다. 야외 노출 부위를 최소화하고 한량 질환 예방을 위해 생체 리듬 유지에 힘써 주세요.');
        } else if (t < -5) {
            lines.push('찬 바람이 강하게 불어 실제 온도보다 훨씬 쌀쌀하게 느껴지므로, 보온성이 좋은 기능성 의류와 방한 용품을 갖추는 것이 권장됩니다.');
        } else if (t < 5) {
            lines.push('기온 변동폭이 커 면역력이 떨어지기 쉬운 시기입니다. 얇은 옷을 여러 겹 겹쳐 입어 체온 조절에 유의하시기 바랍니다.');
        } else if (t >= 32) {
            lines.push('극심한 폭염으로 인해 온열 질환 발생 위험이 매우 높습니다. 가장 더운 낮 시간대에는 무리한 야외 활동을 피하고 수분을 충분히 섭취하세요.');
        } else if (t >= 28) {
            lines.push('여름철 고온 다습한 기후로 인해 불쾌지수가 높고 쉽게 지칠 수 있습니다. 시원한 실내 환경을 유지하고 중간중간 적절한 휴식을 취하시기 바랍니다.');
        }
    }

    return lines.length > 0 ? lines.join(' ') : null;
}

/** 오늘 일별·시간별 데이터로 짧은 날씨 예보 + 생활 예보 문장 생성 */
function buildDailySummary(daily, hourlyWithApparent) {
    if (!daily?.time?.[0]) return null;
    const dateObj = new Date(daily.time[0]);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayStr = days[dateObj.getDay()];

    const max = daily.temperature_2m_max?.[0];
    const min = daily.temperature_2m_min?.[0];
    const code = daily.weathercode?.[0];
    const condition = weatherCodeToLabel(code);

    const parts = [];
    if (max != null && min != null) parts.push(`오늘(${dayStr})은 낮 최고 ${Math.round(max)}도, 아침 최저 ${Math.round(min)}도`);
    else if (max != null) parts.push(`오늘(${dayStr})은 최고 ${Math.round(max)}도`);
    else if (min != null) parts.push(`오늘(${dayStr})은 최저 ${Math.round(min)}도`);

    if (condition) parts.push(condition === '맑음' ? '맑은 날씨가 예상됩니다' : `${condition} 양상을 보이겠습니다`);

    if (parts.length === 0) return null;
    let summary = parts.join('를 보이며 ') + '. 기상 상황을 수시로 확인하여 안전 사고에 대비하시기 바랍니다.';

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
        const { id, distance } = nearestRegionId(lat, lon);
        regionIdFinal = id;
        // 지점 반경 약 20km(위경도차 0.2) 내외면 지점명 표시, 아니면 현위치
        regionName = distance < 0.2 ? REGIONS[id].name : '현위치';
    } else {
        const rid = regionId || 'asan';
        const region = REGIONS[rid] || REGIONS.asan;
        lat = region.lat;
        lon = region.lon;
        regionIdFinal = rid;
        regionName = region.name;
    }

    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,precipitation_probability,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia/Seoul&past_days=0&forecast_days=2`;
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5&timezone=Asia/Seoul`;

        const [weatherRes, airRes] = await Promise.all([
            fetch(weatherUrl, { next: { revalidate: 900 } }), // 15분으로 단축
            fetch(airUrl, { next: { revalidate: 900 } })
        ]);

        if (!weatherRes.ok) throw new Error('날씨 API 오류');
        const weatherData = await weatherRes.json();

        let airData = null;
        if (airRes.ok) airData = await airRes.json();

        const now = new Date();
        const allTimes = weatherData.hourly?.time || [];

        /** 
         * [시간 로직 수정] 
         * Open-Meteo 시간 문자열(KST)을 정확하게 파싱하여 비교.
         * 현재 시각 10:25일 때, startIndex를 11:00이 아닌 10:00(가장 최근 과거)으로 잡음.
         * 그래야 '현재 날씨' 카드에 10:00 데이터가 나옴.
         */
        let startIndex = allTimes.findIndex(t => {
            const itemTime = new Date(t + ":00+09:00"); // KST 강제 지정
            return itemTime > now;
        }) - 1;

        if (startIndex < 0) startIndex = 0;

        const hourly = allTimes.slice(startIndex, startIndex + 48).map((time, i) => {
            const actualIdx = startIndex + i;
            return {
                time,
                temp: weatherData.hourly?.temperature_2m?.[actualIdx] ?? null,
                code: weatherData.hourly?.weathercode?.[actualIdx] ?? null,
                pop: weatherData.hourly?.precipitation_probability?.[actualIdx] ?? null,
                apparent_temperature: weatherData.hourly?.apparent_temperature?.[actualIdx] ?? null,
            };
        });

        // Current Air Quality (using the same index logic if possible, or usually just current hour)
        let currentAir = null;
        if (airData && airData.hourly) {
            const airTimes = airData.hourly.time || [];
            /** 
             * [대기질 시간 로직 수정] 날씨와 동일하게 KST 기준 가장 가까운 과거/현재 인덱스 선택
             */
            let airIdx = airTimes.findIndex(t => {
                const itemTime = new Date(t + ":00+09:00");
                return itemTime > now;
            }) - 1;
            if (airIdx < 0) airIdx = 0;

            currentAir = {
                pm10: airData.hourly.pm10?.[airIdx] ?? null,
                pm2_5: airData.hourly.pm2_5?.[airIdx] ?? null,
            };
        }

        const dailySummary = buildDailySummary(weatherData.daily, hourly);

        return NextResponse.json({
            region: { id: regionIdFinal, name: regionName },
            regions: Object.entries(REGIONS).map(([id, r]) => ({ id, name: r.name })),
            hourly,
            dailySummary: dailySummary || undefined,
            airQuality: currentAir,
            updatedAt: new Date().toISOString(),
        });
    } catch (e) {
        return NextResponse.json({ error: e.message, regions: Object.entries(REGIONS).map(([id, r]) => ({ id, name: r.name })) }, { status: 500 });
    }
}
