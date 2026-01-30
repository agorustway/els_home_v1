/**
 * ELS 컨테이너 이력조회 데스크탑 앱 - Electron 메인
 * 로컬 서버 기동 후 창에서 UI 로드
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('./server');

const PORT = 2929;

// 패키징 여부: electron-builder로 패키징하면 process.resourcesPath에 elsbot 등이 있음
const isPackaged = process.env.ELECTRON_IS_PACKAGED || app.isPackaged;
const ELSBOT_DIR = isPackaged
    ? path.join(process.resourcesPath, 'elsbot')
    : path.join(__dirname, '..', 'elsbot');
const STATIC_DIR = path.join(__dirname, 'renderer-dist');

let server = null;

function startServer() {
    return createServer(PORT, {
        elsbotDir: ELSBOT_DIR,
        staticDir: STATIC_DIR,
        host: '127.0.0.1',
    }).then((s) => {
        server = s;
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        title: 'ELS 컨테이너 이력조회',
    });
    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.on('closed', () => {
        if (server) try { server.close(); } catch (_) {}
    });
}

app.whenReady().then(async () => {
    await startServer();
    createWindow();

    app.on('window-all-closed', () => {
        if (server) try { server.close(); } catch (_) {}
        app.quit();
    });
});

app.on('quit', () => {
    if (server) try { server.close(); } catch (_) {}
});
