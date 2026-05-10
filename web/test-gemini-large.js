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

    const apiKey = process.env.GEMINI_API_KEY;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiPayload = {
        system_instruction: { parts: [{ text: dispatchText }] },
        contents: [
            { role: 'user', parts: [{ text: '오늘 모비스 10:00배차 작업 어떤거야?' }] }
        ]
    };

    const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
    });

    console.log('Status:', res.status);
    if (!res.ok) {
        console.log('Error text:', await res.text());
    } else {
        console.log('Success!');
    }
}
run();
