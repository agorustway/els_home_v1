import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { proxyToBackend } from '../proxyToBackend';

const TEMPLATE_FILENAME = 'container_list_양식.xlsx';

export async function GET(req) {
    const proxied = await proxyToBackend(req);
    if (proxied) return proxied;
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sheet1');

        const headers = ['컨테이너넘버'];
        const hRow = sheet.addRow(headers);
        hRow.height = 25;
        hRow.eachCell(cell => {
            cell.font = { bold: true, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF94A3B8' } },
                left: { style: 'thin', color: { argb: 'FF94A3B8' } },
                bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
                right: { style: 'thin', color: { argb: 'FF94A3B8' } }
            };
        });

        sheet.getColumn(1).width = 25;

        const buffer = await workbook.xlsx.writeBuffer();
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(TEMPLATE_FILENAME)}"`,
            },
        });
    } catch (e) {
        console.error('Template gen error:', e);
        return NextResponse.json({ error: String(e.message) }, { status: 500 });
    }
}
