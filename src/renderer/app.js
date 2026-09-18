/* Zunn renderer */

const $ = (sel) => document.querySelector(sel);
const api = window.nexus;
let state = null;
let tab = 'projects';
let query = '';
let selection = -1;
let bgDataUrl = null;
let lastContentTab = 'projects';
let shortcutsExpanded = false;
let latchedShortcut = null;   // { id, trigger, url } once "!trigger " latches
const iconCache = new Map();
const OS_NAME = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };



/* ------------------------------------------------------------------ icons */

const PATHS = {
  code: 'm8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16',
  folder: 'M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  terminal: 'm5 7 4 4-4 4M12 15h7',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.6 2.5 15 0 18M12 3c-2.5 2.6-2.5 15 0 18',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  note: 'M6 3h9l5 5v13H6zM15 3v5h5M9 13h7M9 17h5',
  gear: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4',
  plus: 'M12 5v14M5 12h14',
  pin: 'M9 3h6l-1 6 4 4v2H6v-2l4-4z M12 15v6',
  close: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  play: 'M7 4l12 8-12 8z',
  down: 'M12 5v14M6 13l6 6 6-6',
  up: 'M12 19V5M6 11l6-6 6 6',
  power: 'M12 4v8M7.5 7a7 7 0 1 0 9 0',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  alarm: 'M18 8a6 6 0 1 0-12 0c0 3.6-1 5.5-2 7h16c-1-1.5-2-3.4-2-7M9.5 19a2.5 2.5 0 0 0 5 0',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  video: 'M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM17 9.5l4-2.5v10l-4-2.5',
  audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
};


const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || PATHS.grid}"/></svg>`;



/* ---------------------------------------------------------------- helpers */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);


const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

function initial(text) {
  const c = String(text || '?').trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : '#';
}


function host(url) {
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).host; } catch { return url; }
}


function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toasts').appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 200);
  }, 2400);
}


async function handle(promise) {
  const res = await promise;
  if (res && res.ok === false) toast(res.error || 'Something went wrong', 'error');
  return res;
}


async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const box = document.createElement('textarea');
    box.value = text;
    box.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(box);
    box.select();
    try { document.execCommand('copy'); } catch { /* nothing else to try */ }
    box.remove();
  }

  toast(`${label} copied`);
}



/* ------------------------------------------------------------- appearance */

function applyAppearance() {
  const s = state.settings;
  const body = document.body;
  body.dataset.theme = s.theme;
  body.classList.toggle('material', (s.windowEffect || 'glass') !== 'glass');

  const root = document.documentElement.style;
  root.setProperty('--accent', s.accent);
  root.setProperty('--panel-a', String(s.panelOpacity));
  root.setProperty('--blur', `${s.blur}px`);
  root.setProperty('--radius', `${s.radius}px`);
  root.setProperty('--fs', String(s.fontScale || 1));

  $('#who').textContent = (s.name || '').trim();
  $('#btn-pin').classList.toggle('active', !!s.alwaysOnTop);
  applyBackground();
}


function applyBackground() {
  const el = $('#bg');
  const s = state.settings;
  el.style.backgroundImage = bgDataUrl ? `url("${bgDataUrl}")` : '';
  el.dataset.fit = s.bgFit || 'cover';
  const root = document.documentElement.style;
  root.setProperty('--bg-a', bgDataUrl ? String(s.bgOpacity) : '0');
  root.setProperty('--bg-blur', `${s.bgBlur || 0}px`);
  root.setProperty('--scrim', String(s.bgScrim ?? 0));
  root.setProperty('--box-blur', `${s.boxBlur ?? 10}px`);
  root.setProperty('--box-tint', String(s.boxTint ?? 0.15));
  // Photo backgrounds need hairline borders and a text shadow to stay legible.
  document.body.classList.toggle('has-bg', !!bgDataUrl);
}


async function set(patch) {
  Object.assign(state.settings, patch);
  applyAppearance();
  await api.setSettings(patch);
}



/* -------------------------------------------------------------------- nav */

const TABS = [
  { id: 'projects', label: 'Projects', icon: 'code' },
  { id: 'apps', label: 'Apps', icon: 'grid' },
  { id: 'links', label: 'Web', icon: 'globe' },
  { id: 'notes', label: 'Notes', icon: 'note' },
];


const SIDE_TABS = ['settings', 'help'];


function renderTabs() {
  if (!SIDE_TABS.includes(tab)) lastContentTab = tab;
  $('#tabs').innerHTML = TABS.map((t) =>
    `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}" title="${t.label}">
      ${icon(t.icon)}<span>${t.label}</span></button>`).join('');
}


function goTab(id) {
  tab = id;
  selection = -1;
  renderTabs();
  $('#btn-settings').classList.toggle('active', id === 'settings');
  $('#btn-help').classList.toggle('active', id === 'help');
  render();
  api.setSettings({ lastTab: id });
}


function toggleSettings() {
  goTab(tab === 'settings' ? lastContentTab : 'settings');
}


function toggleHelp() {
  goTab(tab === 'help' ? lastContentTab : 'help');
}



/* ------------------------------------------------------------------ cards */

function tile(id, label) {
  return `<span class="tile" data-icon-for="${esc(id)}">${esc(label)}</span>`;
}


// Cards end in a primary action plus one "more" button (see showContextMenu).
const moreButton = () => `<button class="mini icon-only" data-act="more" title="More">${icon('more')}</button>`;


const FILE_ICON_BY_EXT = {
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video', wmv: 'video', flv: 'video', m4v: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', heic: 'image',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio', wma: 'audio',
};


function projectActionIcon(p) {
  if (p.opener === 'editor') return 'code';
  if (p.kind !== 'file') return 'folder';
  const ext = String(p.path).split('.').pop().toLowerCase();
  return FILE_ICON_BY_EXT[ext] || 'note';
}


function projectCard(p) {
  return `<article class="card${p.missing ? ' missing' : ''}" data-kind="project" data-id="${esc(p.id)}" draggable="true">
    <div class="card-top">
      ${tile(p.id, initial(p.name))}
      <div class="card-heads">
        <div class="card-title">
          <span class="name">${esc(p.name)}</span>
          <span class="branch" data-branch-for="${esc(p.id)}">${p.git && p.git.branch ? esc(p.git.branch) : ''}</span>
        </div>
      </div>
    </div>
    <div class="card-actions">
      <button class="mini primary" data-act="open">${icon(projectActionIcon(p))}<span>Open</span></button>
      ${p.url ? `<button class="mini icon-only" data-act="url" title="Open link">${icon('globe')}</button>` : ''}
      ${moreButton()}
    </div>
  </article>`;
}


function appCard(a) {
  return `<article class="card" data-kind="app" data-id="${esc(a.id)}" draggable="true">
    <div class="card-top">
      ${tile(a.id, initial(a.name))}
      <div class="card-heads">
        <div class="card-title"><span class="name">${esc(a.name)}</span></div>
      </div>
    </div>
    <div class="card-actions">
      <button class="mini primary" data-act="launch">${icon('play')}<span>Launch</span></button>
      ${moreButton()}
    </div>
  </article>`;
}


function linkCard(l) {
  return `<article class="card" data-kind="link" data-id="${esc(l.id)}" draggable="true">
    <div class="card-top">
      ${tile(l.id, initial(host(l.url)))}
      <div class="card-heads">
        <div class="card-title"><span class="name">${esc(l.name)}</span></div>
        <div class="card-sub" title="${esc(l.url)}">${esc(host(l.url))}</div>
      </div>
    </div>
    <div class="card-actions">
      <button class="mini primary" data-act="open">${icon('globe')}<span>Open</span></button>
      ${moreButton()}
    </div>
  </article>`;
}


