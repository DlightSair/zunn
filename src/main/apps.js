const { app, shell, nativeImage } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const IMAGE_ICON = /\.(ico|png|jpe?g)$/i;
const SKIP_NAMES = /uninstall|readme|release notes|documentation|^help\b/i;
const isProtocol = (s) => /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s);
const expandEnv = (p) => p && path.normalize(p.replace(/%([^%]+)%/g, (m, v) => process.env[v] || m));
const existing = (p) => (p && fs.existsSync(p) ? p : null);


const SOURCES = {
  win32: {
    exts: ['.lnk', '.url'],
    dirs: () => [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(app.getPath('desktop')),
    ],
  },
  darwin: { exts: ['.app'], dirs: () => ['/Applications', '/System/Applications', path.join(app.getPath('home'), 'Applications')] },
  linux: {
    exts: ['.desktop'],
    dirs: () => ['/usr/share/applications', path.join(app.getPath('home'), '.local', 'share', 'applications')],
  },
};


// Store apps (e.g. Teams) have no .lnk, so logos come from their manifests.
const START_APPS_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$pk = @{}
Get-AppxPackage | ForEach-Object { if ($_.InstallLocation) { $pk[$_.PackageFamilyName] = $_.InstallLocation } }
Get-StartApps | ForEach-Object {
  $id = $_.AppID; $logo = $null
  if ($id -match '^(.+)!') {
    $loc = $pk[$matches[1]]
    if ($loc) { try {
      $m = [xml](Get-Content -LiteralPath "$loc\\AppxManifest.xml" -Raw)
      $rel = $m.Package.Applications.Application | Select-Object -First 1 | ForEach-Object { $_.VisualElements.Square44x44Logo }
      if ($rel) {
        $base = [IO.Path]::GetFileNameWithoutExtension($rel)
        $dir = Join-Path $loc ([IO.Path]::GetDirectoryName($rel))
        $f = Get-ChildItem -LiteralPath $dir -Filter "$base*.png" | Where-Object { $_.Name -notmatch 'lightunplated|contrast' } | Sort-Object Length -Descending | Select-Object -First 1
        if ($f) { $logo = $f.FullName }
      }
    } catch {} }
  }
  [pscustomobject]@{ name = $_.Name; id = $id; logo = $logo }
} | ConvertTo-Json -Compress
`;

function readUrlIcon(file) {
  try {
    const m = fs.readFileSync(file, 'utf8').match(/^IconFile=(.+)$/im);
    return m ? existing(expandEnv(m[1].trim())) : null;
  } catch {
    return null;
  }
}


function shortcutIcon(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.url')) return readUrlIcon(file);
  if (!lower.endsWith('.lnk')) return null;
  try {
    const { target, icon } = shell.readShortcutLink(file);
    return existing(expandEnv(icon)) || existing(expandEnv(target));
  } catch {
    return null;
  }
}


function iconSource(file) {
  return (process.platform === 'win32' && shortcutIcon(file)) || file;
}


/** Returns null when the .desktop entry is hidden from menus. */
function readDesktopEntry(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').split(/\r?\n\s*\[(?!Desktop Entry\])/)[0];
    if (/^(NoDisplay|Hidden)=true$/im.test(text)) return null;
    const name = (text.match(/^Name=(.+)$/m) || [])[1];
    const icon = (text.match(/^Icon=(.+)$/m) || [])[1];
    return { name: name && name.trim(), icon: icon && path.isAbsolute(icon.trim()) ? existing(icon.trim()) : null };
  } catch {
    return null;
  }
}


async function walk(dir, exts, depth, out) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const ext = exts.find((x) => e.name.toLowerCase().endsWith(x));
    if (ext === '.desktop') {
      const entry = readDesktopEntry(full);
      if (entry && entry.name) out.push({ name: entry.name, target: full, icon: entry.icon });
    } else if (ext) {
      out.push({ name: e.name.slice(0, -ext.length), target: full, icon: process.platform === 'win32' ? shortcutIcon(full) : null });
    } else if (e.isDirectory() && depth > 0) {
      await walk(full, exts, depth - 1, out);
    }
  }
}


function startApps() {
  return new Promise((resolve) => {
    const encoded = Buffer.from(START_APPS_SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
        if (err) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          resolve((Array.isArray(parsed) ? parsed : [parsed]).map((a) => ({
            name: a.name,
            target: existing(a.id) || isProtocol(a.id) ? a.id : `shell:AppsFolder\\${a.id}`,
            icon: a.logo || (existing(a.id) ? a.id : null),
          })));
        } catch {
          resolve([]);
        }
      });
  });
}


let cache = null;


async function scanInstalledApps() {
  if (cache) return cache;
  const src = SOURCES[process.platform];
  if (!src) return [];
  const found = [];
  for (const dir of src.dirs()) await walk(dir, src.exts, 3, found);
  if (process.platform === 'win32') found.push(...await startApps());
  const seen = new Set();
  cache = found
    .filter((a) => a.name && !SKIP_NAMES.test(a.name))
    .filter((a) => !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}


async function iconDataUrl(file) {
  if (IMAGE_ICON.test(file)) {
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: 32, height: 32, quality: 'good' }).toDataURL();
  }

  for (const size of ['normal', 'large']) {
    const img = await app.getFileIcon(file, { size });
    if (!img.isEmpty()) return img.toDataURL();
  }

  return null;
}


module.exports = { scanInstalledApps, iconSource, iconDataUrl };
