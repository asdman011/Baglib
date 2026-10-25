import { app, BrowserWindow, clipboard, dialog, ipcMain, session, utilityProcess } from 'electron';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { QuranLibraryService, type QuranInstaller } from '../services/quran/quran-library.service';
import { category, QUL_ORIGIN, validateSourceUrl } from '../services/quran/qul-catalog';
import type { QuranAPI, QuranError, QuranLibrary, QuranPack, QuranResult } from '../../shared/types/quran';
import { QuranReaderProcess } from '../services/quran/quran-reader-process';
import { presetResource, readerPreset, readerPresets } from '../services/quran/reader-resources';

const allowedDownloadOrigins = new Set([QUL_ORIGIN, 'https://s3.us-east-1.wasabisys.com']);

export const runQuranInstaller: QuranInstaller = (request, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new Error('cancelled')); return; }
  const child = utilityProcess.fork(path.join(__dirname, 'quran-worker.js'), [], { serviceName: 'Baglib Quran package validation', stdio: 'ignore', execArgv: ['--max-old-space-size=768'] });
  let done = false;
  const finish = (error?: Error, value?: QuranPack) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    child.kill();
    if (error) reject(error); else resolve(value!);
  };
  const abort = () => finish(new Error('cancelled'));
  const timer = setTimeout(() => finish(new Error('invalid-package')), 120_000);
  signal.addEventListener('abort', abort, { once: true });
  child.once('spawn', () => child.postMessage(request));
  child.once('message', (message: QuranResult<QuranPack>) => message.ok ? finish(undefined, message.data) : finish(new Error(message.error)));
  child.once('exit', () => finish(new Error('invalid-package')));
});