const CARD = { projects: projectCard, apps: appCard, links: linkCard };


function addCard(collection, label) {
  return `<article class="card add" data-add="${collection}">${icon('plus')}<span>${esc(label)}</span></article>`;
}



/* ------------------------------------------------------------------ views */

// Pinned first, then stored (drag-reordered) order.
function sorted(list) {
  return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}


function matches(item, q) {
  const hay = `${item.name} ${item.path || ''} ${item.target || ''} ${item.url || ''}`.toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}


function render() {
  if (query.trim() || latchedShortcut) return renderSearch();
  if (tab === 'notes') return renderNotes();
  if (tab === 'settings') return renderSettings();
  if (tab === 'help') return renderHelp();
  return renderCollection(tab);
}


const EMPTY = {
  projects: ['A code folder, a PDF, a book — anything you want one click away.', 'Add project'],
  apps: ['Add any program, shortcut or protocol link — Teams, Spotify, anything.', 'Add app'],
  links: ['Pin the pages you open every day.', 'Add link'],
};


function renderCollection(collection) {
  const items = sorted(state[collection]);
  const [blurb, addLabel] = EMPTY[collection];
  if (!items.length) {
    $('#view').innerHTML = `<div class="empty"><p>${esc(blurb)}</p>
      <button class="btn primary" data-add="${collection}">${icon('plus')}${esc(addLabel)}</button></div>`;
    return;
  }

  $('#view').innerHTML = `<div class="grid">${items.map(CARD[collection]).join('')}${addCard(collection, addLabel)}</div>`;
  if (collection === 'projects') hydrateProjects(items);
  else hydrateIcons(items);
}


function renderSearch() {
  const q = query.trim().toLowerCase();
  // Latched chip means site search only; local matches are noise.
  const found = latchedShortcut ? { projects: [], apps: [], links: [] } : {
    projects: state.projects.filter((p) => matches(p, q)),
    apps: state.apps.filter((a) => matches(a, q)),
    links: state.links.filter((l) => matches(l, q)),
  };

  const block = (label, collection) => (found[collection].length
    ? `<div class="group">${label}</div><div class="grid">${found[collection].map(CARD[collection]).join('')}</div>`
    : '');

  const total = found.projects.length + found.apps.length + found.links.length;
  const searchLabel = latchedShortcut ? `Search !${esc(latchedShortcut.trigger)}` : 'Search the web';
  const searchSub = query.trim() ? esc(query.trim()) : (latchedShortcut ? 'Press Enter to open the site' : '');

  $('#view').innerHTML =
    block('Projects', 'projects') + block('Apps', 'apps') + block('Web', 'links')
    + `<div class="group">Search</div><div class="grid">
        <article class="card" data-kind="websearch">
          <div class="card-top">${tile('web', '')}
            <div class="card-heads">
              <div class="card-title"><span class="name">${searchLabel}</span></div>
              <div class="card-sub">${searchSub}</div>
            </div>
          </div>
          <div class="card-actions"><button class="mini primary">${icon('globe')}<span>Open in browser</span></button></div>
        </article>
      </div>`;

  document.querySelector('[data-icon-for="web"]').innerHTML = icon('globe');
  hydrateProjects(found.projects);
  hydrateIcons(found.apps);
  selection = (total || latchedShortcut) ? 0 : -1;
  paintSelection();
}



/* ------------------------------------------------------------------ notes */

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}


function formatAlarmTime(ms) {
  const d = new Date(ms);
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString([], opts);
}


function dayLabel(d) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}


const ALARM_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);


function openAlarmPicker(note) {
  const back = $('#modal-backdrop');
  back.hidden = false;

  const start = note.alarmAt ? new Date(note.alarmAt) : new Date(Date.now() + 15 * 60000);
  let selDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const h24 = start.getHours();
  const hour12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const minute = Math.round(start.getMinutes() / 5) * 5 % 60;

  $('#modal').innerHTML = `<h3>Set alarm</h3>
    <div class="body">
      <div class="form-field">
        <label>When</label>
        <div class="alarm-day">
          <button type="button" class="day-step" data-step="-1" aria-label="Previous day">${icon('chevronLeft')}</button>
          <div class="day-label" id="f-alarm-day">${esc(dayLabel(selDay))}</div>
          <button type="button" class="day-step" data-step="1" aria-label="Next day">${icon('chevronRight')}</button>
        </div>
        <div class="alarm-time-row">
          <select id="f-alarm-hour">${Array.from({ length: 12 }, (_, i) => i + 1)
            .map((h) => `<option value="${h}"${h === hour12 ? ' selected' : ''}>${h}</option>`).join('')}</select>
          <span class="alarm-colon">:</span>
          <select id="f-alarm-minute">${ALARM_MINUTES
            .map((m) => `<option value="${m}"${m === minute ? ' selected' : ''}>${String(m).padStart(2, '0')}</option>`).join('')}</select>
          <select id="f-alarm-ampm">
            <option${ampm === 'AM' ? ' selected' : ''}>AM</option>
            <option${ampm === 'PM' ? ' selected' : ''}>PM</option>
          </select>
        </div>
        <div class="help">Local time on this device. When it fires, the window comes to the front and sounds until you dismiss or remove the note.</div>
      </div>
    </div>
    <div class="foot">
      ${note.alarmAt ? '<button class="btn danger" data-clear-alarm>Clear alarm</button>' : ''}
      <div style="flex:1"></div>
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn primary" data-save-alarm>Save</button>
    </div>`;

  const modal = $('#modal');
  const dayLabelEl = modal.querySelector('#f-alarm-day');
  const hourSel = modal.querySelector('#f-alarm-hour');
  const minuteSel = modal.querySelector('#f-alarm-minute');
  const ampmSel = modal.querySelector('#f-alarm-ampm');

  modal.querySelectorAll('.day-step').forEach((btn) => {
    btn.addEventListener('click', () => {
      selDay.setDate(selDay.getDate() + Number(btn.dataset.step));
      dayLabelEl.textContent = dayLabel(selDay);
    });
  });

  const computeMs = () => {
    let h24Val = Number(hourSel.value) % 12;
    if (ampmSel.value === 'PM') h24Val += 12;
    const dt = new Date(selDay);
    dt.setHours(h24Val, Number(minuteSel.value), 0, 0);
    return dt.getTime();
  };

  const apply = async (patch) => {
    const fresh = state.notes.find((n) => n.id === note.id);
    if (!fresh) return closeModal();
    const updatedAt = Date.now();
    Object.assign(fresh, patch, { updatedAt });
    state.notes = await api.saveItem('notes', { id: note.id, ...patch, updatedAt });
    closeModal();
    render();
  };

  modal.querySelector('[data-save-alarm]').addEventListener('click', () => {
    const ms = computeMs();
    if (ms <= Date.now()) return toast('Pick a time in the future', 'error');
    apply({ alarmAt: ms, alarmFired: false });
  });

  const clearBtn = modal.querySelector('[data-clear-alarm]');
  if (clearBtn) clearBtn.addEventListener('click', () => apply({ alarmAt: null, alarmFired: false }));
  modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
  back.onclick = (e) => { if (e.target === back) closeModal(); };
}


