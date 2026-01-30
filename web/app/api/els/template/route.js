import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { proxyToBackend } from '../proxyToBackend';

const TEMPLATE_FILENAME = 'container_list_양식.xlsx';

export async function GET(req) {
    const proxied = await proxyToBackend(req);
    if (proxied) return proxied;
    try {
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['컨테이너넘버'],
            [''],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(TEMPLATE_FILENAME)}"`,
            },
        });
    } catch (e) {
        return NextResponse.json({ error: String(e.message) }, { status: 500 });
    }
}
