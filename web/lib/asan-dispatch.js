const { createClient: createWebDAV } = require('webdav');
const ExcelJS = require('exceljs');
const { createClient: createSupabase } = require('@supabase/supabase-js');

/**
 * 아산지점 배차판 엑셀 파서
 * 
 * [글로비스 KD 외] scan_result.txt 기반 확정 좌표 (2026-03-01 검증완료):
 *   헤더행=4, 데이터시작=5, 필터=M열(13번=오더)
 *   Col 1~28: 구분,화주,당당자,보관소,작업,작업지,고객사,포트,특이사항,선적,라인,T,오더,배차정보,배차예정,기타/철송,아산,부산,광양,평택,중부,부곡,인천,배차,검증,비고,BKG,TARGET VESSEL
 *
 * [모비스 AS] 필터=P열(16번), 헤더/구조는 파일 확인 후 추가
 */

// 엑셀 셀 값을 안전한 문자열로 변환
function safeValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    const v = cell.value;
    if (typeof v === 'object') {
        // 수식 결과
        if ('result' in v) {
            if (v.result === null || v.result === undefined) return '';
            if (typeof v.result === 'object') {
                // Error 타입 (#REF!, #VALUE! 등)
                if (v.result.error) return '';
                return '';
            }
            return String(v.result);
        }
        // 리치 텍스트
        if (v.richText) return v.richText.map(t => t.text || '').join('');
        // 날짜
        if (v instanceof Date) return v.toISOString().split('T')[0];
        // 공유 수식 등 기타 오브젝트 → 빈 문자열
        if (v.sharedFormula || v.formula || v.shareType) return '';
        // 나머지
        try {
            const s = JSON.stringify(v);
            return s === '{}' ? '' : s;
        } catch { return ''; }
    }
    return String(v);
}

// 시트 이름 → 날짜 문자열 변환
// "3.3" → "2026-03-03" (현재 연도 기준, 12월 시트는 전년도)
function sheetNameToDate(name) {
    const m = name.match(/(\d+)\.(\d+)/);
    if (!m) return null;
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    // 시트 월이 현재 월보다 훨씬 크면 (예: 12월 시트인데 지금 3월) → 전년도
    let year = currentYear;
    if (month > currentMonth + 3) year = currentYear - 1;
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

// 셀 메모(코멘트) 추출
function safeNote(cell) {
    if (!cell || !cell.note) return '';
    const n = cell.note;
    if (typeof n === 'string') return n.trim();
    if (n.texts) return n.texts.map(t => t.text || '').join('').trim();
    return '';
}

/**
 * 시트 하나를 파싱 → { headers, rows, comments }
 * comments는 { "rowIdx:colIdx": "메모텍스트" } 형식
 */
function parseSheet(sheet, type) {
    let headerRowIdx = -1;
    // 헤더 검색 범위를 30줄로 확장
    for (let r = 1; r <= 30; r++) {
        const row = sheet.getRow(r);
        let found = false;
        row.eachCell({ includeEmpty: true }, (cell) => {
            const v = safeValue(cell);
            if (v && v.includes('구분')) found = true;
        });
        if (found) { headerRowIdx = r; break; }
    }
    if (headerRowIdx < 0) return null;

    const headerRow = sheet.getRow(headerRowIdx);
    const headers = [];
    let maxCol = 0;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
        if (colNum > maxCol) maxCol = colNum;
    });

    for (let c = 1; c <= maxCol; c++) {
        let val = safeValue(headerRow.getCell(c)).replace(/\n/g, ' ').trim();
        if (val === '당당자') val = '담당자';
        if (val === 'T') val = 'TYPE';
        if (val === '국가명') val = '국가';
        headers.push(val || `col_${c}`);
    }

    const filterCol = type === 'glovis' ? 13 : 16;
    const rows = [];
    const comments = {}; // sparse: "rowIdx:colIdx" → "text"

    // 전체 시트에서 메모(note) 추출 (사전 캐싱으로 성능 확보 고려 가능하나 현재는 루프 내 처리)
    for (let r = headerRowIdx + 1; r <= 800; r++) {
        const row = sheet.getRow(r);
        if (!row) continue;
        
        const firstVal = safeValue(row.getCell(1));
        if (firstVal && firstVal.includes('합계')) break;

        const filterVal = safeValue(row.getCell(filterCol));
        if (!filterVal || filterVal === '0' || filterVal === 'nan') continue;

        const rowIdx = rows.length;
        const rowData = [];
        for (let c = 1; c <= maxCol; c++) {
            const cell = row.getCell(c);
            rowData.push(safeValue(cell));
            // 메모(exceljs에서는 note) 추출
            const note = safeNote(cell);
            if (note) comments[`${rowIdx}:${c - 1}`] = note;
        }
        rows.push(rowData);
    }

    return { headers, rows, comments };
}

