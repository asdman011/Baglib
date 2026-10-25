import { app, BrowserWindow, clipboard, dialog, ipcMain, session, utilityProcess } from 'electron';
import { mkdir, readFile, writeFile, rm, stat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { QuranLibraryService, type QuranInstaller } from '../services/quran/quran-library.service';
import { category, QUL_ORIGIN, validateSourceUrl } from '../services/quran/qul-catalog';
import type { QuranAPI, QuranAyahAudio, QuranAyahTheme, QuranError, QuranLibrary, QuranPack, QuranResult, QuranSimilarAyah, QuranSurahIntro, QuranTopic } from '../../shared/types/quran';
import { QuranReaderProcess } from '../services/quran/quran-reader-process';
import { canonicalResourceId, presetResource, readerPreset, readerPresets } from '../services/quran/reader-resources';
import { downloadToFile, selectedExport } from '../services/quran/resource-download';
import { electronDownloadFetch } from '../services/quran/electron-download-fetch';

const allowedDownloadOrigins = new Set([QUL_ORIGIN, 'https://s3.us-east-1.wasabisys.com']);
const allowedAudioOrigins = new Set(['https://audio-cdn.tarteel.ai', QUL_ORIGIN, 'https://s3.us-east-1.wasabisys.com']);

const getAudioFilePath = (root: string, packId: string, surah: number, ayah: number) => {
  const padSurah = String(surah).padStart(3, '0');
  const padAyah = String(ayah).padStart(3, '0');
  return path.join(root, 'audio', packId, `${padSurah}_${padAyah}.mp3`);
};

const cacheSingleAudioFile = async (root: string, packId: string, surah: number, ayah: number, audioUrl: string, signal = new AbortController().signal): Promise<string> => {
  if (!/^[a-f0-9-]{36}$/.test(packId)) throw new Error('invalid-resource');
  const targetFile = getAudioFilePath(root, packId, surah, ayah);
  try {
    const s = await stat(targetFile);
    if (s.isFile() && s.size > 1000) {
      return `baglib-asset://${targetFile.replace(/\\/g, '/')}`;
    }
  } catch {}

  const url = new URL(audioUrl);
  if (!allowedAudioOrigins.has(url.origin) || url.protocol !== 'https:') {
    throw new Error('invalid-resource');
  }

  const dir = path.dirname(targetFile);
  await mkdir(dir, { recursive: true });
  const tempFile = path.join(dir, `${randomUUID()}.tmp`);

  try {
    await downloadToFile({ url: audioUrl, filename: tempFile, fetcher: electronDownloadFetch(session.defaultSession, 30 * 1024 * 1024), origins: allowedAudioOrigins, signal, limit: 30 * 1024 * 1024 });
    if ((await stat(tempFile)).size < 1000) throw new Error('invalid-package');
    await rename(tempFile, targetFile);
    return `baglib-asset://${targetFile.replace(/\\/g, '/')}`;
  } catch (err) {
    await rm(tempFile, { force: true }).catch(() => {});
    throw err;
  }
};

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
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = undefined;
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed() && (window.webContents.getURL().startsWith('file:') || window.webContents.getURL().startsWith('http://localhost:3000'))) window.webContents.send('quran:changed');
    }, 250);
  };
  const fetchHtml = async (source: string, signal?: AbortSignal) => {
    let response: Response;
    try { response = await session.fromPartition('baglib-qul').fetch(validateSourceUrl(source).href, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000), redirect: 'error' }); }
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
    for (const preset of readerPresets) for (const alias of preset.aliases || []) instance.store.removeResource(alias);
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
    for (const pack of instance.store.packs()) if (readerPreset(pack)) latest.set(canonicalResourceId(pack.resource.id), pack);
    return reader.request<Value>(instance.root, [...latest.values()], action);
  };
  ipcMain.handle('quran:reader-catalog', event => result(event, () => readRequest({ action: 'catalog' })));
  ipcMain.handle('quran:sign-in', event => result(event, async () => {
    const browser = new BrowserWindow({ width: 1000, height: 800, parent: BrowserWindow.fromWebContents(event.sender) || undefined, autoHideMenuBar: true, webPreferences: { partition: 'baglib-qul', sandbox: true, nodeIntegration: false, contextIsolation: true } });
    const key = `sign-in-${randomUUID()}`;
    windows.set(key, browser);
    browser.once('closed', () => windows.delete(key));
    browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    browser.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browser.webContents.on('will-navigate', (navigation, url) => { try { if (new URL(url).origin !== QUL_ORIGIN) navigation.preventDefault(); } catch { navigation.preventDefault(); } });
    await browser.loadURL(`${QUL_ORIGIN}/users/sign_in`);
    return null;
  }));
  ipcMain.handle('quran:inspect-ayah', (event, query) => result(event, async () => {
    if (!query || typeof query.script !== 'string' || (query.layout !== undefined && typeof query.layout !== 'string') || !Number.isInteger(query.surah) || !Number.isInteger(query.ayah)) throw new Error('invalid-resource');
    return readRequest({ action: 'inspect-ayah', query });
  }));
  ipcMain.handle('quran:download-batch', (event, ids: string[]) => result(event, async () => {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('invalid-resource');
    ids = ids.map(canonicalResourceId);
    const instance = await getService();
    if (settingUp) throw new Error('busy');
    return instance.enqueue(ids, async (job, signal) => {
      const resource = instance.store.resource(job.resourceId)!;
      const url = selectedExport(await fetchHtml(resource.sourcePath, signal), resource);
      const filename = path.join(instance.root, 'downloads', `${job.id}.download`);
      await downloadToFile({ url, filename, fetcher: electronDownloadFetch(session.fromPartition('baglib-qul')), origins: allowedDownloadOrigins, signal, limit: 128 * 1024 * 1024, progress: (received, total) => instance.update({ ...job, state: 'downloading', received, total }) });
      return filename;
    });
  }));
  ipcMain.handle('quran:download-recitation', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || (query.surah !== undefined && (!Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114))) throw new Error('invalid-resource');
    const instance = await getService();
    if (settingUp) throw new Error('busy');
    const pack = instance.store.packs().find(pack => pack.id === query.pack && readerPreset(pack)?.kind === 'recitation');
    if (!pack) throw new Error('invalid-resource');
    const active = instance.store.jobs().find(job => job.resourceId === pack.resource.id && ['queued', 'downloading', 'installing', 'awaiting-download'].includes(job.state));
    if (active) {
      if (active.recitation && active.recitation.pack === query.pack && active.recitation.surah === query.surah) return active.id;
      throw new Error('busy');
    }
    const jobIds = instance.enqueue([pack.resource.id], async (job, signal) => {
      const surahs: number[] = query.surah ? [query.surah] : Array.from({ length: 114 }, (_, index) => index + 1);
      const recordings: QuranAyahAudio[] = [];
      for (const surah of surahs) {
        signal.throwIfAborted();
        recordings.push(...await readRequest<QuranAyahAudio[]>({ action: 'recitation-surah', pack: query.pack, surah }));
      }
      let completed = 0;
      for (const recording of recordings) {
        signal.throwIfAborted();
        await cacheSingleAudioFile(instance.root, query.pack, recording.surah, recording.ayah, recording.audioUrl, signal);
        instance.update({ ...job, state: 'downloading', progressUnit: 'files', received: ++completed, total: recordings.length });
      }
      return null;
    }, false);
    if (!jobIds[0]) throw new Error('busy');
    const job = instance.store.jobs().find(job => job.id === jobIds[0])!;
    instance.update({ ...job, progressUnit: 'files', recitation: { pack: query.pack, surah: query.surah } });
    return jobIds[0];
  }));
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
  ipcMain.handle('quran:mushaf-page', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.page) || query.page < 1 || query.page > 604) throw new Error('invalid-resource');
    return readRequest({ action: 'mushaf-page', pack: query.pack, page: query.page });
  }));
  ipcMain.handle('quran:mushaf-page-for-ayah', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300) throw new Error('invalid-resource');
    return readRequest({ action: 'mushaf-page-for-ayah', pack: query.pack, surah: query.surah, ayah: query.ayah });
  }));
  ipcMain.handle('quran:recitation-audio', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300) throw new Error('invalid-resource');
    const instance = await getService();
    const ayahAudio = await readRequest<QuranAyahAudio>({ action: 'recitation-audio', pack: query.pack, surah: query.surah, ayah: query.ayah });
    const localPath = getAudioFilePath(instance.root, query.pack, query.surah, query.ayah);
    try {
      const s = await stat(localPath);
      if (s.isFile() && s.size > 1000) {
        ayahAudio.localUrl = `baglib-asset://${localPath.replace(/\\/g, '/')}`;
        ayahAudio.cached = true;
      }
    } catch {}
    return ayahAudio;
  }));
  ipcMain.handle('quran:recitation-surah', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114) throw new Error('invalid-resource');
    const instance = await getService();
    const list = await readRequest<QuranAyahAudio[]>({ action: 'recitation-surah', pack: query.pack, surah: query.surah });
    for (const item of list) {
      const localPath = getAudioFilePath(instance.root, query.pack, query.surah, item.ayah);
      try {
        const s = await stat(localPath);
        if (s.isFile() && s.size > 1000) {
          item.localUrl = `baglib-asset://${localPath.replace(/\\/g, '/')}`;
          item.cached = true;
        }
      } catch {}
    }
    return list;
  }));
  ipcMain.handle('quran:cache-audio', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300 || typeof query.audioUrl !== 'string') throw new Error('invalid-resource');
    const instance = await getService();
    const localUrl = await cacheSingleAudioFile(instance.root, query.pack, query.surah, query.ayah, query.audioUrl);
    return { localUrl };
  }));
  ipcMain.handle('quran:surah-audio-status', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114) throw new Error('invalid-resource');
    const instance = await getService();
    const list = await readRequest<QuranAyahAudio[]>({ action: 'recitation-surah', pack: query.pack, surah: query.surah });
    let cachedCount = 0;
    for (const item of list) {
      const localPath = getAudioFilePath(instance.root, query.pack, query.surah, item.ayah);
      try {
        const s = await stat(localPath);
        if (s.isFile() && s.size > 1000) cachedCount++;
      } catch {}
    }
    return { cachedCount, totalCount: list.length, isComplete: cachedCount === list.length && list.length > 0 };
  }));
  ipcMain.handle('quran:download-surah-audio', (event, query) => result(event, async () => {
    if (!query || typeof query.pack !== 'string' || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114) throw new Error('invalid-resource');
    const instance = await getService();
    const list = await readRequest<QuranAyahAudio[]>({ action: 'recitation-surah', pack: query.pack, surah: query.surah });
    let completed = 0;
    for (const item of list) {
      try {
        await cacheSingleAudioFile(instance.root, query.pack, query.surah, item.ayah, item.audioUrl);
        completed++;
      } catch {}
    }
    return { completed, total: list.length };
  }));
  ipcMain.handle('quran:surah-intro', (event, query) => result(event, async () => {
    if (!query || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || (query.pack !== undefined && typeof query.pack !== 'string')) throw new Error('invalid-resource');
    return readRequest<QuranSurahIntro | null>({ action: 'surah-intro', pack: query.pack, surah: query.surah });
  }));
  ipcMain.handle('quran:ayah-themes', (event, query) => result(event, async () => {
    if (!query || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || (query.ayah !== undefined && (!Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300)) || (query.pack !== undefined && typeof query.pack !== 'string')) throw new Error('invalid-resource');
    return readRequest<QuranAyahTheme[]>({ action: 'ayah-themes', pack: query.pack, surah: query.surah, ayah: query.ayah });
  }));
  ipcMain.handle('quran:ayah-topics', (event, query) => result(event, async () => {
    if (!query || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300 || (query.pack !== undefined && typeof query.pack !== 'string')) throw new Error('invalid-resource');
    return readRequest<QuranTopic[]>({ action: 'ayah-topics', pack: query.pack, surah: query.surah, ayah: query.ayah });
  }));
  ipcMain.handle('quran:search-topics', (event, query) => result(event, async () => {
    if (!query || typeof query.text !== 'string' || query.text.length > 200 || (query.pack !== undefined && typeof query.pack !== 'string')) throw new Error('invalid-resource');
    return readRequest<QuranTopic[]>({ action: 'search-topics', pack: query.pack, text: query.text });
  }));
  ipcMain.handle('quran:similar-ayahs', (event, query) => result(event, async () => {
    if (!query || !Number.isInteger(query.surah) || query.surah < 1 || query.surah > 114 || !Number.isInteger(query.ayah) || query.ayah < 1 || query.ayah > 300 || (query.pack !== undefined && typeof query.pack !== 'string')) throw new Error('invalid-resource');
    return readRequest<QuranSimilarAyah[]>({ action: 'similar-ayahs', pack: query.pack, surah: query.surah, ayah: query.ayah });
  }));
  ipcMain.handle('quran:setup', (event, ids: string[]) => result(event, async () => {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('invalid-resource');
    ids = [...new Set(ids.map(canonicalResourceId))];
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
    if (typeof id !== 'string') throw new Error('invalid-resource');
    id = canonicalResourceId(id);
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
    if (typeof id !== 'string') throw new Error('invalid-resource');
    id = canonicalResourceId(id);
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
    clearTimeout(changeTimer);
    reader.close();
    for (const item of downloads.values()) item.cancel();
    for (const id of windows.keys()) closeWindow(id);
    void service?.dispose();
  });
}
