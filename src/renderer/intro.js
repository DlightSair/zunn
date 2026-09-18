/* Zunn first-run tour */

const keys = (combo) => combo.split('+').map((k) => `<span class="key">${esc(k.trim())}</span>`).join(' + ');

const SEARCH_PATH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4';


const SCENES = {
  projects: (label) => `<p>A code folder, a PDF, a book — anything you want one click away.</p>
    <span class="btn primary" data-part="add">${icon('plus')}${label}</span>`,
  apps: (label) => `<p>Add any program, shortcut or protocol link.</p>
    <span class="btn primary" data-part="add">${icon('plus')}${label}</span>`,
  links: (label) => `<p>Pin the pages you open every day.</p>
    <span class="btn primary" data-part="add">${icon('plus')}${label}</span>`,
  notes: () => `<div class="m-note">
      <div><b>Groceries</b><span>Milk, eggs, coffee</span></div>
      <span class="m-bell" data-part="bell">${icon('alarm')}</span>
    </div>`,
};


/* A dimmed miniature of the real window; only `hot` parts are lit and clickable. */
function mock({ tab, label, omni, hot, tips, hint }) {
  const tabs = TABS.map((t) =>
    `<span class="m-tab${t.id === tab ? ' sel' : ''}" data-part="tab-${t.id}">${icon(t.icon)}</span>`).join('');

  return `<div class="mock" data-hot="${hot.join(' ')}" data-tips="${esc(JSON.stringify(tips))}">
      <div class="m-title">
        <span class="m-ico" data-part="pin">${icon('pin')}</span>
        <span class="m-ico" data-part="help">${icon('help')}</span>
        <span class="m-ico" data-part="gear">${icon('gear')}</span>
        <span class="m-ico" data-part="close">${icon('close')}</span>
      </div>
      <div class="m-omni" data-part="omni">
        <svg viewBox="0 0 24 24"><path d="${SEARCH_PATH}"/></svg><span>${esc(omni || 'Search or type a URL')}</span>
      </div>
      <div class="m-tabs">${tabs}</div>
      <div class="m-view">${SCENES[tab](label)}</div>
    </div>
    <p class="intro-hint mock-tip">${esc(hint)}</p>`;
}


const INTRO_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Zunn',
    text: 'A quiet launcher for your projects, apps, links and notes. First, what should we call you?',
    demo: () => `<input id="intro-name" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Your name" value="${esc(state.settings.name || '')}" />`,
  },
  {
    id: 'projects',
    title: 'Projects',
    text: 'Keep the folders and files you work on one click away.',
    demo: () => mock({
      tab: 'projects',
      label: 'Add project',
      hot: ['tab-projects', 'add'],
      hint: 'Tap the highlighted parts. You can also drag a folder into the window.',
      tips: {
        'tab-projects': 'Your projects live on this tab.',
        add: 'Pick a folder or file, name it, and choose how it opens. Ctrl+N does the same.',
      },
    }),
  },
  {
    id: 'apps',
    title: 'Apps',
    text: 'Start typing an app name and pick it from your installed apps. Its icon comes with it.',
    demo: () => mock({
      tab: 'apps',
      label: 'Add app',
      hot: ['tab-apps', 'add'],
      hint: 'Tap the highlighted parts. You can also drop a program into the window.',
      tips: {
        'tab-apps': 'Programs and shortcuts live on this tab.',
        add: 'Search your installed apps by name, or paste a path.',
      },
    }),
  },
  {
    id: 'notes',
    title: 'Notes and alarms',
    text: 'Notes save as you type. Set an alarm on any note and Zunn comes forward when it goes off.',
    demo: () => mock({
      tab: 'notes',
      hot: ['tab-notes', 'bell'],
      hint: 'Tap the highlighted parts.',
      tips: {
        'tab-notes': 'Every note lives on this tab.',
        bell: 'The bell sets a date and time. It rings until you dismiss it.',
      },
    }),
  },
  {
    id: 'web',
    title: 'Web',
    text: 'Pin the pages you open every day. The search bar opens addresses, and shortcuts search one site.',
    demo: () => mock({
      tab: 'links',
      label: 'Add link',
      omni: '!yt lofi hip hop',
      hot: ['tab-links', 'omni'],
      hint: 'Tap the highlighted parts.',
      tips: {
        'tab-links': 'Pinned pages live on this tab.',
        omni: 'Type an address to open it. Start with !yt, !gh or !wiki to search a site.',
      },
    }),
  },
  {
    id: 'settings',
    title: 'Settings',
    text: 'Change the hotkey, theme, transparency and background whenever you like.',
    demo: () => mock({
      tab: 'projects',
      label: 'Add project',
      hot: ['gear', 'help'],
      hint: 'Tap the highlighted parts.',
      tips: {
        gear: 'Settings: hotkey, theme, transparency, background and more.',
        help: 'Help: every shortcut and feature in plain words.',
      },
    }),
  },
  {
    id: 'done',
    title: 'You are set',
    text: 'Zunn stays in your tray. Bring it up from anywhere with',
    demo: () => `<p class="intro-hint big">${keys(state.settings.hotkey || 'Alt+Space')}</p>`,
  },
];


