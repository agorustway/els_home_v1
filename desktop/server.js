/**
 * ELS 컨테이너 이력조회 데스크탑 앱 - 로컬 API 서버
 * Express로 /api/els/* 구현 (Python/elsbot 호출)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync, spawn, spawnSync } = require('child_process');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const fileStore = new Map();

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

function createServer(port, opts) {
    const { elsbotDir, staticDir, host = '127.0.0.1' } = opts || {};
    const ELSBOT_DIR = elsbotDir || path.join(__dirname, '..', 'elsbot');
    const CONFIG_PATH = path.join(ELSBOT_DIR, 'els_config.json');
    const RUNNER = path.join(ELSBOT_DIR, 'els_web_runner.py');

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    const upload = multer({ dest: path.join(require('os').tmpdir(), 'els-upload') });

    // ----- API 라우트 (정적 서빙보다 먼저) -----

    // GET /api/els/capabilities
    app.get('/api/els/capabilities', (req, res) => {
        const python = getPythonCommand();
        if (!python) {
            return res.json({ available: false, reason: 'Python이 설치되어 있지 않습니다. Python과 Chrome을 설치한 뒤 다시 실행해 주세요.' });
        }
        res.json({ available: true });
    });

    // GET /api/els/config
    app.get('/api/els/config', (req, res) => {
        try {
            if (!fs.existsSync(CONFIG_PATH)) {
                return res.json({ hasSaved: false, defaultUserId: '' });
            }
            const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
            const config = JSON.parse(raw);
            const userId = config.user_id || '';
            const hasSaved = Boolean(userId && (config.user_pw || '').length > 0);
            res.json({ hasSaved, defaultUserId: userId || '' });
        } catch (e) {
            res.json({ hasSaved: false, defaultUserId: '' });
        }
    });

    // POST /api/els/config
    app.post('/api/els/config', (req, res) => {
        try {
            const userId = req.body?.userId != null ? String(req.body.userId).trim() : '';
            const userPw = req.body?.userPw != null ? String(req.body.userPw) : '';
            if (!userId || !userPw) {
                return res.status(400).json({ error: '아이디와 비밀번호가 필요합니다.' });
            }
            const dir = path.dirname(CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ user_id: userId, user_pw: userPw }, null, 2), 'utf8');
            res.json({ success: true, defaultUserId: userId });
        } catch (e) {
            res.status(500).json({ error: String(e.message) });
        }
    });

    // POST /api/els/login
    app.post('/api/els/login', (req, res) => {
        try {
            const { useSavedCreds, userId, userPw } = req.body || {};
            const python = getPythonCommand();
            if (!python) {
                return res.status(503).json({
                    ok: false,
                    error: 'Python이 설치되어 있지 않습니다. Python과 Chrome을 설치한 뒤 다시 실행해 주세요.',
                    log: ['[서버] Python 미설치 또는 PATH에 없음.'],
                });
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
                return res.status(500).json({ ok: false, error: err.slice(0, 500), log: [err] });
            }
            let data;
            try {
                const start = out.indexOf('{');
                const end = out.lastIndexOf('}');
                data = start !== -1 && end >= start ? JSON.parse(out.slice(start, end + 1)) : JSON.parse(out);
            } catch (parseErr) {
                return res.status(500).json({ ok: false, error: '응답 파싱 실패.', log: [out.slice(0, 300)] });
            }
            res.json({ ok: data.ok === true, log: data.log || [], error: data.error });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e.message), log: [String(e.message)] });
        }
    });

    // POST /api/els/run (스트리밍)
    app.post('/api/els/run', (req, res) => {
        try {
            const { containers, useSavedCreds, userId, userPw } = req.body || {};
            if (!Array.isArray(containers) || containers.length === 0) {
                return res.status(400).json({ error: 'containers 배열이 필요합니다.' });
            }
            const python = getPythonCommand();
            if (!python) {
                return res.status(503).json({
                    error: 'Python이 설치되어 있지 않습니다.',
                    log: ['[서버] Python 미설치 또는 PATH에 없음.'],
                });
            }
            const containersJson = JSON.stringify(containers);
            const args = [RUNNER, 'run', '--containers', containersJson];
            if (!useSavedCreds && userId) args.push('--user-id', String(userId));
            if (!useSavedCreds && userPw) args.push('--user-pw', String(userPw));

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.flushHeaders();

            const proc = spawn(python, args, {
                cwd: ELSBOT_DIR,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                windowsHide: true,
            });

            let buffer = '';
            let resultSent = false;

            function sendLog(line) {
                if (line.trim()) res.write('LOG:' + line + '\n');
            }

            function sendResult(obj) {
                if (resultSent) return;
                resultSent = true;
                let downloadToken = null;
                if (obj.output_path && fs.existsSync(obj.output_path)) {
                    const buf = fs.readFileSync(obj.output_path);
                    try { fs.unlinkSync(obj.output_path); } catch (_) {}
                    downloadToken = crypto.randomBytes(16).toString('hex');
                    fileStore.set(downloadToken, buf);
                    setTimeout(() => fileStore.delete(downloadToken), 60 * 60 * 1000);
                }
                res.write('RESULT:' + JSON.stringify({
                    sheet1: obj.sheet1 || [],
                    sheet2: obj.sheet2 || [],
                    downloadToken,
                    error: obj.error,
                }) + '\n');
                res.end();
            }

            proc.stdout.setEncoding('utf8');
            proc.stdout.on('data', (chunk) => {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('{')) {
                        try {
                            const data = JSON.parse(trimmed);
                            sendResult(data);
                        } catch (_) {
                            sendLog(line);
                        }
                    } else {
                        sendLog(line);
                    }
                }
            });

            proc.stderr.on('data', (chunk) => sendLog(chunk.toString().trim()));

            proc.on('error', (err) => {
                sendLog('[서버 오류] ' + err.message);
                if (!resultSent) {
                    res.write('RESULT:' + JSON.stringify({
                        sheet1: [], sheet2: [], downloadToken: null,
                        error: String(err.message),
                    }) + '\n');
                }
                res.end();
            });

            proc.on('close', (code) => {
                if (!resultSent && buffer.trim()) {
                    if (buffer.trim().startsWith('{')) {
                        try {
                            sendResult(JSON.parse(buffer.trim()));
                        } catch (_) {
                            sendLog(buffer);
                        }
                    } else {
                        sendLog(buffer);
                    }
                }
                if (!resultSent && code !== 0) {
                    res.write('RESULT:' + JSON.stringify({
                        sheet1: [], sheet2: [], downloadToken: null,
                        error: '프로세스가 비정상 종료했습니다. (code ' + code + ')',
                    }) + '\n');
                }
                if (!resultSent) res.end();
            });
        } catch (e) {
            res.status(500).json({
                error: String(e.message || '조회 실패'),
                log: [String(e.message)],
            });
        }
    });

    // POST /api/els/parse-xlsx
    app.post('/api/els/parse-xlsx', upload.single('file'), (req, res) => {
        try {
            const file = req.file;
            if (!file || !file.originalname?.toLowerCase().endsWith('.xlsx')) {
                return res.status(400).json({ error: 'container_list.xlsx 형식만 지원합니다.' });
            }
            const python = getPythonCommand();
            if (!python) {
                return res.status(503).json({ error: 'Python이 설치되어 있지 않습니다.' });
            }
            const result = spawnSync(python, [RUNNER, 'parse', file.path], {
                cwd: ELSBOT_DIR,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            });
            try { fs.unlinkSync(file.path); } catch (_) {}
            const out = (result.stdout || '').trim();
            if (result.status !== 0) {
                return res.status(500).json({ error: result.stderr || result.error?.message || '파싱 실패' });
            }
            const data = JSON.parse(out);
            res.json({ containers: data.containers || [] });
        } catch (e) {
            res.status(500).json({ error: String(e.message) });
        }
    });

    // GET /api/els/download
    app.get('/api/els/download', (req, res) => {
        const token = req.query.token;
        if (!token) return res.status(400).send('token required');
        const buffer = fileStore.get(token);
        if (!buffer) return res.status(404).send('파일이 없거나 만료되었습니다.');
        fileStore.delete(token);
        const name = (req.query.filename && String(req.query.filename).replace(/[^\w\u3131-\u318E\uAC00-\uD7A3._\-\s]/g, '').slice(0, 120)) || `els_hyper_${Date.now()}.xlsx`;
        const disp = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', disp);
        res.send(buffer);
    });

    // POST /api/els/logout (데스크탑에서는 no-op)
    app.post('/api/els/logout', (req, res) => {
        res.json({ ok: true });
    });

    // GET /api/els/template (양식 다운로드)
    app.get('/api/els/template', (req, res) => {
        try {
            const wb = XLSX.utils.book_new();
            const wsData = [['컨테이너넘버'], ['']];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="container_list_양식.xlsx"');
            res.send(buf);
        } catch (e) {
            res.status(500).json({ error: String(e.message) });
        }
    });

    // 정적 파일 (renderer-dist) + SPA fallback
    if (staticDir && fs.existsSync(staticDir)) {
        app.use(express.static(staticDir));
        app.get('*', (req, res, next) => {
            const p = path.join(staticDir, req.path === '/' ? 'index.html' : req.path);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) return res.sendFile(p);
            res.sendFile(path.join(staticDir, 'index.html'));
        });
    }

    return new Promise((resolve) => {
        const httpServer = app.listen(port, host, () => {
            console.log('ELS 컨테이너 이력조회 서버:', `http://${host}:${port}`);
            resolve(httpServer);
        });
    });
}

module.exports = { createServer };
