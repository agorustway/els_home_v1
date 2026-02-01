import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/** 운임조회 시트 헤더 (1행 제목, 2행부터 값) */
const QUERY_HEADERS = ['적용', '구간', '행선지', '거리(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전'];

/** 저장운임 시트: 조회와 동일 컬럼 + 메시지 항목 */
const SAVED_HEADERS = ['순번', '적용', '구간', '행선지', '거리(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전', '저장일시', '적용할증', '제외할증'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { querySheetRows = [], savedResults = [] } = body;

    const wb = XLSX.utils.book_new();

    // Sheet1: 운임조회 — 1행 제목, 2행부터 값
    const queryData = [QUERY_HEADERS];
    for (const row of querySheetRows) {
      queryData.push([
        row.period ?? '',
        row.origin ?? '',
        row.destination ?? '',
        row.km ?? '',
        row.f40위탁 ?? '',
        row.f40운수자 ?? '',
        row.f40안전 ?? '',
        row.f20위탁 ?? '',
        row.f20운수자 ?? '',
        row.f20안전 ?? '',
      ]);
    }
    const wsQuery = XLSX.utils.aoa_to_sheet(queryData);
    XLSX.utils.book_append_sheet(wb, wsQuery, '운임조회');

    // Sheet2: 저장운임 — 1행 제목, 2행부터 값 + 메시지(적용할증, 제외할증)
    const savedData = [SAVED_HEADERS];
    savedResults.forEach((s, idx) => {
      const savedAt = s.savedAt ? new Date(s.savedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : (s.id ? new Date(s.id).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '');
      const appliedStr = Array.isArray(s.appliedSurcharges) ? s.appliedSurcharges.join('; ') : '';
      const excludedStr = Array.isArray(s.excludedSurcharges)
        ? s.excludedSurcharges.map((e) => (e.label && e.reason ? `${e.label}: ${e.reason}` : e.label || '')).join('; ')
        : '';
      savedData.push([
        idx + 1,
        s.period ?? '',
        s.origin ?? '',
        s.destination ?? '',
        s.km ?? '',
        s.f40위탁 ?? '',
        s.f40운수자 ?? '',
        s.f40안전 ?? '',
        s.f20위탁 ?? '',
        s.f20운수자 ?? '',
        s.f20안전 ?? '',
        savedAt,
        appliedStr,
        excludedStr,
      ]);
    });
    const wsSaved = XLSX.utils.aoa_to_sheet(savedData);
    XLSX.utils.book_append_sheet(wb, wsSaved, '저장운임');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `안전운임_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
