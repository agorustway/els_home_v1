import { NextResponse } from 'next/server';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { ensureDaemon, getDaemonUrl } from '../daemon';

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
        const body = await req.json();
        const { useSavedCreds, userId, userPw } = body || {};
        const python = getPythonCommand();
        if (!python) {
            return NextResponse.json({
                ok: false,
                error: 'Python이 설치되어 있지 않습니다.',
                log: ['[서버] Python 미설치 또는 PATH에 없음.'],
            }, { status: 503 });
        }

        const useDaemon = await ensureDaemon();
        if (useDaemon) {
            try {
                const baseUrl = getDaemonUrl();
                const res = await fetch(`${baseUrl}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ useSavedCreds, userId, userPw }),
                });
                const data = await res.json().catch(() => ({}));
                return NextResponse.json({
                    ok: data.ok === true,
                    log: data.log || [],
                    error: data.error || undefined,
                });
            } catch (e) {
                return NextResponse.json({
                    ok: false,
                    error: String(e.message),
                    log: [String(e.message)],
                }, { status: 500 });
            }
        }

        const args = [RUNNER, 'login'];
        if (!useSavedCreds && userId) args.push('--user-id', String(userId));
        if (!useSavedCreds && userPw) args.push('--user-pw', String(userPw));
        const result = spawnSync(python, args, {
            cwd: ELSBOT_DIR,
            encoding: 'utf8',
            maxBuffer: 5 * 1024 * 1024,
            timeout: 120000,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            windowsHide: true,
        });
        let out = (result.stdout || '').trim();
        if (result.status !== 0) {
            const err = (result.stderr || result.error?.message || out || 'Unknown error').toString();
            return NextResponse.json({
                ok: false,
                error: err.slice(0, 500),
                log: [err],
            }, { status: 500 });
        }
        let data;
        try {
            const start = out.indexOf('{');
            const end = out.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end >= start) {
                data = JSON.parse(out.slice(start, end + 1));
            } else {
                data = JSON.parse(out);
            }
        } catch (parseErr) {
            return NextResponse.json({
                ok: false,
                error: '응답 파싱 실패. stdout가 JSON이 아닙니다.',
                log: [out.slice(0, 300), String(parseErr.message)],
            }, { status: 500 });
        }
        return NextResponse.json({
            ok: data.ok === true,
            log: data.log || [],
            error: data.error || undefined,
        });
    } catch (e) {
        return NextResponse.json({
            ok: false,
            error: String(e.message),
            log: [String(e.message)],
        }, { status: 500 });
    }
}
