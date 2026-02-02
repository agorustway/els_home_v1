import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

let cached = null;

function getDataPath() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'data', 'safe-freight.json'),
    path.join(cwd, 'web', 'data', 'safe-freight.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getData() {
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev && cached) return cached;
  const p = getDataPath();
  if (!p) return null;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!isDev) cached = data;
  return data;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'section'; // 'section' | 'distance' | 'other'
  const mode = searchParams.get('mode') || 'latest'; // 'latest' | 'all' (section only)
  const origin = searchParams.get('origin') || '';
  const region1 = searchParams.get('region1') || '';
  const region2 = searchParams.get('region2') || '';
  const region3 = searchParams.get('region3') || '';
  const period = searchParams.get('period') || '';
  const distType = searchParams.get('distType') || '';
  const km = parseInt(searchParams.get('km'), 10);

  const data = getData();
  if (!data) {
    return NextResponse.json({ error: '안전운임 데이터가 없습니다.' }, { status: 404 });
  }

  // ========== 거리별운임 조회 ==========
  if (type === 'distance') {
    const distKey = `${period}|${distType}`.trim();
    const rows = data.distanceByPeriod?.[distKey];
    if (!rows || !rows.length) {
      return NextResponse.json({ error: '해당 기간·구분의 거리별 운임을 찾을 수 없습니다.', key: distKey }, { status: 404 });
    }
    if (Number.isNaN(km) || km < 1) {
      return NextResponse.json({ error: '거리(km)를 입력하세요.' }, { status: 400 });
    }
    let row = rows.find((r) => r.km === km);
    if (!row) {
      const lower = rows.filter((r) => r.km <= km);
      row = lower.length ? lower[lower.length - 1] : rows[0];
    }
    return NextResponse.json({
      type: 'distance',
      period,
      distType,
      km: row.km,
      rows: [{
        period,
        km: row.km,
        f40위탁: row.f40위탁,
        f40운수자: row.f40운수자,
        f40안전: row.f40안전,
        f20위탁: row.f20위탁,
        f20운수자: row.f20운수자,
        f20안전: row.f20안전,
      }],
    });
  }

  // ========== 이외구간 조회 (거리 조회 후 거리별운임 적용) ==========
  if (type === 'other') {
    const key = `${origin}|${region1}|${region2}|${region3}`.trim();
    const other = data.otherSections?.[key];
    if (!other) {
      return NextResponse.json({ error: '이외구간에서 해당 행선지의 거리를 찾을 수 없습니다.', key }, { status: 404 });
    }
    const useDistType = distType || (data.distanceTypes?.[0]) || '가. 거리(km)별 운임(왕복)';
    const kmInt = other.kmInt || Math.round(other.km);
    const applyPeriod = other.applyPeriod || '';

    // 모든 기간에 대해 거리별 운임 계산
    const periods = data.periods || [];
    const rows = [];
    for (const p of periods) {
      // "전체" 이거나 비어있거나, 또는 특정 기간과 일치할 때만 금액 계산
      const isApplied = !applyPeriod || applyPeriod === '전체' || applyPeriod === p.id;

      if (isApplied) {
        const distKey = `${p.id}|${useDistType}`.trim();
        const dRows = data.distanceByPeriod?.[distKey];
        if (dRows && dRows.length) {
          let row = dRows.find((r) => r.km === kmInt);
          if (!row) {
            const lower = dRows.filter((r) => r.km <= kmInt);
            row = lower.length ? lower[lower.length - 1] : dRows[0];
          }
          rows.push({
            period: p.id,
            km: row.km,
            f40위탁: row.f40위탁,
            f40운수자: row.f40운수자,
            f40안전: row.f40안전,
            f20위탁: row.f20위탁,
            f20운수자: row.f20운수자,
            f20안전: row.f20안전,
          });
        }
      } else {
        // 매칭되지 않는 기간은 공백 처리 (금액 0 또는 null)
        rows.push({
          period: p.id,
          km: kmInt,
          f40위탁: 0,
          f40운수자: 0,
          f40안전: 0,
          f20위탁: 0,
          f20운수자: 0,
          f20안전: 0,
          isNotApplied: true
        });
      }
    }

    const { hDong, bDong } = other;
    let destDetail = [region1, region2, region3].filter(Boolean).join(' ');
    if (hDong && bDong && hDong !== bDong) {
      destDetail = `${region1} ${region2} ${bDong}(법정) / ${hDong}(행정)`;
    }

    return NextResponse.json({
      type: 'other',
      origin,
      destination: destDetail,
      km: kmInt,
      distType: useDistType,
      rows,
    });
  }

  // ========== 구간별운임 조회 (기존) ==========
  const key = `${origin}|${region1}|${region2}|${region3}`.trim();
  const destination = [region1, region2, region3].filter(Boolean).join(' ');

  const fareRows = data.fares?.[key];
  if (!fareRows || !fareRows.length) {
    return NextResponse.json({ error: '해당 구간 운임을 찾을 수 없습니다.', key }, { status: 404 });
  }

  const toRow = (r) => ({
    period: r.period,
    km: r.km,
    f40위탁: r.f40위탁,
    f40운수자: r.f40운수자,
    f40안전: r.f40안전,
    f20위탁: r.f20위탁,
    f20운수자: r.f20운수자,
    f20안전: r.f20안전,
  });

  if (mode === 'all') {
    return NextResponse.json({
      type: 'section',
      period,
      origin,
      destination,
      rows: fareRows.map(toRow),
    });
  }

  // 최신 적용월만: 한 행만 rows 배열로 반환 (프론트와 형식 통일)
  const latestRow = fareRows[0];
  return NextResponse.json({
    type: 'section',
    period,
    origin,
    destination,
    km: latestRow.km,
    rows: [toRow(latestRow)],
  });
}