function isMissingDispatchCountColumn(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('row_count') || message.includes('valid_row_count');
}

async function upsertDispatchSheet(supabase, payload) {
    const upsertOptions = { onConflict: 'branch_id,type,target_date' };
    const { error } = await supabase.from('branch_dispatch').upsert(payload, upsertOptions);
    if (!error) return { error: null };
    if (!isMissingDispatchCountColumn(error)) return { error };
    const fallbackPayload = { ...payload };
    delete fallbackPayload.row_count;
    delete fallbackPayload.valid_row_count;
    return supabase.from('branch_dispatch').upsert(fallbackPayload, upsertOptions);
}

/**
 * 메인 동기화 함수
 * NAS에서 엑셀 파일을 읽어서 Supabase에 저장
 */
async function syncAsanDispatch() {
    const supabase = createSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 설정 가져오기
    const { data: settings, error: settErr } = await supabase
        .from('branch_dispatch_settings').select('*')
        .eq('branch_id', 'asan').single();
    if (settErr || !settings) throw new Error('Settings not found: ' + (settErr?.message || ''));

    const client = createWebDAV(process.env.NAS_URL, {
        username: process.env.NAS_USER,
        password: process.env.NAS_PW
    });

    const results = [];

    for (const type of ['glovis', 'mobis']) {
        const filePath = type === 'glovis' ? settings.glovis_path : settings.mobis_path;
        if (!filePath) { results.push({ type, success: false, error: '파일 경로 미설정' }); continue; }

        try {
            // 파일 수정시간 가져오기 (NAS 실제 저장 시간)
            const fileStat = await client.stat(filePath);
            const fileModifiedAt = fileStat.lastmod ? new Date(fileStat.lastmod).toISOString() : null;

            const buffer = await client.getFileContents(filePath);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);

            let syncCount = 0;

            for (const sheet of workbook.worksheets) {
                const targetDate = sheetNameToDate(sheet.name);
                if (!targetDate) continue; // 날짜 시트가 아니면 스킵

                const parsed = parseSheet(sheet, type);
                if (!parsed || parsed.rows.length === 0) continue;

                // 파일에서 사라진 과거 시트는 마감 스냅샷으로 보존하고, 현재 파일 날짜만 갱신한다.
                const { error: insErr } = await upsertDispatchSheet(supabase, {
                    branch_id: 'asan',
                    type,
                    target_date: targetDate,
                    headers: parsed.headers,
                    data: parsed.rows,
                    comments: parsed.comments || {},
                    row_count: parsed.rows.length,
                    valid_row_count: parsed.rows.length,
                    file_modified_at: fileModifiedAt,
                    updated_at: new Date().toISOString()
                });

                if (insErr) console.error(`Upsert error (${sheet.name}):`, insErr.message);
                else syncCount++;
            }

            results.push({ type, success: true, sheets: syncCount });
        } catch (e) {
            results.push({ type, success: false, error: e.message });
        }
    }

    return results;
}

module.exports = { syncAsanDispatch };