function renderNotes() {
  // Ordered by creation so boxes do not jump while typing.
  const notes = state.notes.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  $('#view').innerHTML = `<div class="notes-grid">
    ${notes.map((n) => `<article class="note" data-id="${esc(n.id)}">
      <div class="note-head">
        <input class="note-title" value="${esc(n.title || '')}" placeholder="Untitled" spellcheck="false" />
        <button class="note-alarm-btn${n.alarmAt ? ' active' : ''}" title="${n.alarmAt ? 'Change alarm' : 'Set alarm'}">${icon('alarm')}</button>
        <button class="note-del" title="Delete note">${icon('trash')}</button>
      </div>
      ${n.alarmAt ? `<div class="note-alarm">${icon('alarm')}<span>${esc(formatAlarmTime(n.alarmAt))}</span></div>` : ''}
      <textarea placeholder="Anything you keep forgetting…" spellcheck="true">${esc(n.text || '')}</textarea>
    </article>`).join('')}
    <article class="note add" id="note-add">${icon('plus')}<span>New note</span></article>
  </div>`;

  const timers = new Map();
  const queueSave = (id, patch) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    Object.assign(note, patch, { updatedAt: Date.now() });
    clearTimeout(timers.get(id));
    // Saved without re-rendering to keep caret and scroll.
    timers.set(id, setTimeout(() => api.saveItem('notes', { id, ...patch, updatedAt: note.updatedAt }), 400));
  };

  $('#view').querySelectorAll('.note[data-id]').forEach((el) => {
    const id = el.dataset.id;
    const ta = el.querySelector('textarea');
    autoGrow(ta);
    el.querySelector('.note-title').addEventListener('input', (e) => queueSave(id, { title: e.target.value }));
    ta.addEventListener('input', (e) => { autoGrow(ta); queueSave(id, { text: e.target.value }); });
    el.querySelector('.note-alarm-btn').addEventListener('click', () => {
      const note = state.notes.find((n) => n.id === id);
      if (note) openAlarmPicker(note);
    });
    el.querySelector('.note-del').addEventListener('click', async () => {
      const note = state.notes.find((n) => n.id === id);
      if (note && (note.text || '').trim()) {
        const ok = await confirmDialog(`Delete “${note.title || 'Untitled'}”?`, 'The note and its contents are removed.');
        if (!ok) return;
      }
      state.notes = await api.deleteItem('notes', id);
      render();
    });
  });

  $('#note-add').addEventListener('click', async () => {
    const note = { id: uid(), title: '', text: '', createdAt: Date.now(), updatedAt: Date.now() };
    state.notes = await api.saveItem('notes', note);
    render();
    const fresh = $(`.note[data-id="${CSS.escape(note.id)}"] .note-title`);
    if (fresh) fresh.focus();
  });
}



/* ------------------------------------------------------------- note alarms */

let alarmAudioCtx = null;
let alarmLoopTimer = null;


function playAlarmBurst() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = alarmAudioCtx || (alarmAudioCtx = new Ctx());
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const chime = (t, freq, dur) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + t);
    gain.gain.setValueAtTime(0, now + t);
    gain.gain.linearRampToValueAtTime(0.16, now + t + 0.015);
    gain.gain.setValueAtTime(0.16, now + t + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, now + t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + dur + 0.02);
  };

  chime(0, 988, 0.12);
  chime(0.16, 988, 0.12);
  chime(0.32, 1319, 0.22);
}


function startAlarmSound() {
  stopAlarmSound();
  playAlarmBurst();
  alarmLoopTimer = setInterval(playAlarmBurst, 1300);
}


function stopAlarmSound() {
  clearInterval(alarmLoopTimer);
  alarmLoopTimer = null;
}


function showAlarmOverlay(payload) {
  tab = 'notes';
  lastContentTab = 'notes';
  renderTabs();
  render();

  const overlay = $('#alarm-overlay');
  const card = $('#alarm-card');
  card.innerHTML = `
    <div class="alarm-icon">${icon('alarm')}</div>
    <h3>${esc(payload.title || 'Untitled note')}</h3>
    <div class="alarm-time">${esc(formatAlarmTime(payload.alarmAt))}</div>
    ${payload.text ? `<div class="alarm-text">${esc(payload.text)}</div>` : ''}
    <div class="foot">
      <button class="btn danger" data-remove>Remove note</button>
      <button class="btn primary" data-ack>Dismiss</button>
    </div>`;
  overlay.hidden = false;
  startAlarmSound();

  const close = async (removeNote) => {
    stopAlarmSound();
    if (removeNote) state.notes = await api.deleteItem('notes', payload.id);
    await api.ackAlarm(payload.id);
    const fresh = await api.getState();
    state.notes = fresh.notes;
    overlay.hidden = true;
    if (tab === 'notes') render();
  };

  card.querySelector('[data-ack]').addEventListener('click', () => close(false));
  card.querySelector('[data-remove]').addEventListener('click', () => close(true));
}



/* ------------------------------------------------------------ enrichment */

function iconSourceFor(p) {
  if (p.opener === 'custom' && p.openerPath) return p.openerPath;
  if (p.opener === 'editor') return state.settings.editor;
  return p.kind === 'file' ? p.path : null;
}


async function fetchIconInto(id, src) {
  const holder = document.querySelector(`[data-icon-for="${CSS.escape(id)}"]`);
  if (!holder) return;
  if (!src) { holder.innerHTML = icon('folder'); return; }
  let data = iconCache.get(src);
  if (data === undefined) {
    data = await api.fileIcon(src);
    iconCache.set(src, data);
  }

  if (data) holder.innerHTML = `<img src="${data}" alt="" />`;
}


async function hydrateProjects(items) {
  for (const p of items) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await api.pathExists(p.path);
    p.missing = !exists;
    const card = document.querySelector(`.card[data-id="${CSS.escape(p.id)}"]`);
    if (!card) continue;
    card.classList.toggle('missing', !exists);
    if (!exists) continue;
    // eslint-disable-next-line no-await-in-loop
    await fetchIconInto(p.id, iconSourceFor(p));
    if (p.kind === 'file') continue;
    // eslint-disable-next-line no-await-in-loop
    const git = await api.gitInfo(p.path);
    p.git = git;
    const slot = document.querySelector(`[data-branch-for="${CSS.escape(p.id)}"]`);
    if (slot && git && git.branch) slot.textContent = git.changes ? `${git.branch} · ${git.changes}` : git.branch;
  }
}


async function hydrateIcons(items) {
  for (const a of items) {
    // eslint-disable-next-line no-await-in-loop
    await fetchIconInto(a.id, a.icon || a.target);
  }
}



/* --------------------------------------------------------------- actions */

async function activate(el, act) {
  const kind = el.dataset.kind;
  const id = el.dataset.id;
  if (kind === 'websearch') return openWeb();

  const collection = kind === 'project' ? 'projects' : kind === 'app' ? 'apps' : 'links';
  const item = state[collection].find((x) => x.id === id);
  if (!item) return null;
  if (act === 'edit') return openForm(collection, item);
  if (act === 'reveal') return handle(api.reveal(item.path));

  let res;
  if (kind === 'project') res = await handle(api.openProject(id, act || 'open'));
  else if (kind === 'app') res = await handle(api.launchApp(id));
  else res = await handle(api.openLink(id));

  if (res && res.ok) {
    afterLaunch();
    const next = await api.getState();
    state[collection] = next[collection];
  }

  return null;
}


function afterLaunch() {
  if (state.settings.hideOnBlur) api.hide();
}


