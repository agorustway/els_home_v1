import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
            const getCol = (nameArr) => {
                for (let n of nameArr) {
                    const idx = item.headers.findIndex(h => h.trim() === n);
                    if (idx >= 0) return idx;
                }
                return -1;
            };

            const mapCols = {
                "구분": getCol(["구분"]),
                "화주": getCol(["화주"]),
                "담당자": getCol(["담당자", "당당자"]),
                "작업지": getCol(["작업지"]),
                "고객사(국가)": itemType === 'glovis' ? getCol(["고객사"]) : getCol(["국가"]),
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

            const currentOffset = byDate[item.target_date].data.length;
            (item.data || []).forEach((row, rIdx) => {
                const newRow = unifiedHeaders.map(h => {
                    const cIdx = mapCols[h];
                    return cIdx >= 0 ? row[cIdx] : '';
                });
                byDate[item.target_date].data.push(newRow);

                Object.entries(item.comments || {}).forEach(([k, v]) => {
                    const [ri, ci] = k.split(':').map(Number);
                    if (ri === rIdx) {
                        let uniIdx = -1;
                        // Find matching unified column index
                        for (let i = 0; i < unifiedHeaders.length; i++) {
                            if (mapCols[unifiedHeaders[i]] === ci) { uniIdx = i; break; }
                        }
                        if (uniIdx >= 0) {
                            byDate[item.target_date].comments[`${currentOffset + rIdx}:${uniIdx}`] = v;
                        }
                    }
                });
            });
        }

        const integratedData = Object.values(byDate).sort((a, b) => a.target_date.localeCompare(b.target_date));
        return NextResponse.json({ data: integratedData });
    }

    return NextResponse.json({ data: data || [] });
}
