import { contextBridge, ipcRenderer } from 'electron';

export const API = {
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  openFileDialog: () => ipcRenderer.invoke('system:open-file-dialog'),
  readPdfBase64: (filePath: string) => ipcRenderer.invoke('system:read-pdf-base64', filePath),
  extractPdfText: (filePath: string) => ipcRenderer.invoke('system:extract-pdf-text', filePath),
  onNotification: (callback: (message: string) => void) => {
    const subscription = (_: any, value: string) => callback(value);
    ipcRenderer.on('system:notification', subscription);
    return () => ipcRenderer.removeListener('system:notification', subscription);
  },
};

contextBridge.exposeInMainWorld('electronAPI', API);

export type ElectronAPI = typeof API;