async function openWeb() {
  const value = query.trim();
  if (!value && !latchedShortcut) return;
  // Bare "!trigger" opens that site's homepage (see buildSearchUrl).
  const composed = latchedShortcut ? `!${latchedShortcut.trigger} ${value}`.trim() : value;
  const res = await handle(api.openWeb(composed));
  if (res && res.ok) {
    clearOmni();
    afterLaunch();
  }
}


async function removeItem(collection, item) {
  const ok = await confirmDialog(`Remove “${item.name}”?`,
    collection === 'projects'
      ? 'This only removes it from the deck. Nothing on disk is touched.'
      : 'This only removes the shortcut from the deck.');
  if (!ok) return;
  state[collection] = await api.deleteItem(collection, item.id);
  render();
}



/* ---------------------------------------------------------------- modals */

function closeModal() {
  $('#modal-backdrop').hidden = true;
  $('#modal').innerHTML = '';
}


function confirmDialog(title, body) {
  return new Promise((resolve) => {
    const back = $('#modal-backdrop');
    back.hidden = false;
    $('#modal').innerHTML = `<h3>${esc(title)}</h3>
      <div class="body"><div class="help" style="font-size:.8em;color:var(--muted)">${esc(body)}</div></div>
      <div class="foot"><div style="flex:1"></div>
        <button class="btn ghost" data-c="0">Cancel</button>
        <button class="btn danger" data-c="1">Remove</button>
      </div>`;
    const done = (v) => { closeModal(); resolve(v); };
    $('#modal').querySelectorAll('[data-c]').forEach((b) =>
      b.addEventListener('click', () => done(b.dataset.c === '1')));
    back.onclick = (e) => { if (e.target === back) done(false); };
    $('#modal').querySelector('[data-c="1"]').focus();
  });
}


const OPENER_OPTIONS = [
  ['editor', 'Code editor'],
  ['default', 'System default app'],
  ['custom', 'Choose a program…'],
];


const FORMS = {
  projects: {
    title: 'project',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'my-app', required: true },
      { key: 'path', label: 'Location', placeholder: 'A folder or a file', required: true },
      { key: 'url', label: 'Link (optional)', placeholder: 'http://localhost:3000' },
    ],
  },
  apps: {
    title: 'app',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Microsoft Teams', required: true },
      { key: 'target', label: 'Program or URI', placeholder: 'msteams:  —  or the app\'s install path', pick: 'file', required: true,
        help: 'An installed app\'s path, a protocol like msteams: or spotify:, or a web app URL.' },
    ],
  },
  links: {
    title: 'link',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'GitHub', required: true },
      { key: 'url', label: 'URL', placeholder: 'https://github.com', required: true },
    ],
  },
  shortcuts: {
    title: 'search shortcut',
    fields: [
      { key: 'trigger', label: 'Trigger', placeholder: 'yt', required: true,
        help: 'Typed as !trigger before a search, e.g. !yt.' },
      { key: 'url', label: 'URL template', placeholder: 'https://www.youtube.com/results?search_query={q}', required: true,
        help: 'Include {q} where your search text goes. Left out, it gets appended as ?q= instead.' },
    ],
  },
};


function openForm(collection, existing) {
  const spec = FORMS[collection];
  const item = existing || { id: uid() };
  const isProject = collection === 'projects';
  let kind = isProject && item.kind === 'file' ? 'file' : 'code';
  const back = $('#modal-backdrop');
  back.hidden = false;

  const openerDefault = item.opener || (kind === 'file' ? 'default' : 'editor');
  $('#modal').innerHTML = `<h3>${existing ? 'Edit' : 'New'} ${esc(spec.title)}</h3>
    <div class="body">
      ${collection === 'apps' && !existing ? `<div class="form-field">
        <label for="f-find">Find installed app</label>
        <input id="f-find" type="text" placeholder="Type to search…" autocomplete="off" />
        <div class="app-results" id="app-results"></div>
      </div>` : ''}
      ${spec.fields.map((f) => {
        if (f.key === 'path' && isProject) {
          // Windows' native dialog cannot pick files and folders at once, so two buttons.
          return `<div class="form-field">
            <label for="f-path">${esc(f.label)}</label>
            <div class="with-btn">
              <input id="f-path" type="text" value="${esc(item.path || '')}" placeholder="${esc(f.placeholder || '')}" />
              <button class="btn" data-pick="folder" data-for="path">Folder</button>
              <button class="btn" data-pick="anyfile" data-for="path">File</button>
            </div>
          </div>`;
        }
        return `<div class="form-field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        ${f.pick
          ? `<div class="with-btn">
              <input id="f-${f.key}" type="text" value="${esc(item[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" />
              <button class="btn" data-pick="${f.pick}" data-for="${f.key}">Browse</button>
            </div>`
          : `<input id="f-${f.key}" type="text" value="${esc(item[f.key] || '')}" placeholder="${esc(f.placeholder || '')}" />`}
        ${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}
      </div>`;
      }).join('')}
      ${isProject ? `<div class="form-field">
        <label for="f-opener">Open with</label>
        <select id="f-opener">
          ${OPENER_OPTIONS.map(([v, label]) => `<option value="${v}"${openerDefault === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field" id="f-opener-path-row"${openerDefault !== 'custom' ? ' hidden' : ''}>
        <label for="f-openerPath">Program</label>
        <div class="with-btn">
          <input id="f-openerPath" type="text" value="${esc(item.openerPath || '')}" placeholder="The app's install path" />
          <button class="btn" data-pick="exe" data-for="openerPath">Browse</button>
        </div>
      </div>` : ''}
    </div>
    <div class="foot">
      ${existing ? '<button class="btn danger" data-del>Remove</button>' : ''}
      <div style="flex:1"></div>
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn primary" data-save>${existing ? 'Save' : 'Add'}</button>
    </div>`;

  const modal = $('#modal');
  const val = (k) => modal.querySelector(`#f-${k}`).value.trim();
  const openerSel = isProject ? modal.querySelector('#f-opener') : null;
  const openerRow = isProject ? modal.querySelector('#f-opener-path-row') : null;
  if (openerSel) openerSel.addEventListener('change', () => { openerRow.hidden = openerSel.value !== 'custom'; });

  let pickedIcon = null;
  const find = modal.querySelector('#f-find');
  if (find) {
    const results = modal.querySelector('#app-results');
    const installedReady = api.listInstalledApps();
    let hits = [];
    find.addEventListener('input', async () => {
      const installed = await installedReady;
      const q = find.value.trim().toLowerCase();
      hits = q ? installed.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6) : [];
      results.innerHTML = hits.map((a, i) =>
        `<button type="button" data-i="${i}"><span class="res-icon" data-res="${i}"></span>${esc(a.name)}</button>`).join('');
      hits.forEach(async (a, i) => {
        const src = a.icon || a.target;
        let data = iconCache.get(src);
        if (data === undefined) { data = await api.fileIcon(src); iconCache.set(src, data); }
        const slot = results.querySelector(`[data-res="${i}"]`);
        if (slot && data && hits[i] === a) slot.innerHTML = `<img src="${data}" alt="" />`;
      });
    });
    results.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = hits[Number(b.dataset.i)];
      modal.querySelector('#f-name').value = a.name;
      modal.querySelector('#f-target').value = a.target;
      pickedIcon = a.icon || '';
      results.innerHTML = '';
      find.value = '';
    });
  }

  modal.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      let picked;
      let isDir;
      if (btn.dataset.pick === 'folder') { picked = await api.pickFolder(); isDir = true; }
      else if (btn.dataset.pick === 'anyfile') { picked = await api.pickFile(); isDir = false; }
      else { picked = await api.pickFile('exe'); }
      if (!picked) return;
      modal.querySelector(`#f-${btn.dataset.for}`).value = picked;
      const nameInput = modal.querySelector('#f-name');
      if (nameInput && !nameInput.value.trim()) nameInput.value = baseName(picked).replace(/\.[^.]+$/, '');
      if (btn.dataset.for === 'path' && isProject) {
        kind = isDir ? 'code' : 'file';
        // Default "Open with" only if the user has not chosen one.
        if (!item.opener && openerSel) {
          openerSel.value = kind === 'file' ? 'default' : 'editor';
          openerRow.hidden = true;
        }
      }
    });
  });

  const save = async () => {
    const next = { id: item.id };
    for (const f of spec.fields) {
      next[f.key] = val(f.key);
      if (f.required && !next[f.key]) {
        toast(`${f.label} is required`, 'error');
        modal.querySelector(`#f-${f.key}`).focus();
        return;
      }
    }
    if (isProject) {
      next.kind = (await api.pathKind(next.path)) === 'file' ? 'file' : 'code';
      next.opener = openerSel ? openerSel.value : 'default';
      next.openerPath = next.opener === 'custom' ? val('openerPath') : '';
      if (next.opener === 'custom' && !next.openerPath) {
        toast('Choose a program', 'error');
        modal.querySelector('#f-openerPath').focus();
        return;
      }
    }
    if (collection === 'shortcuts') {
      next.trigger = next.trigger.replace(/^!+/, '').trim().toLowerCase().replace(/\s+/g, '');
      if (!next.trigger) {
        toast('Trigger is required', 'error');
        modal.querySelector('#f-trigger').focus();
        return;
      }
      const dup = state.shortcuts.find((s) => s.id !== next.id && s.trigger === next.trigger);
      if (dup) {
        toast(`!${next.trigger} is already used`, 'error');
        modal.querySelector('#f-trigger').focus();
        return;
      }
    }
    if (collection === 'apps') {
      next.icon = pickedIcon !== null ? pickedIcon : (existing && existing.target === next.target ? existing.icon || '' : '');
    }
    state[collection] = await api.saveItem(collection, next);
    iconCache.delete(next.target);
    iconCache.delete(next.icon);
    if (isProject) { iconCache.delete(next.path); iconCache.delete(next.openerPath); iconCache.delete(state.settings.editor); }
    closeModal();
    render();
  };

  modal.querySelector('[data-save]').addEventListener('click', save);
  modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
  const del = modal.querySelector('[data-del]');
  if (del) del.addEventListener('click', () => { closeModal(); removeItem(collection, item); });
  // Bound to .body and rebuilt per open so handlers cannot accumulate.
  modal.querySelector('.body').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
  });

  back.onclick = (e) => { if (e.target === back) closeModal(); };
  setTimeout(() => (find || modal.querySelector(`#f-${spec.fields[0].key}`)).focus(), 20);
}