export function registerQuranIpc(): void {
  const reader = new QuranReaderProcess();
  let service: QuranLibraryService | undefined;
  let initializing: Promise<QuranLibraryService> | undefined;
  let settingUp = false;
  const windows = new Map<string, BrowserWindow>();
  const downloads = new Map<string, Electron.DownloadItem>();
  const changed = () => { for (const window of BrowserWindow.getAllWindows()) if (window.webContents.getURL().startsWith('file:') || window.webContents.getURL().startsWith('http://localhost:3000')) window.webContents.send('quran:changed'); };
  const fetchHtml = async (source: string) => {
    let response: Response;
    try { response = await session.fromPartition('baglib-qul').fetch(validateSourceUrl(source).href, { signal: AbortSignal.timeout(30_000), redirect: 'error' }); }
    catch { throw new Error('network'); }
    if (!response.ok || Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new Error('network');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('network');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error('network');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString('utf8');
  };
  const createService = async (root: string) => {
    const instance = new QuranLibraryService(root, fetchHtml, runQuranInstaller, changed);
    await instance.initialize();
    instance.store.saveResources(readerPresets.filter(preset => !instance.store.resource(preset.id)).map(preset => presetResource(preset.id)));
    return instance;
  };
  const getService = () => initializing ??= (async () => {
    let root = path.join(app.getPath('userData'), 'quran');
    try { const config = JSON.parse(await readFile(path.join(app.getPath('userData'), 'quran-location.json'), 'utf8')); if (typeof config.directory === 'string' && path.isAbsolute(config.directory)) root = config.directory; } catch {}
    service = await createService(root);
    return service;
  })().catch(error => { initializing = undefined; throw error; });
  const result = async <Value>(event: Electron.IpcMainInvokeEvent, action: () => Promise<Value>): Promise<QuranResult<Value>> => {
    try {
      const sender = event.sender.getURL();
      if (event.senderFrame !== event.sender.mainFrame || !(new URL(sender).protocol === 'file:' || new URL(sender).origin === 'http://localhost:3000')) throw new Error('unavailable');
      return { ok: true, data: await action() };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      const valid: QuranError[] = ['unavailable', 'network', 'invalid-resource', 'restricted', 'invalid-package', 'unsupported-format', 'storage', 'cancelled', 'interrupted', 'busy'];
      return { ok: false, error: valid.includes(message as QuranError) ? message as QuranError : 'storage' };
    }
  };
  const closeWindow = (id: string) => { const window = windows.get(id); if (window && !window.isDestroyed()) window.destroy(); windows.delete(id); };
  const readRequest = async <Value>(action: Parameters<QuranReaderProcess['request']>[2]) => {
    const instance = await getService();
    const latest = new Map<string, QuranPack>();
    for (const pack of instance.store.packs()) if (readerPreset(pack)) latest.set(pack.resource.id, pack);
    return reader.request<Value>(instance.root, [...latest.values()], action);
  };
  ipcMain.handle('quran:reader-catalog', event => result(event, () => readRequest({ action: 'catalog' })));
  ipcMain.handle('quran:copy', (event, text: string) => result(event, async () => {
    if (typeof text !== 'string' || !text.trim() || text.length > 200000) throw new Error('invalid-resource');
    clipboard.writeText(text);
    return null;
  }));
  ipcMain.handle('quran:read', (event, query) => result(event, async () => {
    if (!query || typeof query.script !== 'string' || ['translation', 'meanings', 'transliteration'].some(key => query[key] !== undefined && typeof query[key] !== 'string')) throw new Error('invalid-resource');
    return readRequest({ action: 'read', query });
  }));
  ipcMain.handle('quran:search-ayahs', (event, query) => result(event, async () => {
    if (!query || typeof query.script !== 'string' || typeof query.text !== 'string' || query.text.length > 200) throw new Error('invalid-resource');
    return readRequest({ action: 'search', query });
  }));
  ipcMain.handle('quran:commentary', (event, query) => result(event, async () => {
    if (!query || typeof query.script !== 'string' || typeof query.pack !== 'string') throw new Error('invalid-resource');
    return readRequest({ action: 'commentary', query });
  }));
  ipcMain.handle('quran:setup', (event, ids: string[]) => result(event, async () => {
    if (!Array.isArray(ids) || !ids.length || ids.length > readerPresets.length || ids.some(id => !readerPresets.some(preset => preset.id === id)) || new Set(ids).size !== ids.length) throw new Error('invalid-resource');
    const instance = await getService();
    if (instance.busy || settingUp) throw new Error('busy');
    settingUp = true;
    try {
    const selection = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const installed: string[] = [], missing: string[] = [], failed: string[] = [];
    for (const id of ids) {
      if (instance.store.packs().some(pack => readerPreset(pack)?.id === id)) { installed.push(id); continue; }
      const preset = readerPresets.find(value => value.id === id)!;
      let filename: string | undefined;
      for (const candidate of [path.join(selection.filePaths[0], preset.filename), path.join(selection.filePaths[0], preset.relative, preset.filename)]) {
        try { if ((await stat(candidate)).isFile()) { filename = candidate; break; } } catch {}
      }
      if (!filename) { missing.push(id); continue; }
      const job = instance.createJob(id);
      await instance.installFile(job, filename);
      const state = instance.store.jobs().find(value => value.id === job.id);
      if (state?.state === 'complete') installed.push(id); else failed.push(id);
    }
    return { installed, missing, failed };
    } finally { settingUp = false; }
  }));
  ipcMain.handle('quran:library', (event, query: Parameters<QuranAPI['library']>[0]) => result(event, async () => {
    if (query?.category) category(query.category);
    if (query?.view !== undefined && !['all', 'installed', 'downloads'].includes(query.view)) throw new Error('invalid-resource');
    if (query?.search !== undefined && (typeof query.search !== 'string' || query.search.length > 200)) throw new Error('invalid-resource');
    if (query?.offset !== undefined && (!Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 100000)) throw new Error('invalid-resource');
    return (await getService()).store.library(query) as QuranLibrary;
  }));
  ipcMain.handle('quran:refresh', (event, kind) => result(event, async () => { await (await getService()).refresh(category(kind)); return null; }));
  ipcMain.handle('quran:download', (event, id: string) => result(event, async () => {
    const instance = await getService();
    const { resource } = await instance.details(id);
    if (resource.restricted) throw new Error('restricted');
    const job = instance.createJob(id);
    const browser = new BrowserWindow({ width: 1050, height: 800, parent: BrowserWindow.fromWebContents(event.sender) || undefined, autoHideMenuBar: true, webPreferences: { partition: 'baglib-qul', sandbox: true, nodeIntegration: false, contextIsolation: true } });
    windows.set(job.id, browser);
    const browserContents = browser.webContents;
    const browserId = browserContents.id;
    const browserSession = browserContents.session;
    browser.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`${QUL_ORIGIN}/`)) void browser.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browser.webContents.on('will-navigate', (navigation, url) => {
      try {
        const target = new URL(url);
        if (target.origin !== QUL_ORIGIN || (target.pathname.startsWith('/resources/') && target.pathname !== resource.sourcePath && !new RegExp(`^/resources/${resource.category}/[a-f0-9]{32}/download$`).test(target.pathname))) navigation.preventDefault();
      } catch { navigation.preventDefault(); }
    });
    const download = (_downloadEvent: Electron.Event, item: Electron.DownloadItem, contents: Electron.WebContents) => {
      if (contents.id !== browserId) return;
      if (downloads.has(job.id)) { item.cancel(); return; }
      item.pause();
      const filename = path.join(instance.root, 'downloads', `${job.id}.download`);
      item.setSavePath(filename);
      downloads.set(job.id, item);
      const current = { ...job, state: 'downloading' as const };
      let lastUpdate = 0;
      item.on('updated', () => {
        current.received = item.getReceivedBytes();
        current.total = item.getTotalBytes();
        if (current.received > 128 * 1024 * 1024 || current.total > 128 * 1024 * 1024) { item.cancel(); instance.fail(current, 'invalid-package'); return; }
        if (Date.now() - lastUpdate > 250) { lastUpdate = Date.now(); instance.update(current); }
      });
      item.once('done', (_doneEvent, state) => {
        downloads.delete(job.id);
        browserSession.removeListener('will-download', download);
        if (state === 'completed') { void instance.installFile(current, filename); closeWindow(job.id); }
        else { instance.fail(current, state === 'cancelled' ? 'cancelled' : 'network'); void rm(filename, { force: true }); closeWindow(job.id); }
      });
      void instance.details(id).then(details => {
        const chain = item.getURLChain();
        if (details.resource.restricted || !chain.every(url => { const target = new URL(url); return target.protocol === 'https:' && allowedDownloadOrigins.has(target.origin); }) || !chain.some(url => { const target = new URL(url); return target.origin === QUL_ORIGIN && details.downloads.includes(target.pathname); })) throw new Error('invalid-resource');
        item.resume();
      }).catch(() => item.cancel());
    };
    browserSession.on('will-download', download);
    browser.once('closed', () => {
      windows.delete(job.id);
      if (!downloads.has(job.id)) {
        browserSession.removeListener('will-download', download);
        const latest = instance.store.jobs().find(value => value.id === job.id);
        if (latest?.state === 'awaiting-download') instance.cancel(job.id);
      }
    });
    try { await browser.loadURL(`${QUL_ORIGIN}${resource.sourcePath}`); }
    catch { if (!browser.isDestroyed()) { instance.fail(job, 'network'); closeWindow(job.id); } }
    return job.id;
  }));
  ipcMain.handle('quran:import', (event, id: string) => result(event, async () => {
    const instance = await getService();
    const resource = instance.store.resource(id);
    if (!resource) throw new Error('invalid-resource');
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'QUL', extensions: ['zip', 'db', 'sqlite', 'json', 'woff2', 'woff', 'ttf'] }] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const job = instance.createJob(id);
    void instance.installFile(job, selection.filePaths[0]);
    return job.id;
  }));
  ipcMain.handle('quran:cancel', (event, id: string) => result(event, async () => {
    const instance = await getService();
    instance.cancel(id);
    downloads.get(id)?.cancel();
    closeWindow(id);
    return null;
  }));
  ipcMain.handle('quran:remove', (event, id: string) => result(event, async () => { if (settingUp) throw new Error('busy'); reader.close(); await (await getService()).remove(id); return null; }));
  ipcMain.handle('quran:directory', event => result(event, async () => {
    const instance = await getService();
    if (instance.busy || settingUp) throw new Error('busy');
    const selection = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const directory = path.join(selection.filePaths[0], 'Baglib Quran');
    if (directory === instance.root) return null;
    const next = await createService(directory);
    reader.close();
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(path.join(app.getPath('userData'), 'quran-location.json'), JSON.stringify({ directory }));
    await instance.dispose();
    service = next;
    initializing = Promise.resolve(next);
    changed();
    return null;
  }));
  app.once('before-quit', () => {
    reader.close();
    for (const item of downloads.values()) item.cancel();
    for (const id of windows.keys()) closeWindow(id);
    void service?.dispose();
  });
}
