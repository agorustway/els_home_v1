import ExcelJS from 'exceljs';
import {
    addIntranetExportWorksheet,
    normalizeIntranetExportSheet,
    safeExcelFileName,
} from '@/utils/intranetExcelExport.mjs';

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const primarySheet = normalizeIntranetExportSheet(payload);
    const headers = primarySheet.headers;
    if (headers.length === 0) {
        return Response.json({ error: 'headers required' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();

    addIntranetExportWorksheet(workbook, primarySheet);
    const extraSheets = Array.isArray(payload.extraSheets) ? payload.extraSheets : [];
    extraSheets.forEach((sheetPayload) => {
        const extraSheet = normalizeIntranetExportSheet(sheetPayload);
        if (extraSheet.headers.length > 0) addIntranetExportWorksheet(workbook, extraSheet);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeExcelFileName(payload.fileName, '아산_현재화면.xlsx'))}`,
            'X-ELS-Export-Rows': String(primarySheet.rows.length),
        },
    });
}
