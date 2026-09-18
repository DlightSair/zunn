const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);


const on = (channel, fn) => {
  const handler = (_e, data) => fn(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};


contextBridge.exposeInMainWorld('nexus', {
  getState: () => invoke('state:get'),
  setSettings: (patch) => invoke('settings:set', patch),

  saveItem: (collection, item) => invoke('items:save', { collection, item }),
  deleteItem: (collection, id) => invoke('items:delete', { collection, id }),
  reorder: (collection, ids) => invoke('items:reorder', { collection, ids }),

  openProject: (id, action) => invoke('project:open', { id, action }),
  launchApp: (id) => invoke('app:launch', id),
  openLink: (id) => invoke('link:open', id),
  openWeb: (input) => invoke('web:open', input),
  reveal: (target) => invoke('shell:reveal', target),
  gitInfo: (dir) => invoke('git:info', dir),
  pathKind: (p) => invoke('path:kind', p),
  pathExists: (p) => invoke('path:exists', p),

  pickFolder: () => invoke('dialog:pickFolder'),
  pickFile: (kind) => invoke('dialog:pickFile', kind),
  listInstalledApps: () => invoke('apps:installed'),
  fileIcon: (target) => invoke('icon:get', target),
  // Electron no longer exposes File.path in the renderer; use this lookup.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },

  getBackground: () => invoke('bg:get'),
  chooseBackground: () => invoke('bg:choose'),
  clearBackground: () => invoke('bg:clear'),

  exportData: () => invoke('data:export'),
  importData: () => invoke('data:import'),
  revealData: () => invoke('data:reveal'),
  ackAlarm: (id) => invoke('alarm:ack', id),

  hide: () => invoke('win:hide'),
  minimize: () => invoke('win:minimize'),
  center: () => invoke('win:center'),
  getBounds: () => invoke('win:bounds'),
  setBounds: (b) => invoke('win:setBounds', b),
  resizeTo: (width, height) => invoke('win:resizeTo', { width, height }),
  quit: () => invoke('app:quit'),
  restart: () => invoke('app:restart'),

  onShown: (fn) => on('window:shown', fn),
  onTab: (fn) => on('nav:tab', fn),
  onToast: (fn) => on('toast', fn),
  onSettingsChanged: (fn) => on('settings:changed', fn),
  onAlarm: (fn) => on('alarm:fire', fn),
});
