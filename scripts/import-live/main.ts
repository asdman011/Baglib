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
import { BackgroundMetadataService } from '../../src/main/services/digital/background-metadata.service';
import { zipSync, strToU8 } from 'fflate';

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
  const cover = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lQAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(900 * 1024)]);
  await fs.writeFile(path.join(books, 'Large Collection.epub'), zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
    'content.opf': strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Embedded Large Collection</dc:title><dc:creator>Jane Austen</dc:creator><meta name="cover" content="cover-image"/></metadata><manifest><item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine/></package>'),
    'cover.png': cover,
    'padding.bin': new Uint8Array(65 * 1024 * 1024),
  }, { level: 0 }));
  const processFixture = path.join(directory, 'process-fixture.cjs');
  await fs.writeFile(processFixture, "process.parentPort.on('message', event => { if(event.data.filePath.includes('Book 0')) process.exit(23); process.parentPort.postMessage({metadata:{title:String(process.pid),authors:[],tags:[],identifiers:{},format:'TXT'}}); });");
  const isolated = new BackgroundMetadataService(processFixture, 10_000);
  try {
    await assert.rejects(isolated.extract(path.join(books, 'Book 0.txt')), /exited/);
    const recovered = await isolated.extract(path.join(books, 'Book 2.txt'));
    assert.ok(Number(recovered.title) > 0);
    assert.notEqual(Number(recovered.title), process.pid);
  } finally { isolated.dispose(); }
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
  const archiveExtractor = new BackgroundMetadataService(path.join(directory, 'worker.asar', 'metadata-worker.js'));
  try { assert.ok((await archiveExtractor.extract(path.join(books, 'Book 0.txt'))).title); }
  finally { archiveExtractor.dispose(); }
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
  await until(`document.body.textContent.includes(${JSON.stringify(translations.en.importCompletedHeading)})`);
  await until('window.importTest.workspace.books.length === 301');
  assert.equal(repository.getDuplicateCandidates().length, 301);
  const largeBook = repository.getAllWorks().find(book => book.title === 'Embedded Large Collection');
  assert.ok(largeBook?.coverImage);
  assert.deepEqual(await fs.readFile(largeBook.coverImage), cover);
  assert.equal(refreshes - initialRefreshes, 1);
  assert.equal(network, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ importedThroughElectronIPC: 301, oversizedBookMetadata: largeBook.title, fullCoverBytes: cover.length, isolatedParserCrashRecovered: true, utilityProcessAsar: true, libraryRefreshes: refreshes - initialRefreshes, languages: ['ar', 'en'], widths: [480, 1100], network, errors, screenshots: directory }));
  window.close();
  closeDatabase();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
