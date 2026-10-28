import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('dashboardLive', {
  call: (action: string, input?: unknown) => ipcRenderer.invoke('dashboard-live', action, input),
  onAlert: (callback: (value: unknown) => void) => { const fn = (_: unknown, value: unknown) => callback(value); ipcRenderer.on('live-alert', fn); return () => ipcRenderer.removeListener('live-alert', fn); },
});