let introEl = null;
let introIndex = 0;
let introName = '';


function startIntro() {
  if (introEl) return;
  introIndex = 0;
  introName = (state.settings.name || '').trim();
  introEl = document.createElement('div');
  introEl.className = 'intro';
  $('#shell').appendChild(introEl);
  document.addEventListener('keydown', introKeys, true);
  renderIntro();
}


function closeIntro() {
  document.removeEventListener('keydown', introKeys, true);
  if (introEl) introEl.remove();
  introEl = null;
  $('#omni').focus();
}


async function finishIntro() {
  captureName();
  closeIntro();
  await set({ onboarded: true, name: introName });
}


function captureName() {
  const input = $('#intro-name');
  if (input) introName = input.value.trim();
}


function goIntro(delta) {
  captureName();
  const next = introIndex + delta;
  if (next < 0) return;
  if (next >= INTRO_STEPS.length) return finishIntro();
  introIndex = next;
  renderIntro();
}


function lightMock() {
  const box = introEl.querySelector('.mock');
  if (!box) return;

  const hot = box.dataset.hot.split(' ');
  const tips = JSON.parse(box.dataset.tips);
  const tip = introEl.querySelector('.mock-tip');
  const original = tip.textContent;

  for (const part of box.querySelectorAll('[data-part]')) {
    const name = part.dataset.part;
    if (!hot.includes(name)) continue;
    part.classList.add('hot');
    part.addEventListener('click', () => {
      tip.textContent = tips[name] || original;
      tip.classList.add('lit');
      part.classList.remove('tapped');
      void part.offsetWidth;
      part.classList.add('tapped');
    });
  }
}


function renderIntro() {
  const step = INTRO_STEPS[introIndex];
  const last = introIndex === INTRO_STEPS.length - 1;
  const title = step.id === 'done' && introName ? `You are set, ${esc(introName)}` : esc(step.title);

  introEl.innerHTML = `
    <div class="intro-drag"></div>
    <div class="intro-body">
      <h1>${title}</h1>
      <p class="intro-text">${esc(step.text)}</p>
      <div class="intro-demo">${step.demo()}</div>
    </div>
    <div class="intro-foot">
      <div class="intro-dots">${INTRO_STEPS.map((_, i) => `<i class="${i === introIndex ? 'on' : ''}"></i>`).join('')}</div>
      <div class="intro-actions">
        ${last ? '' : '<button class="btn ghost" data-intro-skip>Skip</button>'}
        ${introIndex > 0 ? '<button class="btn ghost" data-intro-back>Back</button>' : ''}
        <button class="btn primary" data-intro-next>${last ? 'Get started' : 'Next'}</button>
      </div>
    </div>`;

  introEl.querySelector('[data-intro-next]').onclick = () => goIntro(1);
  const back = introEl.querySelector('[data-intro-back]');
  if (back) back.onclick = () => goIntro(-1);
  const skip = introEl.querySelector('[data-intro-skip]');
  if (skip) skip.onclick = finishIntro;

  lightMock();
  const input = $('#intro-name');
  if (input) input.focus();
}


function introKeys(e) {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); goIntro(1); }
  else if (e.key === 'ArrowRight' && !$('#intro-name')) goIntro(1);
  else if (e.key === 'ArrowLeft' && !$('#intro-name')) goIntro(-1);
}


document.addEventListener('click', (e) => {
  if (e.target.closest('[data-intro]')) startIntro();
});
