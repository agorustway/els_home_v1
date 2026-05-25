import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { proxyToBackend } from '../proxyToBackend';
import { applyIntranetExcelHeaderCell } from '@/utils/intranetExcelExport.mjs';

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
            applyIntranetExcelHeaderCell(cell);
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
