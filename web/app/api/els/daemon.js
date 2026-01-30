import path from 'path';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const ELSBOT_DIR = path.join(process.cwd(), '..', 'elsbot');
const DAEMON_SCRIPT = path.join(ELSBOT_DIR, 'els_web_runner_daemon.py');
const DAEMON_URL = 'http://127.0.0.1:31999';
const HEALTH_URL = `${DAEMON_URL}/health`;

let daemonProc = null;

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

export async function ensureDaemon() {
    try {
        const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return true;
    } catch (_) {}

    const python = getPythonCommand();
    if (!python) return false;

    if (daemonProc) {
        try {
            daemonProc.kill();
        } catch (_) {}
        daemonProc = null;
    }

    daemonProc = spawn(python, [DAEMON_SCRIPT], {
        cwd: ELSBOT_DIR,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
    });
    daemonProc.unref();

    for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
            const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
            if (res.ok) return true;
        } catch (_) {}
    }
    return false;
}

export function getDaemonUrl() {
    return DAEMON_URL;
}
