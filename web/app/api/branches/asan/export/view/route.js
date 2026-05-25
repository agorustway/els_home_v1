import ExcelJS from 'exceljs';

const MAX_EXPORT_ROWS = 50000;
const NUMERIC_VIEW_EXPORT_HEADERS = new Set(
    ['오더(계)', '오더', '계', '수량', '배차', '상세배차수량', '컨테이너 수량'].map(normalizeHeader)
);

function normalizeHeader(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function safeSheetName(value) {
    const text = cleanText(value || '다운로드').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
    return text || '다운로드';
}

function uniqueSheetName(workbook, value) {
    const base = safeSheetName(value);
    if (!workbook.getWorksheet(base)) return base;
    const trimmedBase = base.slice(0, 27).trim() || '다운로드';
    for (let idx = 2; idx < 100; idx += 1) {
        const name = `${trimmedBase}_${idx}`.slice(0, 31);
        if (!workbook.getWorksheet(name)) return name;
    }
    return `${trimmedBase}_${Date.now()}`.slice(0, 31);
}

function safeFileName(value) {
    const text = cleanText(value || '아산_현재화면.xlsx').replace(/[\\/:*?"<>|]/g, '_');
    return text.toLowerCase().endsWith('.xlsx') ? text : `${text}.xlsx`;
}

function isNumericHeader(header) {
    return NUMERIC_VIEW_EXPORT_HEADERS.has(normalizeHeader(header));
}

function toExcelValue(header, value) {
    const text = cleanText(value);
    if (!isNumericHeader(header) || !/^-?\d+(?:\.\d+)?$/.test(text.replace(/,/g, ''))) return text;
    const numberValue = Number(text.replace(/,/g, ''));
    return Number.isFinite(numberValue) ? numberValue : text;
}

function normalizeRows(headers = [], rows = []) {
    return rows.slice(0, MAX_EXPORT_ROWS).map(row => {
        const values = Array.isArray(row) ? row : [];
        return headers.map((header, idx) => toExcelValue(header, values[idx]));
    });
}

function normalizeExportSheet(input = {}) {
    const headers = Array.isArray(input.headers) ? input.headers.map(cleanText).filter(Boolean) : [];
    const sourceRows = Array.isArray(input.rows) ? input.rows : [];
    return {
        title: cleanText(input.title),
        generatedAt: cleanText(input.generatedAt),
        sheetName: cleanText(input.sheetName || input.title || '다운로드'),
        headers,
        rows: normalizeRows(headers, sourceRows),
    };
}

function addExportWorksheet(workbook, exportSheet = {}) {
    const sheet = workbook.addWorksheet(uniqueSheetName(workbook, exportSheet.sheetName || exportSheet.title));
    const title = cleanText(exportSheet.title);
    const generatedAt = cleanText(exportSheet.generatedAt);
    const headers = exportSheet.headers || [];
    const rows = exportSheet.rows || [];
    let headerRowNumber = 1;

    if (title) {
        const titleRow = sheet.addRow([title]);
        sheet.mergeCells(1, 1, 1, headers.length);
        titleRow.height = 24;
        titleRow.getCell(1).font = { bold: true, size: 13, name: '맑은 고딕', color: { argb: 'FF0F172A' } };
        titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        headerRowNumber += 1;
    }

    if (generatedAt) {
        const metaRow = sheet.addRow([generatedAt]);
        sheet.mergeCells(headerRowNumber, 1, headerRowNumber, headers.length);
        metaRow.getCell(1).font = { size: 9, name: '맑은 고딕', color: { argb: 'FF64748B' } };
        metaRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        headerRowNumber += 1;
    }

    const hRow = sheet.addRow(headers);
    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5673' } };
    const HEADER_FONT = { bold: true, size: 10, name: '맑은 고딕', color: { argb: 'FFFFFFFF' } };
    const HEADER_BORDER = {
        top: { style: 'thin', color: { argb: 'FF16445C' } },
        bottom: { style: 'thin', color: { argb: 'FF16445C' } },
        left: { style: 'thin', color: { argb: 'FF6BA4BC' } },
        right: { style: 'thin', color: { argb: 'FF6BA4BC' } },
    };
    const CELL_BORDER = {
        top: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        bottom: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        left: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        right: { style: 'thin', color: { argb: 'FFD7DEE8' } },
    };

    hRow.eachCell({ includeEmpty: true }, cell => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = HEADER_BORDER;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach(row => {
        const excelRow = sheet.addRow(row);
        for (let colIdx = 1; colIdx <= headers.length; colIdx += 1) {
            const cell = excelRow.getCell(colIdx);
            const numeric = isNumericHeader(headers[colIdx - 1]);
            cell.border = CELL_BORDER;
            cell.font = { size: 10, name: '맑은 고딕' };
            cell.alignment = { vertical: 'middle', horizontal: numeric ? 'right' : 'left' };
            if (numeric) cell.numFmt = '#,##0';
        }
    });

    sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
    sheet.autoFilter = {
        from: { row: headerRowNumber, column: 1 },
        to: { row: headerRowNumber, column: headers.length },
    };
    sheet.columns.forEach(col => {
        let maxLen = 8;
        col.eachCell({ includeEmpty: true }, cell => {
            const value = cell.value ? String(cell.value) : '';
            let len = 0;
            for (let i = 0; i < value.length; i += 1) len += value.charCodeAt(i) > 127 ? 2.1 : 1.1;
            if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(Math.ceil(maxLen) + 2, 80);
    });

    return sheet;
}

export async function POST(request) {
    const payload = await request.json().catch(() => ({}));
    const primarySheet = normalizeExportSheet(payload);
    const headers = primarySheet.headers;
    if (headers.length === 0) {
        return Response.json({ error: 'headers required' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();

    addExportWorksheet(workbook, primarySheet);
    const extraSheets = Array.isArray(payload.extraSheets) ? payload.extraSheets : [];
    extraSheets.forEach((sheetPayload) => {
        const extraSheet = normalizeExportSheet(sheetPayload);
        if (extraSheet.headers.length > 0) addExportWorksheet(workbook, extraSheet);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(payload.fileName))}`,
            'X-ELS-Export-Rows': String(primarySheet.rows.length),
        },
    });
}
