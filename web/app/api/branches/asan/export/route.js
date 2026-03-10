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
        .order('target_date', { ascending: true });

    if (type !== 'integrated') {
        query = query.eq('type', type);
    }

    if (date && date !== 'all') {
        query = query.eq('target_date', date);
    }

    const { data: rawData, error } = await query;
    if (error) return new Response('DB 오류: ' + error.message, { status: 500 });
    if (!rawData || rawData.length === 0) return new Response('데이터 없음', { status: 404 });

    // 통합현황(integrated) 처리 로직 (dispatch/route.js와 동일하게 구현)
    let processedData = [];
    let headers = [];

    if (type === 'integrated') {
        headers = [
            "구분", "화주", "담당자", "작업지", "고객사(국가)", "포트(도착항)", "특이사항(Nomi,구간)",
            "라인(선사명)", "TYPE", "배차정보", "오더(계)", "배차예정", "기타", "아산", "부산",
            "광양", "평택", "중부", "부곡", "인천", "배차", "검증", "비고"
        ];

        const byDate = {};
        for (const item of rawData) {
            if (!byDate[item.target_date]) {
                byDate[item.target_date] = [];
            }

            const itemType = item.type;
            const getCol = (nameArr) => {
                for (let n of nameArr) {
                    const idx = (item.headers || []).findIndex(h => h.trim() === n);
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            const mapCols = {
                "구분": getCol(["구분"]),
                "화주": getCol(["화주"]),
                "담당자": getCol(["담당자", "당당자"]),
                "작업지": getCol(["작업지"]),
                "고객사(국가)": itemType === 'glovis' ? getCol(["고객사"]) : getCol(["국가", "국가명"]),
                "포트(도착항)": itemType === 'glovis' ? getCol(["포트"]) : getCol(["도착항"]),
                "특이사항(Nomi,구간)": itemType === 'glovis' ? getCol(["특이사항"]) : getCol(["Nomi,구간", "특이사항"]),
                "라인(선사명)": itemType === 'glovis' ? getCol(["라인", "선사"]) : getCol(["선사명", "선사"]),
                "TYPE": getCol(["TYPE", "T"]),
                "배차정보": getCol(["배차정보"]),
                "오더(계)": itemType === 'glovis' ? getCol(["오더"]) : getCol(["계", "수량"]),
                "배차예정": getCol(["배차예정"]),
                "기타": getCol(["기타/철송", "기타"]),
                "아산": getCol(["아산"]),
                "부산": getCol(["부산", "신항"]),
                "광양": getCol(["광양"]),
                "평택": getCol(["평택"]),
                "중부": getCol(["중부"]),
                "부곡": getCol(["부곡"]),
                "인천": getCol(["인천"]),
                "배차": getCol(["배차"]),
                "검증": getCol(["검증"]),
                "비고": getCol(["비고"])
            };

            const dayRows = (item.data || []).map(row => {
                return headers.map(h => {
                    const cIdx = mapCols[h];
                    return cIdx >= 0 ? row[cIdx] : '';
                });
            });
            byDate[item.target_date].push(...dayRows);
        }

        // date === 'all' 이면 날짜 내림차순 합산, 아니면 지정된 날짜만
        if (date === 'all') {
            const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
            const finalHeaders = ['날짜', ...headers];
            const finalRows = [];
            sortedDates.forEach(dStr => {
                if (month && dStr.slice(5, 7) !== month) return;
                const d = new Date(dStr + 'T00:00:00');
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const label = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
                byDate[dStr].forEach(r => finalRows.push([label, ...r]));
            });
            processedData = [{ sheetName: '통합현황_전체', headers: finalHeaders, rows: finalRows }];
        } else {
            processedData = [{ sheetName: date, headers: headers, rows: byDate[date] || [] }];
        }

    } else {
        // 단일 타입 (glovis or mobis)
        headers = rawData[0]?.headers || [];
        if (date === 'all') {
            const finalHeaders = ['날짜', ...headers];
            const finalRows = [];
            const sorted = [...rawData].sort((a, b) => b.target_date.localeCompare(a.target_date));
            sorted.forEach(item => {
                if (month && item.target_date.slice(5, 7) !== month) return;
                const d = new Date(item.target_date + 'T00:00:00');
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const label = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
                (item.data || []).forEach(r => finalRows.push([label, ...r]));
            });
            processedData = [{ sheetName: type === 'glovis' ? '글로비스_전체' : '모비스_전체', headers: finalHeaders, rows: finalRows }];
        } else {
            const item = rawData[0];
            processedData = [{ sheetName: item.target_date, headers: headers, rows: item.data || [] }];
        }
    }

    const workbook = new ExcelJS.Workbook();
    // 옅은 회색 배경 (D3D3D3)
    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    const HEADER_FONT = { bold: true, size: 10, name: '맑은 고딕' };
    const HEADER_BORDER = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
    const DEFAULT_CELL_FONT = { size: 10, name: '맑은 고딕' };
    const CELL_BORDER = {
        top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } }
    };

    processedData.forEach(pData => {
        const sheet = workbook.addWorksheet(pData.sheetName);
        const hRow = sheet.addRow(pData.headers);

        hRow.eachCell(cell => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.border = HEADER_BORDER;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        pData.rows.forEach(rowData => {
            const r = sheet.addRow(rowData);
            r.eachCell(cell => {
                cell.border = CELL_BORDER;
                cell.font = DEFAULT_CELL_FONT;
                cell.alignment = { vertical: 'middle' };
            });
        });

        // 틀고정
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        // 자동 필터
        sheet.autoFilter = { from: 'A1', to: { row: 1, column: pData.headers.length } };

        // 칼럼 너비 자동 조절 (내용 중 가장 긴 길이 기준)
        sheet.columns.forEach(col => {
            let maxLen = 8;
            col.eachCell({ includeEmpty: true }, (cell, rowNum) => {
                const val = cell.value ? String(cell.value) : '';
                let len = 0;
                for (let i = 0; i < val.length; i++) {
                    // 한글 2, 영문/숫자 1.1 가중치
                    len += val.charCodeAt(i) > 127 ? 2.1 : 1.1;
                }
                if (len > maxLen) maxLen = len;
            });
            col.width = Math.min(Math.ceil(maxLen) + 2, 80);
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const typeNames = { integrated: '통합현황', glovis: '글로비스KD', mobis: '모비스AS' };
    const typeName = typeNames[type] || type;
    const datePart = date === 'all' ? (month ? `${parseInt(month)}월` : '전체') : date;
    const filename = `아산_${typeName}_${datePart}.xlsx`;

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
    });
}
