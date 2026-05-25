import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { addIntranetExportWorksheet } from '@/utils/intranetExcelExport.mjs';

const formatKm = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : (value ?? '');
};

/** 운임조회 시트 헤더 */
const QUERY_HEADERS = ['적용', '구간', '행선지', '구간(KM)', '왕복(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전'];

/** 저장운임 시트 헤더 */
const SAVED_HEADERS = ['순번', '적용', '구간', '행선지', '구간(KM)', '왕복(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전', '저장일시', '적용할증', '제외할증'];

const SAFE_FREIGHT_NUMERIC_HEADERS = [
  '순번',
  '구간(KM)',
  '왕복(KM)',
  '40FT 위탁',
  '40FT 운수자',
  '40FT 안전',
  '20FT 위탁',
  '20FT 운수자',
  '20FT 안전',
];

const formatGeneratedAt = (rowCount) => {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return `다운로드 ${now} / ${rowCount.toLocaleString('ko-KR')}건`;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { querySheetRows = [], savedResults = [] } = body;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();

    // 1. 운임조회
    const qRows = querySheetRows.map(r => [
      r.period ?? '', r.origin ?? '', r.destination ?? '', 
      formatKm(r.sectionKm), formatKm(r.roundTripKm),
      r.f40위탁 ?? '', r.f40운수자 ?? '', r.f40안전 ?? '',
      r.f20위탁 ?? '', r.f20운수자 ?? '', r.f20안전 ?? ''
    ]);
    addIntranetExportWorksheet(workbook, {
      title: '안전운임 운임조회',
      generatedAt: formatGeneratedAt(qRows.length),
      sheetName: '운임조회',
      headers: QUERY_HEADERS,
      rows: qRows,
    }, { numericHeaders: SAFE_FREIGHT_NUMERIC_HEADERS });

    // 2. 저장운임
    const sRows = savedResults.map((s, idx) => {
      const savedAt = s.savedAt ? new Date(s.savedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : (s.id ? new Date(s.id).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '');
      const appliedStr = Array.isArray(s.appliedSurcharges) ? s.appliedSurcharges.join('; ') : '';
      const excludedStr = Array.isArray(s.excludedSurcharges)
        ? s.excludedSurcharges.map((e) => (e.label && e.reason ? `${e.label}: ${e.reason}` : e.label || '')).join('; ')
        : '';
      return [
        idx + 1, s.period ?? '', s.origin ?? '', s.destination ?? '', 
        formatKm(s.sectionKm), formatKm(s.roundTripKm),
        s.f40위탁 ?? '', s.f40운수자 ?? '', s.f40안전 ?? '',
        s.f20위탁 ?? '', s.f20운수자 ?? '', s.f20안전 ?? '',
        savedAt, appliedStr, excludedStr
      ];
    });
    addIntranetExportWorksheet(workbook, {
      title: '안전운임 저장운임',
      generatedAt: formatGeneratedAt(sRows.length),
      sheetName: '저장운임',
      headers: SAVED_HEADERS,
      rows: sRows,
    }, { numericHeaders: SAFE_FREIGHT_NUMERIC_HEADERS });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `안전운임_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    console.error('Excel export error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
