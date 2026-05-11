require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data: dispatchRecords, error } = await supabase.from('branch_dispatch')
        .select('target_date, type, headers, data, comments')
        .eq('branch_id', 'asan')
        .gte('target_date', '2026-05-04')
        .lte('target_date', '2026-05-18')
        .order('target_date', { ascending: false });
    
    if (error) { console.error(error); return; }

    let totalSummary = {
        totalOrders: 0, byType: { mobis: 0, glovis: 0 },
        bySize: { '20FT': 0, '40FT': 0, '40HC': 0, '기타': 0 },
        byCarrier: {}, byRegion: {}, byTime: { order: {}, completion: {} }, byDate: {}
    };

    const nonRegionHeaders = ['순번', '담당자', '당당자', '운송사', '화주', '작업지', '운송지', '보관소', '포트', '도착지', '국가', '오더', '오더(계)', '계', '수량', '배차정보', '비고', '특이사항', 't', 'type', '규격', '유형'];
    const nonCarrierWords = ['캔슬', '완료', '미정', '착', '가이드', '추천', '메모', '문자수신', '차량번호', '미배차', '확인', 'nan'];

    dispatchRecords.forEach(record => {
        const { target_date: rec_date, type, headers, data: rows } = record;
        const dynamicRegionCols = headers.map((h, i) => ({ name: h ? h.trim() : '', index: i }))
            .filter(h => h.name && !nonRegionHeaders.includes(h.name.toLowerCase()));
        let orderIdx = -1;
        if (type === 'glovis') orderIdx = headers.findIndex(h => h && (h.trim() === '오더' || h.trim() === '오더(계)'));
        else if (type === 'mobis') orderIdx = headers.findIndex(h => h && (h.trim() === '계' || h.trim() === '오더(계)' || h.trim() === '수량'));
        if (orderIdx < 0) orderIdx = headers.findIndex(h => h && (h.trim() === '오더' || h.trim() === '수량' || h.trim() === '계'));
        const memoIdx = headers.findIndex(h => h && (h === '배차정보' || h === '비고' || h === '특이사항'));

        rows.forEach(row => {
            let orderCount = 0;
            if (orderIdx >= 0) {
                const valStr = String(row[orderIdx] || '').trim();
                if (valStr.includes('캔슬')) return;
                orderCount = parseInt(valStr.replace(/[^0-9]/g, '')) || 0;
            }
            let carrierTotalInRow = 0;
            let rowCarriers = [];
            dynamicRegionCols.forEach(col => {
                const cell = String(row[col.index] || '').trim();
                if (!cell || cell === '0' || cell === 'nan' || cell.includes('캔슬')) return;
                const parts = cell.split(/[,,/]/);
                parts.forEach(p => {
                    const part = p.trim();
                    if (!part || nonCarrierWords.some(w => part.includes(w))) return;
                    const countMatch = part.match(/\d+/);
                    const count = countMatch ? parseInt(countMatch[0]) : 1;
                    const carrier = part.replace(/[0-9\s]/g, '').trim();
                    if (carrier && carrier.length > 0) {
                        totalSummary.byCarrier[carrier] = (totalSummary.byCarrier[carrier] || 0) + count;
                        totalSummary.byRegion[col.name] = (totalSummary.byRegion[col.name] || 0) + count;
                        carrierTotalInRow += count;
                        rowCarriers.push(`${col.name}상차 ${carrier} ${count}대`);
                        if (!totalSummary.byDate[rec_date]) {
                            totalSummary.byDate[rec_date] = { orderCount: 0, dispatchCount: 0, byTypeOrders: {}, byTypeDispatches: {}, byCarrier: {}, timeLogs: [] };
                        }
                        totalSummary.byDate[rec_date].byCarrier[carrier] = (totalSummary.byDate[rec_date].byCarrier[carrier] || 0) + count;
                    }
                });
            });

            const effectiveCount = Math.max(orderCount, carrierTotalInRow);
            if (effectiveCount <= 0) return;

            if (!totalSummary.byDate[rec_date]) totalSummary.byDate[rec_date] = { orderCount: 0, dispatchCount: 0, byTypeOrders: {}, byTypeDispatches: {}, byCarrier: {}, timeLogs: [] };
            totalSummary.byDate[rec_date].orderCount += orderCount;
            totalSummary.byDate[rec_date].dispatchCount += carrierTotalInRow;
        });
    });

    const loadedDates = [...new Set(dispatchRecords.map(r => r.target_date))].sort();
    console.log('loadedDates:', loadedDates);
    console.log('5/09 Data:', totalSummary.byDate['2026-05-09']);
    console.log('5/11 Data:', totalSummary.byDate['2026-05-11']);
})();
