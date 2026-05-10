const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: dispatchRecords } = await supabase.from('branch_dispatch').select('target_date, type, headers, data, comments').eq('branch_id', 'asan').eq('target_date', '2026-05-09');
    let dispatchText = '';
    let totalRowsAdded = 0;
    dispatchRecords.forEach(record => {
        const { target_date, type, headers, data: rows, comments } = record;
        let filteredRows = [];
        rows.forEach((row, ri) => {
            filteredRows.push({ row, ri });
        });
        dispatchText += `\n### [${target_date}] ${type.toUpperCase()} 배차\n`;
        filteredRows.forEach(({ row, ri }) => {
            if (totalRowsAdded > 2000) return;
            const rowData = row.map((c, ci) => {
                if (!c || c === 'nan' || c === '0') return null;
                const hName = headers[ci];
                const ck = `${ri}:${ci}`;
                const comment = comments?.[ck] ? ` (메모: ${comments[ck].replace(/\n/g, ' ')})` : '';
                return `[${hName}] ${c}${comment}`;
            }).filter(Boolean).join(' | ');
            dispatchText += `- 행${ri}: ${rowData}\n`;
            totalRowsAdded++;
        });
    });
    console.log('Total characters:', dispatchText.length);
    console.log('Total rows added:', totalRowsAdded);
}
run();
