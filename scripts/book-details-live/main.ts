import { app, BrowserWindow, ipcMain, nativeImage, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../tests/helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { LibgenProvider } from '../../src/main/services/metadata/libgen.provider';

const directory = process.env.BAGLIB_BOOK_DETAILS_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const database = createTestDatabase();
  const repository = new SqliteWorkRepository(database);
  for (const volume of [1, 2]) repository.addBook({ id: `volume-${volume}`, title: 'تاريخ العالم • World history', author: 'مؤلف • Author', workType: 'book', seriesTitle: 'تاريخ العالم', volumeNumber: String(volume), totalVolumes: 3, bookType: 'physical', readingProgress: volume * 10 });
  const provider = new LibgenProvider();
  provider.getActiveMirror = async () => 'https://libgen.li';
  provider.fetchJson = async () => null;
  const html = await fs.readFile('tests/fixtures/libgen-cover-search.html', 'utf8');
  const originalFetch = globalThis.fetch;
  let searchUrl = '';
  globalThis.fetch = async request => { searchUrl = String(request); return new Response(html); };
  ipcMain.handle('library:search-libgen', (_event, query: string) => provider.search(query));
  ipcMain.handle('library:get-all-books', () => repository.getAllWorks());
  ipcMain.handle('library:add-book', (_event, book) => repository.addBook(book));
  ipcMain.handle('library:update-book', (_event, book) => { repository.updateBook(book); return repository.getById(book.id); });
  for (const channel of ['library:get-all-notes', 'categories:get-tree', 'tags:get-all', 'physical:get-locations', 'lending:get-borrowers']) ipcMain.handle(channel, () => []);
  const cover = nativeImage.createFromBitmap(Buffer.alloc(80 * 120 * 4, 170), { width: 80, height: 120 }).toPNG();
  let imageRequests = 0;
  await session.defaultSession.protocol.handle('https', request => {
    imageRequests++;
    return request.url.includes('3396318') ? new Response(cover, { headers: { 'content-type': 'image/png' } }) : new Response('Unavailable', { status: 404 });
  });
  const owner = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors: string[] = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = async <Value = unknown>(code: string): Promise<Value> => {
    try { return await owner.webContents.executeJavaScript(code); }
    catch (cause) { throw new Error(`${code}: ${String(cause)}`); }
  };
  const until = async (code: string) => { for (let count = 0; count < 120; count++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 80)); } throw new Error(`Timed out: ${code}`); };
  try {
    await owner.loadFile(path.join(directory, 'index.html'));
    await until("Boolean(window.bookTest && document.querySelector('[data-book-volumes]'))");
    await evaluate("window.bookTest.open(window.bookTest.workspace.books.find(book=>book.id==='volume-1'))");
    await until("window.bookTest.book?.id==='volume-1'");
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.bookTest.workspace.lang!==${JSON.stringify(language)})window.bookTest.workspace.toggleLanguage()`);
      for (const width of [480, 1280]) {
        owner.setContentSize(width, 1000);
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.ok(await evaluate("(()=>{const panel=document.querySelector('[data-book-volumes]');return panel.scrollWidth<=panel.clientWidth+1;})()"));
        const size = await evaluate<{ width: number; height: number }>("(()=>{const button=document.querySelector('button[aria-label='+JSON.stringify(window.bookTest.workspace.t('geekDetailsBtn'))+']');const rect=button.getBoundingClientRect();return {width:rect.width,height:rect.height};})()");
        assert.ok(size.width <= 29 && size.height <= 29);
      }
      for (const theme of ['dark', 'light']) {
        await evaluate("document.querySelector('[data-book-volumes]').scrollIntoView({block:'center'})");
        await evaluate(`if(window.bookTest.workspace.theme!==${JSON.stringify(theme)})window.bookTest.workspace.toggleTheme()`);
        await new Promise(resolve => setTimeout(resolve, 350));
        assert.equal(await evaluate("window.bookTest.workspace.theme"), theme);
        owner.setFullScreen(true);
        await new Promise(resolve => setTimeout(resolve, 300));
        owner.setFullScreen(false);
        await new Promise(resolve => setTimeout(resolve, 300));
        const capture = await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        await fs.writeFile(path.join(directory, `details-${language}-${theme}.png`), capture.toPNG());
      }
    }
    await evaluate("document.querySelector('[data-book-volumes] button:not([disabled])').click()");
    await until("window.bookTest.book?.id==='volume-2'");
    await evaluate("[...document.querySelector('[data-book-volumes]').querySelectorAll('button')].find(button=>button.textContent.trim()===window.bookTest.workspace.t('bookVolumeAdd')).click()");
    await until("window.bookTest.create && window.bookTest.book?.volumeNumber==='3'");
    assert.equal(await evaluate("Boolean(window.bookTest.book.filePath||window.bookTest.book.isbn||window.bookTest.book.coverImage)"), false);
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.bookTest.workspace.t('addToLibrary')).click()");
    await until("window.electronAPI.getAllBooks().then(books=>books.length===3)");
    assert.equal(repository.getAllWorks().length, 3);
    assert.equal(repository.getById('volume-1')?.readingProgress, 10);
    await evaluate("window.bookTest.setHub(true)");
    await until("Boolean(document.querySelector('form input'))");
    await evaluate("(()=>{const input=document.querySelector('form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'pride and prejudice');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await evaluate("document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await until("document.querySelectorAll('[data-book-cover]').length===2");
    await until("Boolean(document.querySelector('[data-book-cover] img')?.naturalWidth)");
    await until("document.querySelectorAll('[data-book-cover] img').length===1");
    assert.ok(imageRequests >= 2);
    assert.equal(new URL(searchUrl).searchParams.get('covers'), 'on');
    assert.equal(await evaluate("document.querySelectorAll('[data-book-cover] svg').length"), 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ directory, volumes: 3, independentProgress: true, compactGeekButton: '28px', languages: ['ar', 'en'], widths: [480, 1280], controlledCoverLoadAndFailure: true, jsonUnavailableFallback: true, errors }));
  } finally { if (errors.length) console.error(JSON.stringify({ errors })); globalThis.fetch = originalFetch; owner.destroy(); database.close(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