/* -------------------------------------------------------------- help view */

const key = (text) => `<span class="key">${esc(text)}</span>`;
const helpRow = (name, desc) => row(name, desc, '');


function renderHelp() {
  $('#view').innerHTML = `<div class="settings">

    <section class="panel"><h3>Basics</h3>
      ${helpRow('Show / hide', `${key('Alt+Space')}, rebindable in Settings. Losing focus or the tray icon also hides it; the app keeps running.`)}
      ${row('Intro', 'Replay the welcome tour.', '<button class="btn" data-intro>Replay</button>')}
      ${helpRow('Tabs', 'Projects, Apps, Web, Notes. Right-click a card for its full action list; drag a card to reorder.')}
      ${helpRow('Projects', 'A folder or a single file. "Open with" sets how it launches: your code editor, the OS default app, or any program you pick.')}
      ${helpRow('Search', `Types as a URL or domain opens directly; anything else searches your engine and matches Projects/Apps/Web as you type. Prefix with a shortcut, e.g. ${key('!yt lofi hip hop')} — edit shortcuts in Settings.`)}
    </section>

    <section class="panel"><h3>Notes</h3>
      ${helpRow('Notes', 'Each note autosaves and resizes to its content. Delete confirms only if it has text.')}
      ${helpRow('Alarms', `The clock icon on a note sets a local date and time. When it fires, the window comes forward and sounds until you dismiss or remove the note.`)}
    </section>

    <section class="panel"><h3>Data</h3>
      ${helpRow('Storage', 'One local JSON file, no network. Settings → Data: Show file, Export, Import.')}
      ${helpRow('Background', 'Settings → Background → Choose. The image is copied locally; opacity, blur, dim and fit are independent.')}
    </section>

    <section class="panel"><h3>Keyboard shortcuts</h3>
      ${helpRow('Switch tabs', key('Ctrl+1') + '–' + key('Ctrl+4'))}
      ${helpRow('Settings / Help', key('Ctrl+,') + ' / ' + key('?'))}
      ${helpRow('Focus search', key('Ctrl+F'))}
      ${helpRow('Add item', key('Ctrl+N'))}
      ${helpRow('Navigate cards', key('↑ ↓ ← →'))}
      ${helpRow('Open selection', key('Enter') + ' (' + key('Shift+Enter') + ' folder, ' + key('Ctrl+Enter') + ' terminal)')}
      ${helpRow('Clear / hide', key('Esc'))}
    </section>
  </div>`;
}



/* --------------------------------------------------------- settings view */

function row(name, desc, control) {
  return `<div class="set-row"><div class="set-label"><div class="name">${name}</div>
    ${desc ? `<div class="desc">${desc}</div>` : ''}</div>
    <div class="set-control">${control}</div></div>`;
}


const toggleHtml = (key) =>
  `<div class="switch" role="switch" tabindex="0" data-toggle="${key}" aria-checked="${!!state.settings[key]}"></div>`;

const UNITS = {
  windowOpacity: '%', panelOpacity: '%', bgOpacity: '%', bgScrim: '%', blur: 'px', radius: 'px',
  bgBlur: 'px', fontScale: 'x', boxBlur: 'px', boxTint: '%',
};


function fmt(v, unit) {
  if (unit === '%') return `${Math.round(v * 100)}%`;
  if (unit === 'px') return `${v}px`;
  if (unit === 'x') return `${Number(v).toFixed(2)}x`;
  return String(v);
}


function sliderHtml(key, min, max, step) {
  const v = state.settings[key] ?? min;
  return `<div class="slider-row">
    <input type="range" data-slider="${key}" min="${min}" max="${max}" step="${step}" value="${v}"
      style="--pct:${((v - min) / (max - min)) * 100}%" />
    <span class="slider-val" data-slider-val="${key}">${fmt(v, UNITS[key])}</span></div>`;
}


