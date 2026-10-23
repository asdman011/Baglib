import { contextBridge, ipcRenderer } from 'electron';

const subscribe = (channel: string, callback: (payload: unknown) => void) => {
  const listener = (_: unknown, payload: unknown) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
};
contextBridge.exposeInMainWorld('electronAPI', { audio: { tts: {
  getVoices: () => ipcRenderer.invoke('live:voices'),
  getStatus: () => ipcRenderer.invoke('live:status'),
  loadVoice: (options: unknown) => ipcRenderer.invoke('live:voice', options),
  synthesize: (request: unknown) => ipcRenderer.invoke('live:synthesize', request),
  stop: (jobId: string) => ipcRenderer.invoke('live:stop', jobId),
  onChunk: (callback: (payload: unknown) => void) => subscribe('live:chunk', callback),
  onComplete: (callback: (payload: unknown) => void) => subscribe('live:complete', callback),
  onError: (callback: (payload: unknown) => void) => subscribe('live:error', callback),
} } });
contextBridge.exposeInMainWorld('liveReport', (result: unknown) => ipcRenderer.send('live:result', result));
