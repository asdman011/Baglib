import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setupDigitalIPC } from '../../src/main/ipc/digital';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { translations } from '../../src/renderer/translations';
import { Worker } from 'node:worker_threads';

const directory = process.env.BAGLIB_IMPORT_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const database = getDatabase();
  runMigrations(database, migrations);
  const repository = new SqliteWorkRepository(database);
  setupDigitalIPC();
  let refreshes = 0;
  ipcMain.handle('library:get-all-books', () => { refreshes++; return repository.getAllWorks(); });
  for (const channel of ['library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const books = path.join(directory, 'books');
  await fs.mkdir(books);
  for (let index = 0; index < 300; index++) await fs.writeFile(path.join(books, `${index % 2 ? 'كِتاب' : 'Book'} ${index}.txt`), `Unique content ${index} — معرفة`);
  const archiveWorker = new Worker(path.join(directory, 'worker.asar', 'metadata-worker.js'));
  try {
    const metadata = await new Promise<{ metadata?: { title?: string }; error?: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('ASAR worker timed out')), 10_000);
      archiveWorker.once('message', result => { clearTimeout(timeout); resolve(result); });
      archiveWorker.once('error', error => { clearTimeout(timeout); reject(error); });
      archiveWorker.postMessage({ filePath: path.join(books, 'Book 0.txt'), format: 'TXT' });
    });
    assert.ok(metadata.metadata?.title, metadata.error);
  } finally { await archiveWorker.terminate(); }
  const window = new BrowserWindow({ show: false, width: 1100, height: 850, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
  const errors: string[] = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  let network = 0;
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { network++; callback({ cancel: true }); });
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  const until = async (expression: string) => {
    const deadline = Date.now() + 60_000;
    while (!await evaluate(`Boolean(${expression})`)) {
      if (Date.now() > deadline) throw new Error(`Timed out: ${expression}; ${errors.join('\n')}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  const click = async (label: string) => evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}).click()`);
  await window.loadFile(path.join(directory, 'index.html'));
  await until('window.importTest');
  await evaluate(`window.importTest.setPaths([${JSON.stringify(books)}])`);
  await until(`document.querySelectorAll('button[title=${JSON.stringify(translations.ar.removeImportFile)}]').length === 100`);
  for (const language of ['ar', 'en'] as const) {
    if (language === 'en') await evaluate('window.importTest.workspace.toggleLanguage()');
    await until(`document.querySelector('[dir]').dir === '${language === 'ar' ? 'rtl' : 'ltr'}'`);
    for (const width of [480, 1100]) {
      window.setContentSize(width, 850);
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false);
      await fs.writeFile(path.join(directory, `${language}-${width}.png`), (await window.webContents.capturePage()).toPNG());
    }
  }
  const initialRefreshes = refreshes;
  await click(translations.en.scanDuplicatesBtn);
  await until(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === ${JSON.stringify(translations.en.startImportBtn)} && !button.disabled)`);
  await click(translations.en.startImportBtn);
  await until(`document.body.textContent.includes(${JSON.stringify(translations.en.importCompletedHeading)})`);
  await until('window.importTest.workspace.books.length === 300');
  assert.equal(repository.getDuplicateCandidates().length, 300);
  assert.equal(refreshes - initialRefreshes, 1);
  assert.equal(network, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedThroughElectronIPC: 300, libraryRefreshes: refreshes - initialRefreshes, languages: ['ar', 'en'], widths: [480, 1100], network, errors, screenshots: directory }));
  window.close();
  closeDatabase();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
