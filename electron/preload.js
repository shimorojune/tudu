const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onCheckinRequest: (callback) => {
    ipcRenderer.on('checkin-request', (_event, data) => callback(data));
  },
  onEmergeFromEnvelope: (callback) => {
    ipcRenderer.on('emerge-from-envelope', () => callback());
  },
  onPrepareEmerge: (callback) => {
    ipcRenderer.on('prepare-emerge', () => callback());
  },
  onJiraSyncRequest: (callback) => {
    ipcRenderer.on('jira-sync-request', () => callback());
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback());
  },
  signalDeliveryComplete: () => ipcRenderer.send('delivery-complete'),
  applyCheckinInterval: (minutes) => ipcRenderer.invoke('apply-checkin-interval', minutes),
});
