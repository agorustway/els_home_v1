import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execSync, spawnSync } from 'child_process';

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

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        if (!file || !file.name?.toLowerCase().endsWith('.xlsx')) {
            return NextResponse.json({ error: 'container_list.xlsx 형식만 지원합니다.' }, { status: 400 });
        }
        const python = getPythonCommand();
        if (!python) {
            return NextResponse.json({ error: 'Python이 설치되어 있지 않습니다. 엑셀 파싱은 서버에 Python이 필요합니다.' }, { status: 503 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
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
    } catch (e) {
        const msg = e.stderr || e.message || '파싱 실패';
        return NextResponse.json({ error: String(msg) }, { status: 500 });
    }
}
