const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const FILE = path.join(app.getPath('userData'), 'nexus-data.json');


const DEFAULT_SETTINGS = {
  name: '',
  onboarded: false,

  hotkey: 'Alt+Space',
  launchOnStartup: false,
  hideOnBlur: false,
  alwaysOnTop: true,

  windowOpacity: 0.99,
  panelOpacity: 0.97,
  blur: 20,
  radius: 17,
  theme: 'graphite',
  fontScale: 1.1,
  accent: '#A1A1AA',
  accent2: '#71717A',

  background: '',
  bgOpacity: 0.65,
  bgBlur: 3,
  bgFit: 'cover',
  bgScrim: 0.06,
  boxBlur: 3,
  boxTint: 0.32,

  editor: 'code',
  searchEngine: 'https://duckduckgo.com/?q={q}',

  bounds: { width: 392, height: 641, x: null, y: null },
  lastTab: 'projects',

  showInTaskbar: false,
  startHidden: false,
  rememberPosition: true,
  showGitInfo: true,
  terminal: 'auto',
  browser: '',
  windowEffect: 'glass',
};


// Seeded once into a fresh install; afterwards it is the user's data.
const DEFAULT_SHORTCUTS = [
  { id: 'yt', trigger: 'yt', url: 'https://www.youtube.com/results?search_query={q}' },
  { id: 'youtube', trigger: 'youtube', url: 'https://www.youtube.com/results?search_query={q}' },
  { id: 'gh', trigger: 'gh', url: 'https://github.com/search?q={q}' },
  { id: 'github', trigger: 'github', url: 'https://github.com/search?q={q}' },
  { id: 'gpt', trigger: 'gpt', url: 'https://chatgpt.com/?q={q}&hints=search' },
  { id: 'chatgpt', trigger: 'chatgpt', url: 'https://chatgpt.com/?q={q}&hints=search' },
  { id: 'wiki', trigger: 'wiki', url: 'https://en.wikipedia.org/w/index.php?search={q}' },
  { id: 'wikipedia', trigger: 'wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={q}' },
  { id: 'g', trigger: 'g', url: 'https://www.google.com/search?q={q}' },
  { id: 'google', trigger: 'google', url: 'https://www.google.com/search?q={q}' },
  { id: 'ddg', trigger: 'ddg', url: 'https://duckduckgo.com/?q={q}' },
  { id: 'bing', trigger: 'bing', url: 'https://www.bing.com/search?q={q}' },
  { id: 'amazon', trigger: 'amazon', url: 'https://www.amazon.com/s?k={q}' },
  { id: 'maps', trigger: 'maps', url: 'https://www.google.com/maps/search/{q}' },
];


const DEFAULT_DATA = {
  version: 2,
  settings: { ...DEFAULT_SETTINGS },
  projects: [],
  apps: [],
  links: [],
  notes: [],
  shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s })),
};


let cache = null;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);


function migrate(parsed) {
  const saved = parsed.settings || {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (key in saved) settings[key] = saved[key];
  if (saved.greetingName && !saved.name) settings.name = saved.greetingName;
  if (!('onboarded' in saved)) settings.onboarded = true;

  let notes = parsed.notes;
  if (typeof notes === 'string') {
    notes = notes.trim() ? [{ id: uid(), title: 'Scratchpad', text: notes, updatedAt: Date.now() }] : [];
  }

  // Seed only when the field is missing; an emptied list is left alone.
  const shortcuts = Array.isArray(parsed.shortcuts)
    ? parsed.shortcuts
    : DEFAULT_SHORTCUTS.map((s) => ({ ...s }));

  return {
    ...DEFAULT_DATA,
    ...parsed,
    version: 2,
    settings,
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    apps: Array.isArray(parsed.apps) ? parsed.apps : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
    notes: Array.isArray(notes) ? notes : [],
    shortcuts,
  };
}


// Copied in only on the first-ever launch (no data file yet).
const DEFAULT_BG_SRC = path.join(__dirname, '..', '..', 'assets', 'default-background.jpg');


function seedDefaultBackground(data) {
  try {
    if (!fs.existsSync(DEFAULT_BG_SRC)) return;
    const dest = path.join(app.getPath('userData'), 'background.jpg');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(DEFAULT_BG_SRC, dest);
    data.settings.background = 'background.jpg';
  } catch { /* start blank */ }
}


function readDisk() {
  try {
    return migrate(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    seedDefaultBackground(fresh);
    return fresh;
  }
}


function load() {
  if (!cache) cache = readDisk();
  return cache;
}


let writeTimer = null;


function flush() {
  clearTimeout(writeTimer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache || DEFAULT_DATA, null, 2), 'utf8');
  } catch (err) {
    console.error('[nexus] failed to save data:', err.message);
  }
}


function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 120);
}


module.exports = {
  FILE,
  DEFAULT_SETTINGS,
  uid,
  get state() { return load(); },
  get settings() { return load().settings; },
  update(mutator) {
    const data = load();
    mutator(data);
    persist();
    return data;
  },
  replaceAll(next) {
    cache = migrate(next || {});
    flush();
    return cache;
  },
  flush,
};
