const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, nativeImage, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Migrates data from the old "Nexus Deck" folder.
// Keys off the data file: Electron creates the new folder before this runs.
(function migrateUserData() {
  const newDir = app.getPath('userData');
  const oldDir = path.join(path.dirname(newDir), 'Nexus Deck');
  const newDataFile = path.join(newDir, 'nexus-data.json');
  const oldDataFile = path.join(oldDir, 'nexus-data.json');
  if (fs.existsSync(newDataFile) || !fs.existsSync(oldDataFile)) return;
  try {
    fs.mkdirSync(newDir, { recursive: true });
    fs.copyFileSync(oldDataFile, newDataFile);
    const errLog = path.join(oldDir, 'nexus-error.log');
    if (fs.existsSync(errLog)) fs.copyFileSync(errLog, path.join(newDir, 'nexus-error.log'));
    const data = JSON.parse(fs.readFileSync(newDataFile, 'utf8'));
    const bg = data.settings && data.settings.background;
    if (bg && fs.existsSync(path.join(oldDir, bg))) {
      fs.copyFileSync(path.join(oldDir, bg), path.join(newDir, bg));
    }
  } catch { /* fresh profile beats a crash */ }
})();


const store = require('./store');
const launch = require('./launch');
const apps = require('./apps');
const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const isDev = process.argv.includes('--dev');

// Apps launched from Finder/Dock don't inherit the shell PATH, so `code` wouldn't resolve.
if (process.platform === 'darwin') {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/Applications/Visual Studio Code.app/Contents/Resources/app/bin'];
  const have = (process.env.PATH || '').split(':');
  process.env.PATH = [...have, ...extra.filter((p) => !have.includes(p))].join(':');
}


// Always-running tray app: keep the idle footprint small.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=96 --max-semi-space-size=4');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
const LOG_FILE = path.join(app.getPath('userData'), 'nexus-error.log');


