const { shell } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const isUrl = (s) => /^https?:\/\//i.test(s);
const isProtocol = (s) => /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\/]/i.test(s);


function fillTemplate(template, rawQuery) {
  const base = (template && String(template).trim()) || 'https://www.google.com/search?q={q}';
  if (base.includes('{q}')) return base.replace('{q}', encodeURIComponent(rawQuery));
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}q=${encodeURIComponent(rawQuery)}`;
}


function buildSearchUrl(template, rawQuery, shortcuts = []) {
  const bang = rawQuery.match(/^!(\S+)\s*(.*)$/);
  if (bang) {
    const trigger = bang[1].toLowerCase();
    const hit = shortcuts.find((s) => s && String(s.trigger || '').toLowerCase() === trigger);
    if (hit) {
      const q = bang[2].trim();
      if (!q) {
        try { return new URL(fillTemplate(hit.url, '')).origin; } catch { /* fall through */ }
      }
      return fillTemplate(hit.url, q);
    }
  }

  return fillTemplate(template, rawQuery);
}


const isWin = process.platform === 'win32';


function detached(cmd, args = [], opts = {}) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...opts });
  child.on('error', () => {});
  child.unref();
  return child;
}


function trySpawn(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts }); } catch { return resolve(false); }
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}


function runShell(line) {
  return new Promise((resolve) => {
    exec(line, { windowsHide: true }, (err) => resolve(!err));
  });
}


const shellQuote = (p) => `'${String(p).replace(/'/g, "'\\''")}'`;

// POSIX double quotes would still expand $ and backticks.
function quote(p) {
  return isWin ? `"${String(p).replace(/"/g, '')}"` : shellQuote(p);
}


// .cmd/.bat shims have no icon of their own; extract the real .exe they invoke.
function unwrapShim(shimPath) {
  const ext = path.extname(shimPath).toLowerCase();
  if (ext !== '.cmd' && ext !== '.bat') return shimPath;
  try {
    const content = fs.readFileSync(shimPath, 'utf8');
    const match = content.match(/"([^"\r\n]+\.exe)"|(\S+\.exe)/i);
    if (!match) return shimPath;
    const dir = path.dirname(shimPath);
    let exePath = (match[1] || match[2]).replace(/%~dp0/gi, `${dir}${path.sep}`);
    if (!path.isAbsolute(exePath)) exePath = path.join(dir, exePath);
    exePath = path.normalize(exePath);
    return fs.existsSync(exePath) ? exePath : shimPath;
  } catch {
    return shimPath;
  }
}


function resolveCommand(cmd) {
  return new Promise((resolve) => {
    if (!cmd) return resolve(null);
    if (path.isAbsolute(cmd) && fs.existsSync(cmd)) return resolve(unwrapShim(cmd));
    const finder = process.platform === 'win32' ? 'where' : 'which';
    exec(`${finder} ${quote(cmd)}`, { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      // "where" may list an extensionless Git Bash shim first; it has no icon.
      const preferred = lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || lines[0];
      resolve(preferred ? unwrapShim(preferred) : null);
    });
  });
}


async function openInEditor(target, editor = 'code') {
  if (!fs.existsSync(target)) return { ok: false, error: `Path not found: ${target}` };
  const cmd = editor || 'code';
  if (path.isAbsolute(cmd) && fs.existsSync(cmd)) {
    detached(cmd, [target]);
    return { ok: true };
  }

  const ok = await runShell(`${cmd} ${quote(target)}`);
  if (ok) return { ok: true };
  return { ok: false, error: `Could not run "${cmd}". Set the editor command in Settings.` };
}


const TERMINAL_ATTEMPTS = {
  win32: (dir) => [
    `wt.exe -d ${quote(dir)}`,
    `start "" powershell.exe -NoExit -Command "Set-Location -LiteralPath ${quote(dir)}"`,
    `start "" cmd.exe /K cd /d ${quote(dir)}`,
  ],
  darwin: (dir) => [`open -a Terminal ${quote(dir)}`, `open -a iTerm ${quote(dir)}`],
};


// Spawned directly, not via a shell, so an open terminal doesn't block the UI.
const LINUX_TERMINALS = [
  ['gnome-terminal', (dir) => [`--working-directory=${dir}`]],
  ['konsole', (dir) => ['--workdir', dir]],
  ['xfce4-terminal', (dir) => [`--working-directory=${dir}`]],
  ['x-terminal-emulator', () => []],
  ['xterm', () => []],
];


