import { NextResponse } from 'next/server';

/**
 * 항만 기상 API — 풍속(Open-Meteo Weather) + 파고(Open-Meteo Marine)
 * GET /api/weather/marine
 */

const PORTS = [
    { id: 'busan', name: '부산항', lat: 35.1024, lon: 129.0368 },
    { id: 'incheon', name: '인천항', lat: 37.4497, lon: 126.5861 },
    { id: 'pyeongtaek', name: '평택항', lat: 36.9847, lon: 126.8317 },
    { id: 'gwangyang', name: '광양항', lat: 34.9137, lon: 127.6916 },
    { id: 'ulsan', name: '울산항', lat: 35.5082, lon: 129.3874 },
];

export async function GET() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const results = await Promise.all(PORTS.map(async (port) => {
            try {
                const [weatherRes, marineRes] = await Promise.all([
                    fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${port.lat}&longitude=${port.lon}&hourly=temperature_2m,weathercode,windspeed_10m&timezone=Asia/Seoul&forecast_days=1`,
                        { signal: controller.signal, next: { revalidate: 900 } }
                    ),
                    fetch(
                        `https://marine-api.open-meteo.com/v1/marine?latitude=${port.lat}&longitude=${port.lon}&hourly=wave_height&timezone=Asia/Seoul&forecast_days=1`,
                        { signal: controller.signal, next: { revalidate: 900 } }
                    ),
                ]);

                const weather = weatherRes.ok ? await weatherRes.json() : null;
                const marine = marineRes.ok ? await marineRes.json() : null;

                // 현재 시간에 가장 가까운 인덱스 찾기
                const now = new Date();
                const times = weather?.hourly?.time || [];
                let idx = times.findIndex(t => {
                    const itemTime = new Date(t + ':00+09:00');
                    return itemTime > now;
                }) - 1;
                if (idx < 0) idx = 0;

                let marineIdx = 0;
                const marineTimes = marine?.hourly?.time || [];
                if (marineTimes.length > 0) {
                    marineIdx = marineTimes.findIndex(t => {
                        const itemTime = new Date(t + ':00+09:00');
                        return itemTime > now;
                    }) - 1;
                    if (marineIdx < 0) marineIdx = 0;
                }

                return {
                    id: port.id,
                    name: port.name,
                    temp: weather?.hourly?.temperature_2m?.[idx] ?? null,
                    code: weather?.hourly?.weathercode?.[idx] ?? null,
                    windSpeed: weather?.hourly?.windspeed_10m?.[idx] ?? null,
                    waveHeight: marine?.hourly?.wave_height?.[marineIdx] ?? null,
                };
            } catch {
                return { id: port.id, name: port.name, temp: null, code: null, windSpeed: null, waveHeight: null };
            }
        }));

        clearTimeout(timeoutId);
        return NextResponse.json({ ports: results }, { headers: { 'Cache-Control': 'public, s-maxage=900' } });
    } catch (e) {
        clearTimeout(timeoutId);
        return NextResponse.json({ ports: PORTS.map(p => ({ id: p.id, name: p.name, temp: null, code: null, windSpeed: null, waveHeight: null })) }, { status: 500 });
    }
}