const selectHtml = (key, options) =>
  `<select data-select="${key}" class="field-w">${options.map(([v, l]) =>
    `<option value="${esc(v)}" ${state.settings[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

const textHtml = (key, placeholder) =>
  `<input type="text" class="field-w" data-text="${key}" value="${esc(state.settings[key] || '')}" placeholder="${esc(placeholder)}" />`;

function renderSettings() {
  const s = state.settings;
  $('#view').innerHTML = `<div class="settings">

    <section class="panel"><h3>General</h3>
      ${row('Name', 'Shown in the corner. Leave empty for none.', textHtml('name', 'your name'))}
      ${row('Global hotkey', 'Press the keys you want.',
        `<input type="text" class="hotkey-capture" id="hotkey" readonly value="${esc(s.hotkey || 'none')}" />
         <button class="btn ghost" id="hotkey-clear">Clear</button>`)}
      ${row(`Start with ${OS_NAME[state.meta && state.meta.platform] || 'your OS'}`, '', toggleHtml('launchOnStartup'))}
      ${row('Start hidden', 'Launch straight to the tray; the hotkey brings it up.', toggleHtml('startHidden'))}
      ${row('Hide when it loses focus', '', toggleHtml('hideOnBlur'))}
      ${row('Always on top', '', toggleHtml('alwaysOnTop'))}
    </section>

    <section class="panel"><h3>Appearance</h3>
      ${row('Theme', '', selectHtml('theme', [
        ['graphite', 'Graphite'], ['bone', 'Bone (light)'],
      ]))}
      ${row('Window opacity', '', sliderHtml('windowOpacity', 0.3, 1, 0.01))}
      ${row('Panel opacity', '', sliderHtml('panelOpacity', 0.15, 1, 0.01))}
      ${row('Blur', '', sliderHtml('blur', 0, 60, 1))}
      ${row('Corner radius', '', sliderHtml('radius', 0, 30, 1))}
      ${row('Text size', '', sliderHtml('fontScale', 0.85, 1.35, 0.01))}
    </section>

    <section class="panel"><h3>Background</h3>
      ${row('Image', bgDataUrl ? 'An image is set.' : 'No image set.',
        `<div class="btn-row">
          <button class="btn" id="bg-choose">${icon('image')}Choose</button>
          ${bgDataUrl ? '<button class="btn ghost" id="bg-clear">Remove</button>' : ''}
        </div>`)}
      ${row('Image opacity', 'How much of the photo shows through.', sliderHtml('bgOpacity', 0, 1, 0.01))}
      ${row('Image blur', 'Blurs the photo itself.', sliderHtml('bgBlur', 0, 40, 1))}
      ${row('Fit', '', selectHtml('bgFit', [
        ['cover', 'Fill'], ['contain', 'Fit'], ['center', 'Actual size'], ['tile', 'Tile'],
      ]))}
      ${row('Dim', 'A dark layer over the photo, for legibility.', sliderHtml('bgScrim', 0, 0.85, 0.01))}
      ${row('Box blur', 'Frosted-glass blur behind cards and panels.', sliderHtml('boxBlur', 0, 24, 1))}
      ${row('Box tint', 'How solid those same boxes are.', sliderHtml('boxTint', 0, 0.6, 0.01))}
    </section>

    <section class="panel"><h3>Tools</h3>
      ${row('Code editor', 'Used by projects set to "Code editor" in their Open with.', textHtml('editor', 'code'))}
      ${row('Search engine', 'Used for anything typed that isn\'t a URL or a !shortcut.', textHtml('searchEngine', 'https://www.google.com/search?q={q}'))}
    </section>

    <section class="panel">
      <div class="panel-head" id="shortcuts-toggle" role="button" tabindex="0" aria-expanded="${shortcutsExpanded}">
        <span>Search shortcuts</span>
        <span class="panel-head-meta"><span class="count">${(state.shortcuts || []).length}</span>${icon('down')}</span>
      </div>
      ${shortcutsExpanded ? `
        ${(state.shortcuts || []).map((s) => `<div class="set-row">
          <div class="set-label">
            <div class="name">!${esc(s.trigger)}</div>
            <div class="desc">${esc(s.url)}</div>
          </div>
          <div class="set-control">
            <button class="btn ghost" data-edit-shortcut="${esc(s.id)}" title="Edit">${icon('edit')}</button>
            <button class="btn ghost" data-del-shortcut="${esc(s.id)}" title="Remove">${icon('trash')}</button>
          </div>
        </div>`).join('') || `<div class="set-row"><div class="set-label"><div class="desc">None yet — add one below.</div></div></div>`}
        ${row('Add one', 'Type !trigger before a search to send it straight to a URL template — {q} is where your search text goes.',
          `<button class="btn" id="add-shortcut">${icon('plus')}Add shortcut</button>`)}
      ` : ''}
    </section>

    <section class="panel"><h3>Data</h3>
      ${row('Backup', 'Everything lives in one JSON file.',
        `<div class="btn-row">
          <button class="btn" id="btn-export">${icon('down')}Export</button>
          <button class="btn" id="btn-import">${icon('up')}Import</button>
          <button class="btn ghost" id="btn-reveal">Show file</button>
        </div>`)}
      ${row('Quit', 'Closing the window only hides it.',
        `<button class="btn danger" id="btn-quit">${icon('power')}Quit</button>`)}
    </section>
  </div>`;

  bindSettings();
}


function bindSettings() {
  const view = $('#view');

  view.querySelectorAll('[data-toggle]').forEach((el) => {
    const flip = async () => {
      const key = el.dataset.toggle;
      const next = !state.settings[key];
      el.setAttribute('aria-checked', String(next));
      await set({ [key]: next });
    };
    el.addEventListener('click', flip);
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  });

  view.querySelectorAll('[data-slider]').forEach((el) => {
    const key = el.dataset.slider;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      el.style.setProperty('--pct', `${((v - el.min) / (el.max - el.min)) * 100}%`);
      view.querySelector(`[data-slider-val="${key}"]`).textContent = fmt(v, UNITS[key]);
      set({ [key]: v });
    });
  });

  view.querySelectorAll('[data-select]').forEach((el) =>
    el.addEventListener('change', () => set({ [el.dataset.select]: el.value })));

  view.querySelectorAll('[data-text]').forEach((el) => {
    let t = null;
    el.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => set({ [el.dataset.text]: el.value }), 350);
    });
  });

  const shortcutsToggle = $('#shortcuts-toggle');
  const flipShortcuts = () => { shortcutsExpanded = !shortcutsExpanded; render(); };
  shortcutsToggle.addEventListener('click', flipShortcuts);
  shortcutsToggle.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipShortcuts(); }
  });

  const addShortcut = $('#add-shortcut');
  if (addShortcut) addShortcut.addEventListener('click', () => openForm('shortcuts', null));
  view.querySelectorAll('[data-edit-shortcut]').forEach((b) => b.addEventListener('click', () => {
    const s = (state.shortcuts || []).find((x) => x.id === b.dataset.editShortcut);
    if (s) openForm('shortcuts', s);
  }));

  view.querySelectorAll('[data-del-shortcut]').forEach((b) => b.addEventListener('click', async () => {
    const s = (state.shortcuts || []).find((x) => x.id === b.dataset.delShortcut);
    if (!s) return;
    const ok = await confirmDialog(`Remove !${s.trigger}?`, 'It will stop working immediately.');
    if (!ok) return;
    state.shortcuts = await api.deleteItem('shortcuts', s.id);
    render();
  }));

  $('#bg-choose').addEventListener('click', async () => {
    const res = await api.chooseBackground();
    if (res && res.ok) {
      bgDataUrl = res.dataUrl;
      if (state.settings.bgOpacity < 0.05) await set({ bgOpacity: 0.35 });
      applyBackground();
      render();
    } else if (res && res.error) {
      toast(res.error, 'error');
    }
  });

  const clear = $('#bg-clear');
  if (clear) {
    clear.addEventListener('click', async () => {
      await api.clearBackground();
      bgDataUrl = null;
      state.settings.background = '';
      applyBackground();
      render();
    });
  }

  $('#btn-export').addEventListener('click', async () => {
    const r = await api.exportData();
    if (r && r.ok) toast('Backup saved');
  });

  $('#btn-import').addEventListener('click', async () => {
    const r = await api.importData();
    if (r && r.ok) { await boot(); toast('Backup restored'); }
    else if (r && r.error) toast(r.error, 'error');
  });

  $('#btn-reveal').addEventListener('click', () => api.revealData());
  $('#btn-quit').addEventListener('click', () => api.quit());

  bindHotkeyCapture();
}