async function openTerminal(target, terminal = 'auto') {
  if (!fs.existsSync(target)) return { ok: false, error: `Path not found: ${target}` };
  const custom = terminal && terminal !== 'auto';
  if (!custom && process.platform === 'linux') {
    for (const [cmd, argsFor] of LINUX_TERMINALS) {
      // eslint-disable-next-line no-await-in-loop
      if (await trySpawn(cmd, argsFor(target), { cwd: target })) return { ok: true };
    }
    return { ok: false, error: 'No terminal could be launched.' };
  }

  const attempts = custom ? [`${terminal} ${quote(target)}`] : (TERMINAL_ATTEMPTS[process.platform] || [])(target);
  for (const line of attempts) {
    // eslint-disable-next-line no-await-in-loop
    if (await runShell(line)) return { ok: true };
  }

  return { ok: false, error: 'No terminal could be launched.' };
}


async function openFolder(target) {
  const err = await shell.openPath(target);
  return err ? { ok: false, error: err } : { ok: true };
}


async function openUrl(url, browser = '') {
  const full = isUrl(url) || isProtocol(url) ? url : `https://${url}`;
  if (browser && fs.existsSync(browser)) {
    detached(browser, [full]);
    return { ok: true };
  }

  await shell.openExternal(full);
  return { ok: true };
}


function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}


function desktopCommand(file, argv) {
  try {
    const m = fs.readFileSync(file, 'utf8').match(/^Exec=(.+)$/m);
    if (!m) return null;
    let used = false;
    const parts = (m[1].match(/(?:[^\s"]+|"[^"]*")+/g) || [])
      .map((p) => p.replace(/^"|"$/g, ''))
      .flatMap((p) => {
        if (/^%[fFuU]$/.test(p)) { used = true; return argv; }
        return /^%[a-zA-Z%]$/.test(p) ? [] : [p];
      });
    if (!used) parts.push(...argv);
    return parts.length ? parts : null;
  } catch {
    return null;
  }
}


async function launchTarget(target, args = '', browser = '') {
  if (!target) return { ok: false, error: 'Nothing to launch.' };
  const trimmed = target.trim();

  if (isUrl(trimmed)) return openUrl(trimmed, browser);
  if (isProtocol(trimmed)) {
    await shell.openExternal(trimmed);
    return { ok: true };
  }

  if (fs.existsSync(trimmed)) {
    const stat = fs.statSync(trimmed);
    const argv = args ? (args.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((a) => a.replace(/"/g, '')) : [];

    if (stat.isDirectory()) {
      // `open -a` is the only way to hand a macOS .app a file.
      if (process.platform === 'darwin' && /\.app$/i.test(trimmed) && argv.length) {
        detached('open', ['-a', trimmed, ...argv]);
        return { ok: true };
      }
      return openFolder(trimmed);
    }
    // xdg-open would show a .desktop launcher in a text editor instead of running it.
    if (process.platform === 'linux' && /\.desktop$/i.test(trimmed)) {
      const parts = desktopCommand(trimmed, argv);
      if (parts) {
        detached(parts[0], parts.slice(1));
        return { ok: true };
      }
    }
    if (!isWin && isExecutable(trimmed)) {
      detached(trimmed, argv, { cwd: path.dirname(trimmed) });
      return { ok: true };
    }
    // .lnk/.url can't be spawned directly; the shell must resolve them.
    if (!argv.length || /\.(lnk|url)$/i.test(trimmed)) return openFolder(trimmed);
    detached(trimmed, argv, { cwd: path.dirname(trimmed) });
    return { ok: true };
  }

  const line = process.platform === 'win32'
    ? `start "" ${quote(trimmed)} ${args}`.trim()
    : `${quote(trimmed)} ${args}`.trim();
  const ok = await runShell(line);
  return ok ? { ok: true } : { ok: false, error: `Could not launch "${trimmed}".` };
}


function gitInfo(dir) {
  return new Promise((resolve) => {
    if (typeof dir !== 'string' || !fs.existsSync(path.join(dir, '.git'))) return resolve(null);
    exec(
      'git rev-parse --abbrev-ref HEAD && git status --porcelain',
      { cwd: dir, windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const lines = stdout.split(/\r?\n/);
        const branch = (lines.shift() || '').trim();
        const changes = lines.filter((l) => l.trim()).length;
        resolve({ branch, changes });
      }
    );
  });
}


module.exports = { openInEditor, openTerminal, openFolder, openUrl, launchTarget, gitInfo, isUrl, buildSearchUrl, resolveCommand };
