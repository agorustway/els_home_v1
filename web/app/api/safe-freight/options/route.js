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

export async function GET() {
  const data = getData();
  if (!data) {
    return NextResponse.json({ error: '안전운임 데이터가 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({
    periods: data.periods || [],
    origins: data.origins || [],
    origins2026OrLater: data.origins2026OrLater || [],
    regions: data.regions || {},
    otherRegions: data.otherRegions || {},
    surcharges: data.surcharges || [],
    surchargeRegulation: data.surchargeRegulation || null,
    distanceTypes: data.distanceTypes || [],
    meta: data.meta || {},
  });
}
