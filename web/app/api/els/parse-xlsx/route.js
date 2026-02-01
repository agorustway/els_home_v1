import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execSync, spawnSync } from 'child_process';
import * as XLSX from 'xlsx';
import { proxyToBackend } from '../proxyToBackend';

const ELSBOT_DIR = path.join(process.cwd(), '..', 'elsbot');
const RUNNER = path.join(ELSBOT_DIR, 'els_web_runner.py');

function getPythonCommand() {
    try {
        execSync('python --version', { stdio: 'pipe' });
        return 'python';
    } catch {
        try {
            execSync('python3 --version', { stdio: 'pipe' });
            return 'python3';
        } catch {
            return null;
        }
    }
}

/** Python 없을 때(Vercel 등) Node만으로 엑셀에서 컨테이너 번호 추출. A1=헤더, A2부터 데이터. */
function parseXlsxWithNode(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!Array.isArray(data) || data.length < 2) return [];
    const containers = [];
    for (let i = 1; i < data.length; i++) {
        const cell = data[i][0];
        if (cell == null) continue;
        const s = String(cell).trim().toUpperCase();
        if (s) containers.push(s);
    }
    return [...new Set(containers)];
}

export async function POST(req) {
    const proxied = await proxyToBackend(req);
    if (proxied) return proxied;
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        if (!file || !file.name?.toLowerCase().endsWith('.xlsx')) {
            return NextResponse.json({ error: 'container_list.xlsx 형식만 지원합니다.' }, { status: 400 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        const python = getPythonCommand();

        if (python && fs.existsSync(RUNNER)) {
            const tmpDir = path.join(process.cwd(), 'node_modules', '.cache', 'els');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const tmpPath = path.join(tmpDir, `upload_${Date.now()}.xlsx`);
            fs.writeFileSync(tmpPath, buf);
            try {
                const result = spawnSync(python, [RUNNER, 'parse', tmpPath], {
                    cwd: ELSBOT_DIR,
                    encoding: 'utf8',
                    maxBuffer: 10 * 1024 * 1024,
                    windowsHide: true,
                });
                const out = (result.stdout || '').trim();
                if (result.status !== 0) {
                    throw new Error(result.stderr || result.error?.message || 'parse failed');
                }
                const data = JSON.parse(out);
                return NextResponse.json({ containers: data.containers || [] });
            } finally {
                try { fs.unlinkSync(tmpPath); } catch (_) {}
            }
        }

        return NextResponse.json({ containers: parseXlsxWithNode(buf) });
    } catch (e) {
        const msg = e.stderr || e.message || '파싱 실패';
        return NextResponse.json({ error: String(msg) }, { status: 500 });
    }
}
