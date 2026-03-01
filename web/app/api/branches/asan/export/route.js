import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'glovis';
    const date = searchParams.get('date');       // 'all' or 'YYYY-MM-DD'
    const month = searchParams.get('month');      // '01','02'... (전체탭 월필터)

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = supabase.from('branch_dispatch')
        .select('*')
        .eq('branch_id', 'asan')
        .eq('type', type)
        .order('target_date', { ascending: true });

    if (date && date !== 'all') {
        query = query.eq('target_date', date);
    }

    const { data, error } = await query;
    if (error) return new Response('DB 오류: ' + error.message, { status: 500 });
    if (!data || data.length === 0) return new Response('데이터 없음', { status: 404 });

    let items = data;
    if (date === 'all' && month) {
        items = items.filter(d => d.target_date.slice(5, 7) === month);
    }

    const workbook = new ExcelJS.Workbook();
    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
    const HEADER_FONT = { bold: true, size: 10 };
    const HEADER_BORDER = {
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
    const CELL_BORDER = {
        bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } }
    };

    if (date === 'all') {
        // 전체: 날짜 내림차순, 날짜칼럼 추가
        items.sort((a, b) => b.target_date.localeCompare(a.target_date));
        const baseHeaders = items[0]?.headers || [];
        const allHeaders = ['날짜', ...baseHeaders];

        const sheet = workbook.addWorksheet('전체');
        const hRow = sheet.addRow(allHeaders);
        hRow.eachCell(cell => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.border = HEADER_BORDER;
            cell.alignment = { vertical: 'middle' };
        });

        items.forEach(item => {
            const d = new Date(item.target_date + 'T00:00:00');
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const label = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
            (item.data || []).forEach(row => {
                const r = sheet.addRow([label, ...row]);
                r.eachCell(cell => { cell.border = CELL_BORDER; });
            });
        });

        sheet.autoFilter = { from: 'A1', to: { row: 1, column: allHeaders.length } };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    } else {
        // 개별 날짜
        const item = items[0];
        if (!item) return new Response('데이터 없음', { status: 404 });
        const headers = item.headers || [];

        const sheet = workbook.addWorksheet(item.target_date);
        const hRow = sheet.addRow(headers);
        hRow.eachCell(cell => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.border = HEADER_BORDER;
            cell.alignment = { vertical: 'middle' };
        });

        (item.data || []).forEach(row => {
            const r = sheet.addRow(row);
            r.eachCell(cell => { cell.border = CELL_BORDER; });
        });

        sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // 칼럼 너비 자동 조절
    workbook.worksheets.forEach(ws => {
        ws.columns.forEach(col => {
            let maxLen = 6;
            col.eachCell({ includeEmpty: false }, cell => {
                const val = cell.value ? String(cell.value) : '';
                let len = 0;
                for (let i = 0; i < val.length; i++) {
                    len += val.charCodeAt(i) > 127 ? 2.1 : 1.1;
                }
                if (len > maxLen) maxLen = len;
            });
            col.width = Math.min(Math.ceil(maxLen) + 2, 80);
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const typeName = type === 'glovis' ? '글로비스KD' : '모비스AS';
    const datePart = date === 'all' ? (month ? `${parseInt(month)}월` : '전체') : date;
    const filename = `아산_${typeName}_${datePart}.xlsx`;

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
    });
}
