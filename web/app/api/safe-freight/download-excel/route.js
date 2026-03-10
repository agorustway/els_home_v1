import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

/** 운임조회 시트 헤더 */
const QUERY_HEADERS = ['적용', '구간', '행선지', '거리(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전'];

/** 저장운임 시트 헤더 */
const SAVED_HEADERS = ['순번', '적용', '구간', '행선지', '거리(KM)', '40FT 위탁', '40FT 운수자', '40FT 안전', '20FT 위탁', '20FT 운수자', '20FT 안전', '저장일시', '적용할증', '제외할증'];

export async function POST(request) {
  try {
    const body = await request.json();
    const { querySheetRows = [], savedResults = [] } = body;

    const workbook = new ExcelJS.Workbook();

    const headerStyle = {
      font: { bold: true, size: 10 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }, // Slate-100
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } }
      }
    };

    const setupSheet = (name, headers, rows, isSaved = false) => {
      const sheet = workbook.addWorksheet(name);
      const hRow = sheet.addRow(headers);
      hRow.height = 25;
      hRow.eachCell(cell => {
        Object.assign(cell, headerStyle);
      });

      rows.forEach(rowData => {
        const row = sheet.addRow(rowData);
        row.eachCell(cell => {
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle' };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });
      });

      // 틀 고정 및 필터
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };

      // 너비 자동 조절
      sheet.columns.forEach(col => {
        let maxLen = 8;
        col.eachCell({ includeEmpty: false }, cell => {
          const val = String(cell.value || '');
          const len = val.split('').reduce((acc, c) => acc + (c.charCodeAt(0) > 128 ? 2 : 1), 0);
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen + 2, 60);
      });
    };

    // 1. 운임조회
    const qRows = querySheetRows.map(r => [
      r.period ?? '', r.origin ?? '', r.destination ?? '', r.km ?? '',
      r.f40위탁 ?? '', r.f40운수자 ?? '', r.f40안전 ?? '',
      r.f20위탁 ?? '', r.f20운수자 ?? '', r.f20안전 ?? ''
    ]);
    setupSheet('운임조회', QUERY_HEADERS, qRows);

    // 2. 저장운임
    const sRows = savedResults.map((s, idx) => {
      const savedAt = s.savedAt ? new Date(s.savedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : (s.id ? new Date(s.id).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '');
      const appliedStr = Array.isArray(s.appliedSurcharges) ? s.appliedSurcharges.join('; ') : '';
      const excludedStr = Array.isArray(s.excludedSurcharges)
        ? s.excludedSurcharges.map((e) => (e.label && e.reason ? `${e.label}: ${e.reason}` : e.label || '')).join('; ')
        : '';
      return [
        idx + 1, s.period ?? '', s.origin ?? '', s.destination ?? '', s.km ?? '',
        s.f40위탁 ?? '', s.f40운수자 ?? '', s.f40안전 ?? '',
        s.f20위탁 ?? '', s.f20운수자 ?? '', s.f20안전 ?? '',
        savedAt, appliedStr, excludedStr
      ];
    });
    setupSheet('저장운임', SAVED_HEADERS, sRows, true);

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
