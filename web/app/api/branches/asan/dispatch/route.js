import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // [v5.10.19] 1분 캐싱 허용으로 로딩 속도 대폭 개선

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

    if (type === 'integrated') {
        const unifiedHeaders = [
            "구분", "화주", "담당자", "작업지", "고객사(국가)", "포트(도착항)", "특이사항(Nomi,구간)",
            "라인(선사명)", "TYPE", "배차정보", "오더(계)", "배차예정", "기타", "아산", "부산",
            "광양", "평택", "중부", "부곡", "인천", "배차", "검증", "비고"
        ];

        const byDate = {};
        
        // [v5.10.20] 엑셀에서 헤더가 비어있어 col_12, col_15로 파싱된 TYPE 컬럼을 복구 (통합현황 및 개별현황 모두 적용)
        (data || []).forEach(item => {
            if (item.type === 'glovis') {
                const idx = item.headers.indexOf('col_12');
                if (idx >= 0) item.headers[idx] = 'T';
            } else if (item.type === 'mobis') {
                const idx = item.headers.indexOf('col_15');
                if (idx >= 0) item.headers[idx] = 'TYPE';
            }
        });

        for (const item of (data || [])) {
            if (!byDate[item.target_date]) {
                byDate[item.target_date] = {
                    id: `integ_${item.target_date}`,
                    branch_id: 'asan',
                    type: 'integrated',
                    target_date: item.target_date,
                    headers: unifiedHeaders,
                    data: [],
                    comments: {},
                    file_modified_at: item.file_modified_at
                };
            }
            // Update file_modified_at to max
            if (new Date(item.file_modified_at) > new Date(byDate[item.target_date].file_modified_at)) {
                byDate[item.target_date].file_modified_at = item.file_modified_at;
            }

            const itemType = item.type; // 'glovis' or 'mobis'
            // [v5.10.21] 더 정교한 컬럼 매핑 (완전 일치 우선, 그 다음 부분 일치)
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
                // 2. 부분 일치 검색 (완전 일치가 없을 경우에만)
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
                "비고": getCol(["비고"])
            };

            const currentOffset = byDate[item.target_date].data.length;
            const orderColIdx = unifiedHeaders.indexOf('오더(계)');
            (item.data || []).forEach((row, rIdx) => {
                const newRow = unifiedHeaders.map(h => {
                    const cIdx = mapCols[h];
                    return cIdx >= 0 ? row[cIdx] : '';
                });
                // [v5.10.20] 컬럼 매핑 성공 시에만 필터링 수행 (매핑 실패 시 데이터 유실 방지)
                const cIdxForOrder = mapCols['오더(계)'];
                if (cIdxForOrder >= 0) {
                    const orderVal = String(row[cIdxForOrder] || '').trim();
                    if (!orderVal || orderVal === '0' || orderVal === 'nan' || orderVal === 'None') return;
                }

                byDate[item.target_date].data.push(newRow);

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
        const filteredData = (data || []).map(item => {
            const validIndices = [];
            const newHeaders = item.headers.filter((h, i) => {
                const trimmed = (h || '').trim();
                const isJunk = /^(col_\d+)$/i.test(trimmed) || trimmed === '함축'; // [v5.10.16] 'T' 컬럼 필터링 방지
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

            let targetIdx = -1;
            if (item.type === 'glovis') {
                targetIdx = getCol(['오더', '오더(계)']);
            } else if (item.type === 'mobis') {
                targetIdx = getCol(['계', '수량', '오더']);
            }

            const newData = [];
            const rowMapping = {}; // old_ri -> new_ri
            
            (item.data || []).forEach((row, ri) => {
                if (targetIdx >= 0) {
                    const val = String(row[targetIdx] || '').trim();
                    if (!val || val === '0' || val === 'nan' || val === 'None') return;
                }
                rowMapping[ri] = newData.length;
                newData.push(validIndices.map(vi => row[vi]));
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
                comments: newComments
            };
        });
        return NextResponse.json({ data: filteredData });
    }
}
