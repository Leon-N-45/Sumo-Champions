// スモチャン 結婚式Ver を Windows・Mac のアプリとして動かす入口。
// ゲーム本体（index.html など）はそのまま使い、専用の app:// で読み込む。
// file:// で開くとブラウザの安全制限で一部の演出が効かないため。
const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// 開発中は一つ上のフォルダ、インストール後は resources/game にゲームがある
const GAME_DIR = app.isPackaged
    ? path.join(process.resourcesPath, 'game')
    : path.join(__dirname, '..');

protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

// タイトルのBGMやボイスを、クリック前から鳴らせるようにする
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// 二重に起動したら、新しく開かずに今のウィンドウを前に出す
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    let win = null;

    app.on('second-instance', () => {
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.focus();
    });

    app.whenReady().then(() => {
        protocol.handle('app', (req) => {
            const file = path.normalize(path.join(GAME_DIR, decodeURIComponent(new URL(req.url).pathname)));
            // ゲームのフォルダの外は読ませない
            if (!file.startsWith(GAME_DIR)) return new Response('', { status: 403 });
            // 音声の頭出し・ループのため、範囲指定の読み込みもそのまま渡す
            return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
        });

        // Mac はメニューを消すと ⌘Q で終われなくなるため、終了と全画面の切り替えだけ残す
        Menu.setApplicationMenu(process.platform === 'darwin'
            ? Menu.buildFromTemplate([
                { role: 'appMenu' },
                { label: '表示', submenu: [{ role: 'togglefullscreen', label: '全画面の切り替え' }] }
            ])
            : null);

        win = new BrowserWindow({
            width: 1280,
            height: 800,
            fullscreen: true,
            backgroundColor: '#000000',
            icon: path.join(__dirname, 'icon.png'),
            title: 'スモチャン 結婚式Ver',
            webPreferences: { contextIsolation: true }
        });

        // F11 で全画面の切り替え（Esc はゲームの中断メニューに使うため割り当てない）
        win.webContents.on('before-input-event', (e, input) => {
            if (input.type === 'keyDown' && input.key === 'F11') {
                win.setFullScreen(!win.isFullScreen());
                e.preventDefault();
            }
        });

        // 外部のリンクはいつものブラウザで開く
        win.webContents.setWindowOpenHandler(({ url }) => {
            if (/^https?:/.test(url)) shell.openExternal(url);
            return { action: 'deny' };
        });

        win.loadURL('app://game/index.html');
    });

    app.on('window-all-closed', () => app.quit());
}
