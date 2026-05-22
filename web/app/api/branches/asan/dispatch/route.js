import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    applyDispatchWebCellOverlay,
    createDispatchRowMetaBuilder,
    loadDispatchWebCellState,
    normalizeDispatchRecordHeaders,
    shouldIncludeDispatchRow,
} from '@/utils/asanDispatchWebCells.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // [v5.10.22] 데이터 부정합 문제로 캐시 완전 비활성화 (정확성 우선)

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'glovis';

    let query = supabase
        .from('branch_dispatch')
        .select('*')
        .eq('branch_id', 'asan')
        .order('target_date', { ascending: true });

    if (type !== 'integrated') {
        query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const records = (data || []).map(normalizeDispatchRecordHeaders);
    const webCellState = await loadDispatchWebCellState(supabase, records);

    if (type === 'integrated') {
        const unifiedHeaders = [
            "구분", "화주", "담당자", "작업지", "고객사(국가)", "포트(도착항)", "특이사항(Nomi,구간)",
            "라인(선사명)", "TYPE", "배차정보", "오더(계)", "배차예정", "기타", "아산", "부산",
            "광양", "평택", "중부", "부곡", "인천", "배차", "검증", "BKG1", "BKG2", "BKG3", "TARGET VESSEL", "비고", "특이사항"
        ];

        const byDate = {};
        
        for (const item of records) {
            if (!byDate[item.target_date]) {
                byDate[item.target_date] = {
                    id: `integ_${item.target_date}`,
                    branch_id: 'asan',
                    type: 'integrated',
                    target_date: item.target_date,
                    headers: unifiedHeaders,
                    data: [],
                    comments: {},
                    webCellRows: [],
                    file_modified_at: item.file_modified_at
                };
            }
            // Update file_modified_at to max
            if (new Date(item.file_modified_at) > new Date(byDate[item.target_date].file_modified_at)) {
                byDate[item.target_date].file_modified_at = item.file_modified_at;
            }

            const itemType = item.type; // 'glovis' or 'mobis'
            // [v5.10.21] 더 정교한 컬럼 매핑 (완전 일치 우선, 그 다음 부분 일치)
            const normalizeHeader = (value) => (value || '').replace(/\s+/g, '').toUpperCase();
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
                "작업지": getCol(["작업지"]),
                "고객사(국가)": itemType === 'glovis' ? getCol(["고객사"]) : getCol(["국가", "국가명"]),
                "포트(도착항)": itemType === 'glovis' ? getCol(["포트"]) : getCol(["도착항"]),
                "특이사항(Nomi,구간)": itemType === 'glovis'
                    ? firstCol(getCol(["특이사항(Nomi,구간)", "Nomi,구간"]), getColBefore(["특이사항"], ["라인", "선사명", "선사", "TYPE", "T"]))
                    : getCol(["Nomi,구간"]),
                "라인(선사명)": itemType === 'glovis' ? getCol(["라인", "선사"]) : getCol(["선사명", "선사"]),
                "TYPE": getCol(["TYPE", "T"]),
                "배차정보": getCol(["배차정보"]),
                "오더(계)": itemType === 'glovis' ? getCol(["오더", "오더(계)"]) : getCol(["계", "수량", "오더"]),
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
                "특이사항": getColAfter(["특이사항"], ["비고"])
            };

            const buildRowMeta = createDispatchRowMetaBuilder({
                dispatchType: itemType,
                targetDate: item.target_date,
                headers: item.headers || [],
            });
            (item.data || []).forEach((row, rIdx) => {
                if (!shouldIncludeDispatchRow(item.headers || [], row, itemType)) return;

                const rowMeta = buildRowMeta(row, rIdx);
                const mappedRow = unifiedHeaders.map(h => {
                    const cIdx = mapCols[h];
                    return cIdx >= 0 ? row[cIdx] : '';
                });
                const newRow = applyDispatchWebCellOverlay({
                    headers: unifiedHeaders,
                    row: mappedRow,
                    meta: rowMeta,
                    cellMap: webCellState.cellMap,
                    enabled: webCellState.enabled,
                });

                byDate[item.target_date].data.push(newRow);
                byDate[item.target_date].webCellRows.push(webCellState.enabled ? rowMeta : null);

                const newRi = byDate[item.target_date].data.length - 1;

                Object.entries(item.comments || {}).forEach(([k, v]) => {
                    const [ri, ci] = k.split(':').map(Number);
                    if (ri === rIdx) {
                        let uniIdx = -1;
                        // Find matching unified column index
                        for (let i = 0; i < unifiedHeaders.length; i++) {
                            if (mapCols[unifiedHeaders[i]] === ci) { uniIdx = i; break; }
                        }
                        if (uniIdx >= 0) {
                            byDate[item.target_date].comments[`${newRi}:${uniIdx}`] = v;
                        }
                    }
                });
            });
        }

        const integratedData = Object.values(byDate).sort((a, b) => a.target_date.localeCompare(b.target_date));
        return NextResponse.json({ data: integratedData });
    }

    if (type !== 'integrated') {
        // Filter out junk columns for specific views (e.g. col_31, A, B...)
        const filteredData = records.map(item => {
            const validIndices = [];
            const newHeaders = item.headers.filter((h, i) => {
                const trimmed = (h || '').trim();
                // [v5.10.20] A, B, 함축 및 col_N 형식 컬럼은 제외하되, 사용자가 요청한 BKG/TARGET은 보존
                const isJunk = (/^(col_\d+)$/i.test(trimmed) || ['A', 'B', '함축'].includes(trimmed)) && 
                               !(trimmed.includes('BKG') || trimmed.includes('TARGET'));
                if (!isJunk) validIndices.push(i);
                return !isJunk;
            });

            // [v5.10.21] 통합현황과 동일한 로직으로 컬럼 찾기 (완전 일치 우선)
            const getCol = (nameArr) => {
                // 1. 완전 일치 우선 검색
                for (let n of nameArr) {
                    const idx = item.headers.findIndex(h => {
                        const trimmed = (h || '').replace(/\s+/g, '');
                        const target = n.replace(/\s+/g, '');
                        return trimmed === target;
                    });
                    if (idx >= 0) return idx;
                }
                // 2. 부분 일치 검색
                for (let n of nameArr) {
                    const idx = item.headers.findIndex(h => {
                        const trimmed = (h || '').replace(/\s+/g, '');
                        const target = n.replace(/\s+/g, '');
                        return trimmed.includes(target);
                    });
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            const newData = [];
            const webCellRows = [];
            const rowMapping = {}; // old_ri -> new_ri
            const buildRowMeta = createDispatchRowMetaBuilder({
                dispatchType: item.type,
                targetDate: item.target_date,
                headers: item.headers || [],
            });
            
            (item.data || []).forEach((row, ri) => {
                if (!shouldIncludeDispatchRow(item.headers || [], row, item.type)) return;
                rowMapping[ri] = newData.length;
                const rowMeta = buildRowMeta(row, ri);
                const mappedRow = validIndices.map(vi => row[vi]);
                newData.push(applyDispatchWebCellOverlay({
                    headers: newHeaders,
                    row: mappedRow,
                    meta: rowMeta,
                    cellMap: webCellState.cellMap,
                    enabled: webCellState.enabled,
                }));
                webCellRows.push(webCellState.enabled ? rowMeta : null);
            });

            const newComments = {};
            if (item.comments) {
                Object.entries(item.comments).forEach(([k, v]) => {
                    const [ri, ci] = k.split(':').map(Number);
                    if (rowMapping[ri] !== undefined) {
                        const newRi = rowMapping[ri];
                        const newCi = validIndices.indexOf(ci);
                        if (newCi !== -1) {
                            newComments[`${newRi}:${newCi}`] = v;
                        }
                    }
                });
            }

            return {

                ...item,
                headers: newHeaders,
                data: newData,
                comments: newComments,
                webCellRows
            };
        });
        return NextResponse.json({ data: filteredData });
    }
}
