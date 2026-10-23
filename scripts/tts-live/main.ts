import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { PocketTTSProvider } from '../../src/main/services/audio/pocket-tts.provider';
import type { TTSProviderSynthesisRequest, TTSProviderVoiceOptions } from '../../src/shared/types/tts-provider';

app.setPath('userData', path.join(__dirname, 'profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const provider = new PocketTTSProvider();
let finishing = false;
let window: BrowserWindow;
async function finish(result: { ok: boolean; [key: string]: unknown }) {
  if (finishing) return;
  finishing = true;
  console.log(JSON.stringify({ event: 'live-result', ...result }));
  await provider.release();
  window?.destroy();
  app.exit(result.ok ? 0 : 1);
}
ipcMain.handle('live:voices', () => PocketTTSProvider.getVoices());
ipcMain.handle('live:status', () => provider.getStatus());
ipcMain.handle('live:voice', (_, options: TTSProviderVoiceOptions) => provider.loadVoice(options));
ipcMain.handle('live:stop', (_, jobId: string) => provider.stop(jobId));
ipcMain.handle('live:synthesize', (event, request: TTSProviderSynthesisRequest) => {
  void provider.synthesize(request, (chunk) => {
    if (!event.sender.isDestroyed()) event.sender.send('live:chunk', chunk);
  }).then(() => {
    if (!event.sender.isDestroyed()) event.sender.send('live:complete', { jobId: request.jobId });
  }).catch((error) => {
    if (!event.sender.isDestroyed()) event.sender.send('live:error', { jobId: request.jobId, message: String(error) });
  });
  return { jobId: request.jobId };
});
ipcMain.on('live:result', (_, result) => { void finish(result); });
void app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  window.webContents.setAudioMuted(true);
  window.webContents.on('render-process-gone', (_, details) => { void finish({ ok: false, reason: details.reason }); });
  await window.loadFile(path.join(__dirname, 'index.html'), { query: { rate: process.env.BAGLIB_TTS_TEST_RATE || '1', voice: process.env.BAGLIB_TTS_TEST_VOICE || 'pocket:alba', repeat: process.env.BAGLIB_TTS_TEST_REPEAT || '1' } });
  setTimeout(() => { void finish({ ok: false, reason: 'live narration exceeded 90 seconds' }); }, 90000);
});
