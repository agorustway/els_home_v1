import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { addIntranetExportWorksheet } from '@/utils/intranetExcelExport.mjs';
import {
    applyDispatchWebCellOverlay,
    createDispatchRowMetaBuilder,
    ensureDispatchWebCellHeaders,
    loadDispatchWebCellState,
    normalizeDispatchRecordHeaders,
    shouldIncludeDispatchRow,
} from '@/utils/asanDispatchWebCells.mjs';

function getSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeDispatchHeader(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

function findDispatchHeaderIndex(headers = [], target) {
    const normalizedTarget = normalizeDispatchHeader(target);
    return headers.findIndex(header => normalizeDispatchHeader(header) === normalizedTarget);
}

function isVisibleDispatchExportHeader(header) {
    const trimmed = (header || '').trim();
    const isJunk = (/^(col_\d+)$/i.test(trimmed) || ['A', 'B', '함축'].includes(trimmed))
        && !(trimmed.includes('BKG') || trimmed.includes('TARGET'));
    return !isJunk;
}

function mergeDispatchExportHeaders(records = []) {
    const headers = [];
    records.forEach(record => {
        (record.headers || []).forEach(header => {
            if (!isVisibleDispatchExportHeader(header)) return;
            if (findDispatchHeaderIndex(headers, header) >= 0) return;
            headers.push(header);
        });
    });
    return ensureDispatchWebCellHeaders(headers);
}

function mapDispatchExportRow(row = [], sourceHeaders = [], targetHeaders = []) {
    return targetHeaders.map(header => {
        const sourceIdx = findDispatchHeaderIndex(sourceHeaders, header);
        return sourceIdx >= 0 ? row[sourceIdx] : '';
    });
}

const NUMERIC_DISPATCH_EXPORT_HEADERS = new Set(
    ['오더(계)', '오더', '계', '수량', '배차'].map(normalizeDispatchHeader)
);

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'glovis';
    const date = searchParams.get('date');       // 'all' or 'YYYY-MM-DD'
    const month = searchParams.get('month');      // '01','02'... (전체탭 월필터)
    const weekStart = searchParams.get('weekStart');
    const weekEnd = searchParams.get('weekEnd');

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
        return new Response('Supabase 환경변수가 설정되지 않았습니다.', { status: 503 });
    }

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
    const records = (rawData || []).map(normalizeDispatchRecordHeaders);
    const webCellState = await loadDispatchWebCellState(supabase, records);

    // 통합현황(integrated) 처리 로직 (dispatch/route.js와 동일하게 구현)
    let processedData = [];
    let headers = [];

    if (type === 'integrated') {
        headers = [
            "구분", "화주", "담당자", "선적", "작업지", "고객사(국가)", "포트(도착항)", "특이사항(Nomi,구간)",
            "라인(선사명)", "TYPE", "배차정보", "오더(계)", "배차예정", "기타", "아산", "부산",
            "광양", "평택", "중부", "부곡", "인천", "배차", "검증", "BKG1", "BKG2", "BKG3", "TARGET VESSEL", "비고", "특이사항"
        ];

        const byDate = {};
        for (const item of records) {
            if (!byDate[item.target_date]) {
                byDate[item.target_date] = [];
            }

            const itemType = item.type;
            const normalizeHeader = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();
            const normalizedHeaders = (item.headers || []).map(normalizeHeader);
            const findHeader = (nameArr, predicate = () => true) => {
                const targets = nameArr.map(normalizeHeader);
                for (let target of targets) {
                    const idx = normalizedHeaders.findIndex((header, i) => predicate(i) && header === target);
                    if (idx >= 0) return idx;
                }
                for (let target of targets) {
                    const idx = normalizedHeaders.findIndex((header, i) => predicate(i) && header && header.includes(target));
                    if (idx >= 0) return idx;
                }
                return -1;
            };
            const getCol = (nameArr) => {
                return findHeader(nameArr);
            };
            const getColAfter = (nameArr, anchorArr) => {
                const anchor = getCol(anchorArr);
                if (anchor < 0) return -1;
                return findHeader(nameArr, idx => idx > anchor);
            };
            const getColBefore = (nameArr, anchorArr) => {
                const anchor = getCol(anchorArr);
                if (anchor < 0) return -1;
                return findHeader(nameArr, idx => idx < anchor);
            };
            const firstCol = (...indices) => indices.find(idx => idx >= 0) ?? -1;

            const mapCols = {
                "구분": getCol(["구분"]),
                "화주": getCol(["화주"]),
                "담당자": getCol(["담당자", "당당자"]),
                "선적": getCol(["선적"]),
                "작업지": getCol(["작업지"]),
                "고객사(국가)": itemType === 'glovis' ? getCol(["고객사"]) : getCol(["국가", "국가명"]),
                "포트(도착항)": itemType === 'glovis' ? getCol(["포트"]) : getCol(["도착항"]),
                "특이사항(Nomi,구간)": itemType === 'glovis'
                    ? firstCol(getCol(["특이사항(Nomi,구간)", "Nomi,구간"]), getColBefore(["특이사항"], ["라인", "선사명", "선사", "TYPE", "T"]))
                    : getCol(["Nomi,구간"]),
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
                "BKG1": getCol(["BKG1"]),
                "BKG2": getCol(["BKG2"]),
                "BKG3": getCol(["BKG3"]),
                "TARGET VESSEL": getCol(["TARGET VESSEL", "TARGETVESSEL"]),
                "비고": getCol(["비고"]),
                "특이사항": firstCol(
                    getColAfter(["특이사항", "툭이사항"], ["비고"]),
                    getColAfter(["특이사항", "툭이사항"], ["검증"]),
                    getColAfter(["특이사항", "툭이사항"], ["배차"])
                )
            };

            const buildRowMeta = createDispatchRowMetaBuilder({
                dispatchType: itemType,
                targetDate: item.target_date,
                headers: item.headers || [],
                legacyHeaders: item.webCellLegacyHeaders || [],
            });

            const dayRows = (item.data || []).filter(row => {
                return shouldIncludeDispatchRow(item.headers || [], row, itemType);
            }).map((row, rowIndex) => {
                const rowMeta = buildRowMeta(row, rowIndex);
                const mappedRow = headers.map(h => {
                    const cIdx = mapCols[h];
                    return cIdx >= 0 ? row[cIdx] : '';
                });
                return applyDispatchWebCellOverlay({
                    headers,
                    row: mappedRow,
                    meta: rowMeta,
                    cellMap: webCellState.cellMap,
                    enabled: webCellState.enabled,
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
                if (weekStart && weekEnd && (dStr < weekStart || dStr > weekEnd)) return;
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
        // 단일 타입 (glovis or mobis) - Junk 컬럼 필터링 (A, B, col_N 등)
        const item0 = records[0];
        headers = date === 'all'
            ? mergeDispatchExportHeaders(records)
            : mergeDispatchExportHeaders(item0 ? [item0] : []);

        if (date === 'all') {
            const finalHeaders = ['날짜', ...headers];
            const finalRows = [];
            const sorted = [...records].sort((a, b) => b.target_date.localeCompare(a.target_date));
            sorted.forEach(item => {
                if (month && item.target_date.slice(5, 7) !== month) return;
                if (weekStart && weekEnd && (item.target_date < weekStart || item.target_date > weekEnd)) return;
                const d = new Date(item.target_date + 'T00:00:00');
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const label = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
                const buildRowMeta = createDispatchRowMetaBuilder({
                    dispatchType: item.type,
                    targetDate: item.target_date,
                    headers: item.headers || [],
                    legacyHeaders: item.webCellLegacyHeaders || [],
                });

                (item.data || []).forEach((r, rowIndex) => {
                    if (!shouldIncludeDispatchRow(item.headers || [], r, item.type)) return;
                    const rowMeta = buildRowMeta(r, rowIndex);
                    const rowData = mapDispatchExportRow(r, item.headers || [], headers);
                    const finalRow = applyDispatchWebCellOverlay({
                        headers,
                        row: rowData,
                        meta: rowMeta,
                        cellMap: webCellState.cellMap,
                        enabled: webCellState.enabled,
                    });
                    finalRows.push([label, ...finalRow]);
                });
            });
            processedData = [{ sheetName: type === 'glovis' ? '글로비스_전체' : '모비스_전체', headers: finalHeaders, rows: finalRows }];
        } else {
            const item = records[0];
            const buildRowMeta = createDispatchRowMetaBuilder({
                dispatchType: item.type,
                targetDate: item.target_date,
                headers: item.headers || [],
                legacyHeaders: item.webCellLegacyHeaders || [],
            });

            const finalData = (item.data || []).filter(r => {
                return shouldIncludeDispatchRow(item.headers || [], r, item.type);
            }).map((r, rowIndex) => {
                const rowMeta = buildRowMeta(r, rowIndex);
                const rowData = mapDispatchExportRow(r, item.headers || [], headers);
                return applyDispatchWebCellOverlay({
                    headers,
                    row: rowData,
                    meta: rowMeta,
                    cellMap: webCellState.cellMap,
                    enabled: webCellState.enabled,
                });
            });
            processedData = [{ sheetName: item.target_date, headers: headers, rows: finalData }];
        }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();
    processedData.forEach(pData => {
        addIntranetExportWorksheet(workbook, {
            sheetName: pData.sheetName,
            headers: pData.headers,
            rows: pData.rows,
        }, { numericHeaders: NUMERIC_DISPATCH_EXPORT_HEADERS });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const typeNames = { integrated: '통합현황', glovis: '글로비스KD', mobis: '모비스AS' };
    const typeName = typeNames[type] || type;
    const datePart = date === 'all'
        ? weekStart && weekEnd
            ? `${weekStart}_${weekEnd}`
            : (month ? `${parseInt(month)}월` : '전체')
        : date;
    const filename = `아산_${typeName}_${datePart}.xlsx`;

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
    });
}