function bindHotkeyCapture() {
  const input = $('#hotkey');
  input.addEventListener('focus', () => {
    input.classList.add('capturing');
    input.value = 'press keys';
  });

  input.addEventListener('blur', () => {
    input.classList.remove('capturing');
    input.value = state.settings.hotkey || 'none';
  });

  input.addEventListener('keydown', async (e) => {
    e.preventDefault();
    if (e.key === 'Escape') return input.blur();
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    let name = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (name === ' ') name = 'Space';
    if (!mods.length && !/^F\d{1,2}$/.test(name)) {
      toast('Use at least one modifier key', 'error');
      return;
    }
    const accel = [...mods, name].join('+');
    await set({ hotkey: accel });
    input.value = accel;
    input.blur();
  });

  $('#hotkey-clear').addEventListener('click', async () => {
    await set({ hotkey: '' });
    input.value = 'none';
  });
}



/* ------------------------------------------------------- keyboard & input */

function cards() {
  return [...document.querySelectorAll('.card[data-kind]')];
}


function paintSelection() {
  const list = cards();
  list.forEach((c, i) => c.classList.toggle('sel', i === selection));
  if (selection >= 0 && list[selection]) list[selection].scrollIntoView({ block: 'nearest' });
}


function updateOmniChip() {
  const chip = $('#omni-chip');
  chip.hidden = !latchedShortcut;
  chip.textContent = latchedShortcut ? latchedShortcut.trigger : '';
}


function tryLatchShortcut() {
  if (latchedShortcut) return;
  const omni = $('#omni');
  const m = omni.value.match(/^!(\S+)\s(.*)$/s);
  if (!m) return;
  const hit = (state.shortcuts || []).find((s) => s.trigger.toLowerCase() === m[1].toLowerCase());
  if (!hit) return;
  latchedShortcut = hit;
  omni.value = m[2];
  updateOmniChip();
}


function unlatchShortcut() {
  if (!latchedShortcut) return;
  const restored = `!${latchedShortcut.trigger} `;
  latchedShortcut = null;
  updateOmniChip();
  setQuery(restored);
  $('#omni').setSelectionRange(restored.length, restored.length);
}


function setQuery(value) {
  query = value;
  $('#omni').value = value;
  $('#omni-clear').hidden = !value && !latchedShortcut;
  selection = -1;
  render();
}


function clearOmni() {
  latchedShortcut = null;
  updateOmniChip();
  setQuery('');
}


function columns() {
  const grid = document.querySelector('.grid');
  if (!grid) return 1;
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
}


function bindKeys() {
  document.addEventListener('keydown', async (e) => {
    const modalOpen = !$('#modal-backdrop').hidden;
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.key === 'Escape') {
      if (modalOpen) return closeModal();
      if (query || latchedShortcut) return clearOmni();
      if (inField) return e.target.blur();
      return api.hide();
    }
    if (modalOpen) return;

    // Cmd is the primary modifier on macOS.
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      return goTab(TABS[Number(e.key) - 1].id);
    }
    if (mod && e.key === ',') {
      e.preventDefault();
      return toggleSettings();
    }
    if (e.key === '?' && !inField) {
      e.preventDefault();
      return toggleHelp();
    }
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      return $('#omni').focus();
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (FORMS[tab]) openForm(tab, null);
      return;
    }

    if (inField && e.target.id !== 'omni') return;

    const list = cards();
    if (list.length && ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
      if (e.target.id === 'omni' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? columns() : e.key === 'ArrowUp' ? -columns() : e.key === 'ArrowRight' ? 1 : -1;
      selection = selection < 0 ? 0 : Math.max(0, Math.min(list.length - 1, selection + step));
      return paintSelection();
    }

    if (e.key === 'Enter') {
      const card = list[selection];
      if (card) {
        e.preventDefault();
        return activate(card, e.shiftKey ? 'folder' : mod ? 'terminal' : undefined);
      }
      if (query.trim() || latchedShortcut) {
        e.preventDefault();
        return openWeb();
      }
    }
  });
}


function bindShell() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) goTab(btn.dataset.tab);
  });

  $('#view').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return openForm(add.dataset.add, null);
    const card = e.target.closest('.card[data-kind]');
    if (!card) return;
    const action = e.target.closest('[data-act]');
    if (action) e.stopPropagation();
    if (action && action.dataset.act === 'more') return showContextMenu(card, e.clientX, e.clientY);
    return activate(card, action ? action.dataset.act : undefined);
  });

  $('#view').addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card[data-kind]');
    if (!card || card.dataset.kind === 'websearch') return;
    e.preventDefault();
    showContextMenu(card, e.clientX, e.clientY);
  });

  bindDragReorder();

  const omni = $('#omni');
  omni.addEventListener('input', () => {
    tryLatchShortcut();
    setQuery(omni.value);
  });

  omni.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && latchedShortcut && omni.selectionStart === 0 && omni.selectionEnd === 0) {
      e.preventDefault();
      unlatchShortcut();
    }
  });

  $('#omni-clear').addEventListener('click', () => { clearOmni(); omni.focus(); });

  $('#btn-pin').innerHTML = icon('pin');
  $('#btn-help').innerHTML = icon('help');
  $('#btn-settings').innerHTML = icon('gear');
  $('#btn-hide').innerHTML = icon('close');
  $('#btn-pin').addEventListener('click', () => set({ alwaysOnTop: !state.settings.alwaysOnTop }));
  $('#btn-help').addEventListener('click', toggleHelp);
  $('#btn-settings').addEventListener('click', toggleSettings);
  $('#btn-hide').addEventListener('click', () => api.hide());

  bindDropZone();
}


function showContextMenu(card, x, y) {
  const existing = document.querySelector('.ctx-menu');
  if (existing) existing.remove();

  const kind = card.dataset.kind;
  const collection = kind === 'project' ? 'projects' : kind === 'app' ? 'apps' : 'links';
  const item = state[collection].find((i) => i.id === card.dataset.id);
  if (!item) return;

  const togglePin = async () => {
    state[collection] = await api.saveItem(collection, { id: item.id, pinned: !item.pinned });
    render();
  };

  const common = [
    [item.pinned ? 'Unpin' : 'Pin to top', togglePin],
    ['Edit', () => openForm(collection, item)],
    ['Remove', () => removeItem(collection, item)],
  ];

  const entries = kind === 'project'
    ? item.kind === 'file'
      ? [['Open', () => activate(card, 'open')],
         ['Show in folder', () => activate(card, 'reveal')],
         ['Copy path', () => copyText(item.path, 'Path')], ...common]
      : [['Open in editor', () => activate(card, 'editor')],
         ['Open folder', () => activate(card, 'folder')],
         ['Open terminal', () => activate(card, 'terminal')],
         ...(item.url ? [['Open link', () => activate(card, 'url')]] : []),
         ['Copy path', () => copyText(item.path, 'Path')], ...common]
    : kind === 'app'
      ? [['Launch', () => activate(card, 'launch')],
         ['Copy target', () => copyText(item.target, 'Target')], ...common]
      : [['Open', () => activate(card, 'open')],
         ['Copy URL', () => copyText(item.url, 'URL')], ...common];

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.innerHTML = entries.map(([label], i) =>
    `<button data-i="${i}" class="${label === 'Remove' ? 'danger' : ''}">${esc(label)}</button>`).join('');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  const box = menu.getBoundingClientRect();
  if (box.bottom > innerHeight) menu.style.top = `${Math.max(6, y - box.height)}px`;
  if (box.right > innerWidth) menu.style.left = `${Math.max(6, x - box.width)}px`;

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    menu.remove();
    entries[Number(btn.dataset.i)][1]();
  });

  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}


