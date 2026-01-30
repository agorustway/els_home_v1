import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { proxyToBackend } from '../proxyToBackend';

const UNAVAILABLE_REASON =
    '로그인·조회는 Chrome(브라우저 자동화)이 필요해 Vercel 서버리스 환경에서는 불가합니다. 엑셀 파싱(번호 추출)만 사용 가능하며, 전체 기능은 로컬 또는 데스크탑 앱에서 이용하세요.';

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

export async function GET(req) {
    const proxied = await proxyToBackend(req);
    if (proxied) return proxied;
    try {
        if (process.env.VERCEL === '1') {
            return NextResponse.json({
                available: false,
                parseAvailable: true,
                reason: UNAVAILABLE_REASON,
            });
        }
        const python = getPythonCommand();
        if (!python) {
            return NextResponse.json({
                available: false,
                parseAvailable: true,
                reason: UNAVAILABLE_REASON,
            });
        }
        return NextResponse.json({ available: true, parseAvailable: true });
    } catch (e) {
        return NextResponse.json({
            available: false,
            parseAvailable: true,
            reason: UNAVAILABLE_REASON,
        });
    }
}