function logError(label, err) {
  try {
    const line = `[${new Date().toISOString()}] ${label}: ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* best-effort logging only */ }
  console.error(`[nexus] ${label}:`, err);
}


// No console in the background: log unhandled errors instead of crashing.
process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));
const FULL_MIN = { width: 380, height: 320 };
let win = null;
let tray = null;
let quitting = false;
let saveBoundsTimer = null;
let dialogOpen = false;   // suppresses hide-on-blur while a native dialog is up
let lastHiddenAt = 0;     // stops a tray click from re-showing what its blur just hid
let startHiddenThisRun = false;

/** Wraps a native dialog so the launcher does not vanish behind it. */
async function withDialog(fn) {
  dialogOpen = true;
  try {
    return await fn();
  } finally {
    dialogOpen = false;
    if (win && !win.isDestroyed() && win.isVisible()) win.focus();
  }
}



/* ---- window */

function createWindow() {
  const s = store.settings;
  const { width, height, x, y } = s.bounds || {};
  // "glass" is a transparent window; material modes use Windows 11 DWM, ignored elsewhere.
  const effect = s.windowEffect || 'glass';
  const material = process.platform === 'win32' && effect !== 'glass' ? effect : null;
  const opts = {
    width: width || 720,
    height: height || 520,
    minWidth: FULL_MIN.width,
    minHeight: FULL_MIN.height,
    frame: false,
    transparent: !material,
    ...(material ? { backgroundMaterial: material } : {}),
    backgroundColor: '#00000000',
    hasShadow: false,
    thickFrame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: !s.showInTaskbar,
    alwaysOnTop: s.alwaysOnTop,
    show: false,
    title: 'Zunn',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  };

  if (Number.isFinite(x) && Number.isFinite(y) && s.rememberPosition && isOnScreen(x, y)) {
    opts.x = x;
    opts.y = y;
  }

  win = new BrowserWindow(opts);
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.setAlwaysOnTop(s.alwaysOnTop, 'floating');
  win.setOpacity(clamp(s.windowOpacity, 0.15, 1));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    if (!startHiddenThisRun) showWindow();
  });

  win.on('blur', () => {
    if (dialogOpen || win.webContents.isDevToolsOpened()) return;
    if (store.settings.hideOnBlur) {
      lastHiddenAt = Date.now();
      win.hide();
    }
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  const remember = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || !store.settings.rememberPosition) return;
      store.update((d) => { d.settings.bounds = win.getBounds(); });
    }, 400);
  };

  win.on('resize', remember);
  win.on('move', remember);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) launch.openUrl(url, store.settings.browser);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  // A renderer crash must self-recover; a tray app can't leave a dead grey window.
  win.webContents.on('render-process-gone', (_e, details) => {
    logError('render-process-gone', new Error(details.reason));
    const wasVisible = win && !win.isDestroyed() && win.isVisible();
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    createWindow();
    if (wasVisible) showWindow();
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}


function isOnScreen(x, y) {
  return screen.getAllDisplays().some((d) => {
    const { x: dx, y: dy, width, height } = d.workArea;
    return x >= dx - 40 && y >= dy - 40 && x < dx + width - 40 && y < dy + height - 40;
  });
}


const COLLECTIONS = ['projects', 'apps', 'links', 'notes', 'shortcuts'];


function clamp(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : hi;
}


function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('window:shown');
}


function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) {
    lastHiddenAt = Date.now();
    return win.hide();
  }
  // A tray click blurs the window first, which already hid it — treat that as the toggle.
  if (Date.now() - lastHiddenAt < 250) return;
  showWindow();
}



/* ---- note alarms */

/** Forces the window to front; the renderer plays the alarm sound (startAlarmSound). */
function fireAlarm(note) {
  showWindow();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  win.focus();
  win.webContents.send('alarm:fire', { id: note.id, title: note.title, text: note.text, alarmAt: note.alarmAt });
}


/** Runs in main, not the renderer: Chromium throttles timers while hidden. */
function checkAlarms() {
  const now = Date.now();
  const due = store.state.notes.find((n) => n.alarmAt && !n.alarmFired && n.alarmAt <= now);
  if (!due) return;
  store.update((d) => {
    const n = d.notes.find((x) => x.id === due.id);
    if (n) n.alarmFired = true;
  });

  fireAlarm(due);
}


function centerOnCursor() {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const b = win.getBounds();
  win.setBounds({
    x: Math.round(display.workArea.x + (display.workArea.width - b.width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - b.height) / 2),
    width: b.width,
    height: b.height,
  });
}


/** Linux autostart needs a writable ~/.config/autostart; failure must not crash. */
function setDockVisible(visible) {
  if (process.platform !== 'darwin' || !app.dock) return;
  if (visible) app.dock.show();
  else app.dock.hide();
}


function setLoginItem(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ['--hidden'] });
  } catch (err) {
    logError('setLoginItem', err);
  }
}



/* ---- hotkey/tray */

function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  if (!accel) return { ok: true };
  try {
    const ok = globalShortcut.register(accel, toggleWindow);
    if (!ok) return { ok: false, error: `"${accel}" is already taken by another app.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


function buildTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Zunn');
  refreshTrayMenu();
  tray.on('click', toggleWindow);
  tray.on('double-click', showWindow);
}


function refreshTrayMenu() {
  if (!tray) return;
  const projects = store.state.projects
    .slice()
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
    .slice(0, 8)
    .map((p) => ({ label: p.name, click: () => openProject(p.id, 'editor') }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show (${store.settings.hotkey || 'no hotkey'})`, click: showWindow },
    { type: 'separator' },
    ...(projects.length ? [{ label: 'Recent projects', submenu: projects }, { type: 'separator' }] : []),
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: store.settings.alwaysOnTop,
      click: (item) => {
        applySettings({ alwaysOnTop: item.checked });
        if (win) win.webContents.send('settings:changed', store.settings);
      },
    },
    { label: 'Settings...', click: () => { showWindow(); win.webContents.send('nav:tab', 'settings'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}



/* ---- settings I/O */

function applySettings(rawPatch) {
  const patch = {};
  for (const key of Object.keys(rawPatch)) {
    if (key in store.DEFAULT_SETTINGS) patch[key] = rawPatch[key];
  }
  const data = store.update((d) => Object.assign(d.settings, patch));
  const s = data.settings;

  if (win && !win.isDestroyed()) {
    if ('alwaysOnTop' in patch) win.setAlwaysOnTop(!!s.alwaysOnTop, 'floating');
    if ('windowOpacity' in patch) win.setOpacity(clamp(s.windowOpacity, 0.15, 1));
    if ('showInTaskbar' in patch) {
      win.setSkipTaskbar(!s.showInTaskbar);
      setDockVisible(!!s.showInTaskbar);
    }
  }

  if ('hotkey' in patch) {
    const res = registerHotkey(s.hotkey);
    if (!res.ok && win) win.webContents.send('toast', { type: 'error', message: res.error });
  }

  if ('launchOnStartup' in patch) setLoginItem(!!s.launchOnStartup);
  // Tray menu mirrors only these two; skip rebuilds (renderer saves active tab on a timer).
  if ('hotkey' in patch || 'alwaysOnTop' in patch) refreshTrayMenu();
  return s;
}



/* ---- background */

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
};


function backgroundPath() {
  const name = store.settings.background;
  return name ? path.join(app.getPath('userData'), name) : null;
}


function readBackground() {
  const file = backgroundPath();
  if (!file || !fs.existsSync(file)) return null;
  try {
    const mime = MIME[path.extname(file).toLowerCase()] || 'image/png';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}


function removeBackground() {
  const file = backgroundPath();
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch { /* a locked file just gets overwritten next time */ }
}



/* ---- actions */

function touch(collection, id) {
  store.update((d) => {
    const item = d[collection].find((x) => x.id === id);
    if (item) {
      item.lastOpened = Date.now();
      item.openCount = (item.openCount || 0) + 1;
    }
  });

  refreshTrayMenu();
}


/** Resolves a project's "Open with" choice. */
async function openWithConfigured(p, s) {
  if (p.opener === 'custom' && p.openerPath) {
    return launch.launchTarget(p.openerPath, `"${p.path}"`);
  }

  if (p.opener === 'editor') {
    return launch.openInEditor(p.path, s.editor);
  }
  // 'default' or unset: let the OS pick the registered handler.
  return launch.openFolder(p.path);
}


async function openProject(id, action = 'open') {
  const p = store.state.projects.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Project not found.' };
  const s = store.settings;
  let res;
  switch (action) {
    case 'open':
      res = await openWithConfigured(p, s);
      break;
    case 'editor':
      res = await launch.openInEditor(p.path, s.editor);
      break;
    case 'folder':
      res = await launch.openFolder(p.path);
      break;
    case 'terminal':
      res = await launch.openTerminal(p.path, s.terminal);
      break;
    case 'url':
      res = p.url ? await launch.openUrl(p.url, s.browser) : { ok: false, error: 'No URL set for this project.' };
      break;
    default:
      res = await openWithConfigured(p, s);
      break;
  }

  if (res.ok) touch('projects', id);
  return res;
}



/* ---- IPC */

function register() {
  ipcMain.handle('state:get', () => ({
    ...store.state,
    meta: {
      version: app.getVersion(),
      electron: process.versions.electron,
      dataFile: store.FILE,
      platform: process.platform,
    },
  }));

  ipcMain.handle('settings:set', (_e, patch) => applySettings(patch || {}));

  ipcMain.handle('items:save', (_e, { collection, item }) => {
    if (!COLLECTIONS.includes(collection)) throw new Error('unknown collection');
    store.update((d) => {
      const list = d[collection];
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = { ...list[i], ...item };
      else list.push({ createdAt: Date.now(), openCount: 0, ...item });
    });
    refreshTrayMenu();
    return store.state[collection];
  });

  ipcMain.handle('items:delete', (_e, { collection, id }) => {
    if (!COLLECTIONS.includes(collection)) throw new Error('unknown collection');
    store.update((d) => { d[collection] = d[collection].filter((x) => x.id !== id); });
    refreshTrayMenu();
    return store.state[collection];
  });

  ipcMain.handle('items:reorder', (_e, { collection, ids }) => {
    if (!COLLECTIONS.includes(collection) || !Array.isArray(ids)) throw new Error('bad request');
    store.update((d) => {
      const byId = new Map(d[collection].map((x) => [x.id, x]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
      d[collection] = ordered.concat(d[collection].filter((x) => !ids.includes(x.id)));
    });
    return store.state[collection];
  });

  ipcMain.handle('project:open', (_e, { id, action }) => openProject(id, action));

  ipcMain.handle('app:launch', async (_e, id) => {
    const a = store.state.apps.find((x) => x.id === id);
    if (!a) return { ok: false, error: 'App not found.' };
    const res = await launch.launchTarget(a.target, a.args || '', store.settings.browser);
    if (res.ok) touch('apps', id);
    return res;
  });

  ipcMain.handle('link:open', async (_e, id) => {
    const l = store.state.links.find((x) => x.id === id);
    if (!l) return { ok: false, error: 'Link not found.' };
    const res = await launch.openUrl(l.url, store.settings.browser);
    if (res.ok) touch('links', id);
    return res;
  });

  ipcMain.handle('web:open', (_e, input) => {
    const s = store.settings;
    const value = String(input || '').trim();
    if (!value) return { ok: false, error: 'Nothing to open.' };
    const looksLikeUrl = launch.isUrl(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);
    const url = looksLikeUrl ? value : launch.buildSearchUrl(s.searchEngine, value, store.state.shortcuts);
    return launch.openUrl(url, s.browser);
  });

  ipcMain.handle('shell:reveal', (_e, target) => {
    if (typeof target !== 'string' || !fs.existsSync(target)) return { ok: false, error: 'Path not found.' };
    shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.handle('git:info', (_e, dir) => (store.settings.showGitInfo ? launch.gitInfo(dir) : null));

  ipcMain.handle('path:kind', (_e, p) => {
    try { return p && fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? 'dir' : 'file') : null; } catch { return null; }
  });

  ipcMain.handle('path:exists', (_e, p) => {
    try { return !!p && fs.existsSync(p); } catch { return false; }
  });

  ipcMain.handle('dialog:pickFolder', () => withDialog(async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Choose a project folder' });
    return r.canceled ? null : r.filePaths[0];
  }));

  const PROGRAM_EXT = { win32: ['exe', 'lnk', 'bat', 'cmd', 'url'], darwin: ['app'], linux: ['desktop', 'AppImage'] };

  ipcMain.handle('dialog:pickFile', (_e, kind) => withDialog(async () => {
    const filters = kind === 'exe'
      ? [{ name: 'Programs', extensions: PROGRAM_EXT[process.platform] || [] }, { name: 'All files', extensions: ['*'] }]
      : [{ name: 'All files', extensions: ['*'] }];
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  }));

  ipcMain.handle('apps:installed', () => apps.scanInstalledApps());

  ipcMain.handle('icon:get', async (_e, target) => {
    try {
      if (!target || (/^[a-z][a-z0-9+.-]+:/i.test(target) && !/^[a-z]:[\/]/i.test(target))) return null;
      // A bare editor command ("code") isn't a real path — resolve it through PATH first.
      const found = fs.existsSync(target) ? target : await launch.resolveCommand(target);
      const resolved = found && apps.iconSource(path.normalize(found));
      if (!resolved || !fs.existsSync(resolved)) return null;
      return await apps.iconDataUrl(resolved);
    } catch (err) {
      logError('icon:get', err);
      return null;
    }
  });


  // Wallpaper is copied to userData and sent as a data URL (survives moves, fits img-src CSP).
  ipcMain.handle('bg:get', () => readBackground());

  ipcMain.handle('bg:choose', () => withDialog(async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
    });
    if (r.canceled) return { ok: false };
    const source = r.filePaths[0];
    try {
      const stat = fs.statSync(source);
      if (stat.size > 24 * 1024 * 1024) return { ok: false, error: 'That image is larger than 24 MB.' };
      // Downscale so a 4K/8K photo isn't held fully decoded in memory all session.
      let img = nativeImage.createFromPath(source);
      if (img.isEmpty()) return { ok: false, error: 'Could not read that image.' };
      const { width, height } = img.getSize();
      const longEdge = Math.max(width, height);
      const MAX_EDGE = 1600;
      if (longEdge > MAX_EDGE) {
        const scale = MAX_EDGE / longEdge;
        img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' });
      }
      const name = 'background.jpg';
      const dest = path.join(app.getPath('userData'), name);
      removeBackground();
      fs.writeFileSync(dest, img.toJPEG(82));
      store.update((d) => { d.settings.background = name; });
      return { ok: true, dataUrl: readBackground() };
    } catch (err) {
      return { ok: false, error: `Could not read that image: ${err.message}` };
    }
  }));

  ipcMain.handle('bg:clear', () => {
    removeBackground();
    store.update((d) => { d.settings.background = ''; });
    return { ok: true };
  });

  ipcMain.handle('data:export', () => withDialog(async () => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Export data',
      defaultPath: `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled) return { ok: false };
    store.flush();
    fs.writeFileSync(r.filePath, JSON.stringify(store.state, null, 2), 'utf8');
    return { ok: true, path: r.filePath };
  }));

  ipcMain.handle('data:import', () => withDialog(async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import data',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled) return { ok: false };
    try {
      const parsed = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      store.replaceAll(parsed);
      applySettings({ hotkey: store.settings.hotkey, alwaysOnTop: store.settings.alwaysOnTop });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Not a valid backup file: ${err.message}` };
    }
  }));

  ipcMain.handle('data:reveal', () => { shell.showItemInFolder(store.FILE); return true; });

  ipcMain.handle('alarm:ack', (_e, id) => {
    store.update((d) => {
      const n = d.notes.find((x) => x.id === id);
      if (n) { n.alarmAt = null; n.alarmFired = false; }
    });
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!store.settings.alwaysOnTop, 'floating');
    return store.state.notes;
  });

  ipcMain.handle('win:hide', () => { if (win) win.hide(); });
  ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
  ipcMain.handle('win:center', () => centerOnCursor());
  ipcMain.handle('win:bounds', () => (win ? win.getBounds() : null));

  ipcMain.handle('win:setBounds', (_e, b) => {
    if (!win || !b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return;
    win.setBounds({
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(FULL_MIN.width, Math.round(b.width)),
      height: Math.max(FULL_MIN.height, Math.round(b.height)),
    });
  });

  ipcMain.handle('win:resizeTo', (_e, { width, height }) => {
    if (!win || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const b = win.getBounds();
    win.setBounds({ ...b, width: Math.round(width), height: Math.round(height) }, true);
  });

  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); });
  ipcMain.handle('app:restart', () => { quitting = true; app.relaunch(); app.exit(0); });
}



/* ---- app startup */

const gotLock = app.requestSingleInstanceLock();


if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
    if (process.platform === 'win32') app.setAppUserModelId('com.hghayman.zunn');
    const s = store.settings;
    // Autostart passes --hidden; that must not be written back as a saved preference.
    startHiddenThisRun = s.startHidden || process.argv.includes('--hidden');
    register();
    createWindow();
    buildTray();
    const res = registerHotkey(s.hotkey);
    if (!res.ok) console.warn('[nexus]', res.error);
    setDockVisible(!!s.showInTaskbar);
    setLoginItem(!!s.launchOnStartup);
    setInterval(checkAlarms, 15000);
    checkAlarms();
  });

  app.on('window-all-closed', (e) => { e.preventDefault(); });
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; store.flush(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