const REORDER_MIME = 'application/x-nexus-reorder';
const KIND_TO_COLLECTION = { project: 'projects', app: 'apps', link: 'links' };


function bindDragReorder() {
  const view = $('#view');
  let draggedId = null;
  let draggedCollection = null;

  view.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card[draggable]');
    if (!card) return;
    const collection = KIND_TO_COLLECTION[card.dataset.kind];
    if (!collection) return;
    draggedId = card.dataset.id;
    draggedCollection = collection;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(REORDER_MIME, draggedId);
  });

  view.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const card = e.target.closest('.card[draggable]');
    if (!card || card.dataset.id === draggedId || KIND_TO_COLLECTION[card.dataset.kind] !== draggedCollection) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const before = e.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
    card.classList.toggle('drag-before', before);
    card.classList.toggle('drag-after', !before);
  });

  view.addEventListener('dragleave', (e) => {
    const card = e.target.closest('.card[draggable]');
    if (card) card.classList.remove('drag-before', 'drag-after');
  });

  view.addEventListener('drop', async (e) => {
    if (!draggedId) return;
    const card = e.target.closest('.card[draggable]');
    view.querySelectorAll('.drag-before, .drag-after').forEach((c) => c.classList.remove('drag-before', 'drag-after'));
    if (!card || card.dataset.id === draggedId || KIND_TO_COLLECTION[card.dataset.kind] !== draggedCollection) return;
    e.preventDefault();
    const before = e.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2;
    const collection = draggedCollection;
    const ids = sorted(state[collection]).map((x) => x.id).filter((id) => id !== draggedId);
    const targetIndex = ids.indexOf(card.dataset.id);
    ids.splice(before ? targetIndex : targetIndex + 1, 0, draggedId);
    state[collection] = await api.reorder(collection, ids);
    render();
  });

  view.addEventListener('dragend', () => {
    view.querySelectorAll('.dragging').forEach((c) => c.classList.remove('dragging'));
    view.querySelectorAll('.drag-before, .drag-after').forEach((c) => c.classList.remove('drag-before', 'drag-after'));
    draggedId = null;
    draggedCollection = null;
  });
}


function bindDropZone() {
  const overlay = $('#drop-overlay');
  let depth = 0;
  // Window-level drag events also fire for internal card drags; handle OS drops only.
  const isFileDrag = (e) => e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files');
  window.addEventListener('dragenter', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); depth++; overlay.hidden = false; });
  window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; overlay.hidden = true; } });
  window.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const path = api.pathForFile(file);
    if (!path) return toast('Could not read that path', 'error');
    const isProgram = /\.(exe|lnk|cmd|bat|url|app|desktop|appimage)$/i.test(path);
    const isDoc = !isProgram && (await api.pathKind(path)) === 'file';
    const collection = isProgram ? 'apps' : 'projects';
    goTab(collection);
    openForm(collection, null);
    setTimeout(() => {
      $(`#f-${isProgram ? 'target' : 'path'}`).value = path;
      $('#f-name').value = baseName(path).replace(/\.[^.]+$/, '');
      const openerSel = $('#f-opener');
      if (openerSel) openerSel.value = isDoc ? 'default' : 'editor';
    }, 30);
  });
}



/* ------------------------------------------------------------------- boot */

async function boot() {
  state = await api.getState();
  bgDataUrl = await api.getBackground();
  applyAppearance();
  const last = state.settings.lastTab;
  if (TABS.some((t) => t.id === last) || SIDE_TABS.includes(last)) tab = last;
  if (!SIDE_TABS.includes(tab)) lastContentTab = tab;
  renderTabs();
  $('#btn-settings').classList.toggle('active', tab === 'settings');
  $('#btn-help').classList.toggle('active', tab === 'help');
  render();
}


function watchWidth() {
  const shell = $('#shell');
  const apply = () => document.body.classList.toggle('narrow', shell.clientWidth < 520);
  new ResizeObserver(apply).observe(shell);
  apply();
}


function bindScrollIndicator() {
  const view = $('#view');
  const bar = $('#scroll-indicator');
  const fill = bar.querySelector('span');
  const update = () => {
    const max = view.scrollHeight - view.clientHeight;
    const overflows = max > 2;
    bar.classList.toggle('hidden', !overflows);
    fill.style.width = overflows ? `${Math.min(100, (view.scrollTop / max) * 100)}%` : '0%';
  };

  view.addEventListener('scroll', update, { passive: true });
  // render() swaps innerHTML, so observe instead of hooking each render.
  new MutationObserver(update).observe(view, { childList: true, subtree: true });
  new ResizeObserver(update).observe(view);
  update();
}


const MIN_SIZE = { width: 380, height: 320 };


/* Windows draws a faint frame around see-through windows that have a native resize border, so resize here. */
function bindResize() {
  if (state.meta.platform !== 'win32') return;
  const grip = $('.resize-grip');
  if (grip) grip.remove();

  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const handle = document.createElement('div');
    handle.className = `rz rz-${edge}`;
    document.body.appendChild(handle);

    handle.addEventListener('pointerdown', async (down) => {
      down.preventDefault();
      handle.setPointerCapture(down.pointerId);
      const start = await api.getBounds();
      if (!start) return;
      let frame = 0;

      const move = (e) => {
        const dx = e.screenX - down.screenX;
        const dy = e.screenY - down.screenY;
        const next = { ...start };
        if (edge.includes('e')) next.width = start.width + dx;
        if (edge.includes('s')) next.height = start.height + dy;
        if (edge.includes('w')) { next.width = start.width - dx; next.x = start.x + dx; }
        if (edge.includes('n')) { next.height = start.height - dy; next.y = start.y + dy; }
        if (next.width < MIN_SIZE.width) { if (edge.includes('w')) next.x -= MIN_SIZE.width - next.width; next.width = MIN_SIZE.width; }
        if (next.height < MIN_SIZE.height) { if (edge.includes('n')) next.y -= MIN_SIZE.height - next.height; next.height = MIN_SIZE.height; }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => api.setBounds(next));
      };

      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
}


(async function init() {
  await boot();
  if (!state.settings.onboarded) startIntro();
  bindShell();
  bindKeys();
  watchWidth();
  bindResize();
  bindScrollIndicator();

  api.onShown(() => {
    $('#omni').focus();
    $('#omni').select();
    render();
  });

  api.onTab((id) => goTab(id));
  api.onToast(({ type, message }) => toast(message, type));
  api.onSettingsChanged((s) => { state.settings = s; applyAppearance(); if (tab === 'settings') render(); });
  api.onAlarm((payload) => showAlarmOverlay(payload));

  $('#omni').focus();
})();
