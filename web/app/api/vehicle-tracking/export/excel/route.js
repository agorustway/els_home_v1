import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/utils/supabase/server';

const headers = [
    '상태', '기사명', '차량번호', '컨테이너', '시작일시', '종료일시',
    '최종위치', '브레이크', '타이어', '램프', '적재물', '기사숙지', '특이사항'
];

const TRIP_STATUS_LABELS = {
    driving: '운행중',
    paused: '일시정지',
    completed: '운행완료'
};

const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const keyword = searchParams.get('keyword');
        const status = searchParams.get('status');

        const supabase = await createClient();
        let query = supabase.from('vehicle_trips').select('*').order('started_at', { ascending: false }).limit(500);

        if (status && status !== 'all') query = query.eq('status', status);
        if (from) query = query.gte('started_at', `${from}T00:00:00+09:00`);
        if (to) query = query.lte('started_at', `${to}T23:59:59+09:00`);
        if (keyword) query = query.or(`driver_name.ilike.%${keyword}%,vehicle_number.ilike.%${keyword}%,container_number.ilike.%${keyword}%`);

        const { data: trips, error } = await query;
        if (error) throw error;

        // 위치 역지오코딩 가져오기
        const tripIds = trips.map(t => t.id);
        if (tripIds.length > 0) {
            const { data: locData } = await supabase.rpc('get_latest_vehicle_locations', { trip_ids: tripIds });
            if (locData) {
                const locMap = {};
                locData.forEach(l => { locMap[l.trip_id] = l.address; });
                trips.forEach(t => { t.last_location_address = locMap[t.id] || '-'; });
            }
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('운행기록');

        // 헤더 세팅
        const hRow = sheet.addRow(headers);
        hRow.height = 25;
        hRow.eachCell(cell => {
            cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            // 배경색 (남색 계열 - 예: Tailwind Blue 700)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
                left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
                bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
                right: { style: 'thin', color: { argb: 'FFBFDBFE' } }
            };
        });

        // 데이터 세팅
        trips.forEach(t => {
            const rowData = [
                TRIP_STATUS_LABELS[t.status] || t.status,
                t.driver_name,
                t.vehicle_number,
                t.container_number || '-',
                formatDateTime(t.started_at),
                formatDateTime(t.completed_at),
                t.last_location_address || '-',
                t.chk_brake ? 'O' : 'X',
                t.chk_tire ? 'O' : 'X',
                t.chk_lamp ? 'O' : 'X',
                t.chk_cargo ? 'O' : 'X',
                t.chk_driver ? 'O' : 'X',
                t.special_notes || '-'
            ];
            const row = sheet.addRow(rowData);
            row.eachCell((cell, colNumber) => {
                cell.font = { size: 10 };
                cell.alignment = { vertical: 'middle', horizontal: colNumber >= 8 && colNumber <= 12 ? 'center' : 'left' };
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
        });

        // 틀 고정 (1행 고정)
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };

        // 열 너비 조절
        const colWidths = [10, 15, 15, 15, 18, 18, 40, 10, 10, 10, 10, 10, 30];
        sheet.columns.forEach((col, i) => {
            col.width = colWidths[i];
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `운행기록_${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
            }
        });
    } catch (e) {
        console.error('Vehicle tracking export error:', e);
        // 에러인 경우 파일 다운로드 창을 띄우지 않고 텍스트/HTML 응답을 줄 수 있으나,
        // window.location.href로 요청했으므로 에러 메시지를 반환합니다.
        return new NextResponse(`Export failed: ${e.message}`, { status: 500 });
    }
}
