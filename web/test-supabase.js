const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
    const { data, error } = await supabase.from('branch_dispatch').select('*').eq('branch_id', 'asan').eq('target_date', '2026-05-09');
    if (error) {
        console.error("Error:", error);
        return;
    }
    console.log(`Fetched ${data.length} records for 2026-05-09`);
    for (const record of data) {
        console.log(`\n=== TYPE: ${record.type} ===`);
        const rows = record.data;
        const headers = record.headers;
        console.log(`Total rows: ${rows.length}`);
        
        // Find rows with '10' in comments or '배차정보'
        const dispatchInfoIdx = headers.findIndex(h => h && h.trim() === '배차정보');
        let count = 0;
        
        rows.forEach((row, ri) => {
            let has10 = false;
            let timeComments = [];
            
            Object.entries(record.comments || {}).forEach(([key, val]) => {
                if (key.startsWith(`${ri}:`)) {
                    if (String(val).includes('10')) {
                        has10 = true;
                        timeComments.push(val);
                    }
                }
            });
            
            if (dispatchInfoIdx >= 0) {
                const cellVal = String(row[dispatchInfoIdx] || '').trim();
                if (cellVal.includes('10')) {
                    has10 = true;
                    timeComments.push(`[배차정보 열] ${cellVal}`);
                }
            }
            
            if (has10) {
                count++;
                console.log(`Row ${ri}: ${row.join(' | ')}`);
                console.log(`  Match reasons: ${timeComments.join(', ')}`);
            }
        });
        
        console.log(`Found ${count} rows matching '10'`);
    }
}
test();
