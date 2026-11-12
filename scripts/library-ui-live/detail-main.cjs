const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { pageCountLabel, formatLibraryNumber } = require('../../src/renderer/utils/book-count.ts');
const checkLocalization = process.env.BAGLIB_LIBRARY_I18N === '1';
const profile = process.env.BAGLIB_KEY300_DIR;
const evidence = process.env.BAGLIB_KEY300_EVIDENCE;
const files = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json'))).filter(file => file.kind === 'pdf');
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], errors = [], windows = [];
app.on('browser-window-created', (_, win) => {
  windows.push(win.id);
  if (windows.length > 1) throw new Error('Only one Electron window permitted');
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  win.webContents.on('console-message', (_, level, message) => {
    if (level >= 3) errors.push(message);
    if (/Fast Refresh|full reload/.test(message)) console.log('HMR', message);
  });
  const until = async (code, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(100);
    }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-5000)'));
  };
  const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const button = label => evaluate('(()=>{const b=[...document.querySelectorAll("button,[role=menuitem]")].reverse().find(e=>e.getClientRects().length&&!e.disabled&&(e.textContent.trim()===' + JSON.stringify(label) + '||e.getAttribute("aria-label")===' + JSON.stringify(label) + '));if(!b)throw new Error("Missing button "+' + JSON.stringify(label) + ');b.focus();b.click();})()');
  const key = async (keyCode, modifiers = []) => {
    win.show(); win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(80);
  };
  const shot = async name => {
    if (name.endsWith('-detail')) await evaluate('document.querySelector("[data-book-detail-overview]").parentElement.scrollTop=0');
    await pause(250);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const save = () => fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, errors, windows }, null, 2));
  const trap = async () => {
    await evaluate('window.panel=[...document.querySelectorAll("[data-ui-dialog]")].at(-1);window.controls=()=>[...window.panel.querySelectorAll("button,input,select,textarea,a[href],[tabindex]")].filter(e=>e.tabIndex>=0&&!e.disabled&&e.getClientRects().length);window.controls().at(-1).focus()');
    await key('Tab');
    assert.equal(await evaluate('document.activeElement===window.controls()[0]'), true, 'Forward wrap ' + await evaluate('JSON.stringify({active:document.activeElement.outerHTML.slice(0,300),first:window.controls()[0]?.outerHTML.slice(0,300),last:window.controls().at(-1)?.outerHTML.slice(0,300)})'));
    await key('Tab', ['shift']);
    assert.equal(await evaluate('document.activeElement===window.controls().at(-1)'), true, 'Reverse wrap');
    await evaluate('document.querySelector("[data-nav-item=library]").focus()');
    assert.equal(await evaluate('window.panel.contains(document.activeElement)'), true, 'External focus containment');
    assert.equal(await evaluate('window.panel.scrollWidth<=window.panel.clientWidth+1'), true, 'Panel fits');
  };
  (async () => {
    win.setMinimumSize(320, 400); win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await evaluate('(async()=>{for(const book of await window.electronAPI.getAllBooks()){await window.electronAPI.deleteBook(book.id);await window.electronAPI.permanentlyDeleteBook(book.id);}await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="/vendor/pdfjs/pdf.cover.min.js";script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});})()');
    const books = [];
    for (const language of ['ar', 'en']) {
      const file = files.find(item => item.lang === language);
      assert.ok(file, 'Real text-layer PDF ' + language);
      const book = { id: 'detail-' + language, title: path.basename(file.filename, '.pdf'), author: language === 'ar' ? 'عبد الله عزام' : 'Brian Boyd', bookType: 'digital', digitalFormat: 'PDF', filePath: file.filename, categories: [], tags: [], lendingHistory: [], edition: language === 'ar' ? 'الطبعة الأولى' : 'First edition', publisher: 'Publisher · الناشر', readingStatus: 'reading', readingProgress: 42 };
      // Render the real first page in this same renderer, avoiding a second cover window.
      const cover = await evaluate(`(async()=>{const p=window.baglibCoverPdfjs;p.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';const base=await window.electronAPI.readPdfBase64(${JSON.stringify(file.filename)});const pdf=await p.getDocument({data:Uint8Array.from(atob(base),c=>c.charCodeAt(0))}).promise;const page=await pdf.getPage(1);const viewport=page.getViewport({scale:0.5});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const result={url:canvas.toDataURL(),pages:pdf.numPages};await pdf.destroy();return result;})()`);
      book.coverImage = cover.url; book.pagesCount = cover.pages;
      await evaluate('window.electronAPI.addBook(' + JSON.stringify(book) + ')');
      await evaluate('window.electronAPI.knowledge.save(' + JSON.stringify({ workId: book.id, knowledgeType: 'note', location: '1', noteContent: 'ملاحظة Note' }) + ')');
      await evaluate('window.electronAPI.knowledgeCards.save(' + JSON.stringify({ workId: book.id, sourceKind: 'book', sourceRef: 'book:' + book.id, front: 'سؤال Question', back: 'جواب Answer' }) + ')');
      books.push(book);
    }
    const Database = require('better-sqlite3');
    const db = new Database(path.join(profile, 'data', 'baglib.db'));
    for (const book of books) {
      db.prepare('INSERT INTO edition (id,work_id,label,publisher) VALUES (?,?,?,?)').run(book.id + '-second', book.id, 'الثانية · Second', 'الناشر Publisher');
      db.prepare('INSERT INTO source (id,edition_id,source_type,status) VALUES (?,?,?,?)').run(book.id + '-physical', book.id + '-second', 'physical', 'available');
      db.prepare('INSERT INTO physical_source_detail (source_id,shelf,room) VALUES (?,?,?)').run(book.id + '-physical', 'A2', 'غرفة الدراسة Study');
    }
    db.close();
    // Local deterministic metadata candidates exercise UI review without external traffic.
    const replace = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
    if (checkLocalization) replace('library:search-libgen', () => [{ id: 'local-i18n-result', title: 'عِلْم Knowledge', author: 'مؤلف Author', publisher: 'ناشر Publisher', pages: '3', format: 'PDF', detailUrl: 'https://example.invalid/book' }]);
    replace('library:lookup-metadata', (_, params) => {
      const work = { workId: 'test-first', title: params.title, authors: [params.author], editions: [{ editionId: 'candidate', title: params.title, publisher: 'ناشر مقترح Proposed publisher', sources: [{ provider: 'Open Library' }] }] };
      return { success: true, match: work, candidates: [work, { ...work, workId: 'test-second', firstPublishYear: 2025 }], evaluations: [] };
    });
    replace('enrichment:find-online-editions', (_, input) => ({ candidates: [{ id: 'local-candidate', providerId: 'test', providerName: 'Open Library', title: input.book.title, authors: [input.book.author], publisher: 'ناشر مقترح Proposed publisher', matchConfidence: 0.9 }] }));
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      const text = translations[language], prefix = language + '-' + theme + '-' + width;
      console.log('CASE', prefix);
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(theme) + ')');
      win.setContentSize(width, 900);
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("footer") && !document.querySelector("[data-first-run]")');
      await pause(1600);
      await click('[data-nav-item=library]');
      await until('document.querySelectorAll("[data-card-menu-button]").length===2');
      if (checkLocalization) {
        await click('[data-library-book-card] input[type=checkbox]');
        await button(text.bulkChangeStatus);
        await until('!!document.querySelector("[role=dialog] option[value=paused]")');
        assert.equal(await evaluate('document.querySelector("[role=dialog] option[value=paused]").textContent'), text.bulkStatusPaused);
        assert.equal(await evaluate('document.querySelector("[role=dialog] option[value=abandoned]").textContent'), text.bulkStatusAbandoned);
        await shot(prefix + '-localized-bulk-status');
        await key('Escape');
        await button(text.batchDeselectAll);
      }
      for (const book of books) {
        await evaluate('(()=>{const title=[...document.querySelectorAll("[data-library-book-card] h3")].find(e=>e.textContent===' + JSON.stringify(book.title) + ');if(!title)throw new Error("Book missing");title.closest("[data-library-book-card]").querySelector("[data-card-menu-button]").click();})()');
        // Details is the shared action identified by its translated label.
        await button(text.bookDetailsBtn);
        await until('!!document.querySelector("[data-book-detail-overview] [data-detail-source]")');
        assert.equal(await evaluate('document.querySelector("[data-book-detail-overview] h1").textContent'), book.title);
        assert.equal(await evaluate('document.querySelectorAll("[data-detail-edition]").length'), 2);
        assert.equal(await evaluate('document.querySelector("[data-detail-notes]").textContent'), (1).toLocaleString(language));
        await trap(); await shot(prefix + '-' + book.id + '-detail');
        await button(text.readerZoomIn);
        assert.equal(await evaluate('document.querySelector("[data-cover-zoom]").style.width'), '200px');
        await button(text.readerZoomOut);
        await click('[data-detail-reading-log] > button');
        await until('document.querySelector("[data-reading-log]").open');
        await trap(); await shot(prefix + '-' + book.id + '-log');
        await click('[data-detail-edit]');
        await until('!!document.querySelector("[role=dialog] input")');
        await trap();
        if (checkLocalization) {
          await button(text.providerSettingsBtn);
          await until('document.body.innerText.includes(' + JSON.stringify(text.providerDiscoveryTitle) + ') && document.body.innerText.includes(' + JSON.stringify(text.providerPrioritySequence.replace('{priority}', formatLibraryNumber(1, language))) + ')');
          await trap(); await shot(prefix + '-' + book.id + '-localized-providers');
          await key('Escape');
          await until('!document.body.innerText.includes(' + JSON.stringify(text.providerDiscoveryTitle) + ')');
          await button(text.openLibraryHubTooltip);
          const hub = '[role=dialog][aria-label=' + JSON.stringify(text.onlineHubTitle) + ']';
          const query = hub + ' input';
          await until('!!document.querySelector(' + JSON.stringify(query) + ')');
          await evaluate('document.querySelector(' + JSON.stringify(query) + ').focus()');
          await win.webContents.insertText('عِلْم Knowledge');
          await pause(100);
          await evaluate('document.querySelector(' + JSON.stringify(query) + ').closest("form").requestSubmit()');
          const t = (key, params) => Object.entries(params ?? {}).reduce((value, [name, replacement]) => value.replaceAll('{' + name + '}', String(replacement)), text[key]);
          const pages = pageCountLabel('3', language, t);
          await until('document.querySelector(' + JSON.stringify(hub) + ')?.textContent.includes(' + JSON.stringify(pages) + ')');
          assert.ok(await evaluate('document.querySelector(' + JSON.stringify(hub) + ').textContent.includes(' + JSON.stringify(text.onlineResultsCount.replace('{count}', formatLibraryNumber(1, language))) + ')'));
          await trap(); await shot(prefix + '-' + book.id + '-localized-online');
          await key('Escape');
          await until('!document.querySelector(' + JSON.stringify(hub) + ')');
        }
        await button(text.geekDetailsBtn);
        await until('!!document.querySelector("[data-metadata-layout]")');
        await trap(); await shot(prefix + '-' + book.id + '-technical');
        await key('Escape');
        await until('!document.querySelector("[data-metadata-layout]")');
        await button(text.autoFillTooltip);
        await until('!!document.querySelector("[data-metadata-layout] [role=radio]")');
        if (checkLocalization) {
          await evaluate('[...document.querySelectorAll("[data-metadata-layout] button")].find(button=>button.textContent.includes(' + JSON.stringify(text.diagnosticsPanelTitle) + ')).click()');
          await until('document.querySelector("[data-metadata-layout]")?.textContent.includes(' + JSON.stringify(text.diagnosticsNoEmbeddedTags) + ')');
          assert.ok(await evaluate('document.querySelector("[data-metadata-layout]").textContent.includes(' + JSON.stringify(text.diagnosticsNormalizedTitleLabel.trim()) + ')'));
          await shot(prefix + '-' + book.id + '-localized-diagnostics');
        }
        await trap(); await shot(prefix + '-' + book.id + '-candidates');
        await button(text.candidateProceedToDiff);
        await until('!!document.querySelector("[data-metadata-diff]")');
        await trap();
        await click('[data-metadata-diff] input');
        assert.equal(await evaluate('document.querySelector("[data-metadata-diff] input").checked'), false);
        await shot(prefix + '-' + book.id + '-diff');
        await key('Escape');
        await until('!document.querySelector("[data-metadata-layout]")');
        assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), true, prefix + ' parent remains after diff Escape');
        await button(text.findOnlineDesc);
        await until('!!document.querySelector("[data-metadata-diff]")');
        await trap(); await shot(prefix + '-' + book.id + '-edition-diff');
        assert.equal(await evaluate('document.querySelector("[data-metadata-diff] label").textContent.includes(' + JSON.stringify(text.diffFieldTitle) + ')'), true, 'Localized title field');
        await key('Escape');
        await until('!document.querySelector("[data-metadata-layout]")');
        await key('Escape');
        // Candidate review without Apply must leave the saved metadata intact.
        await until('!document.querySelector("[role=dialog]")');
        assert.equal(await evaluate('document.activeElement.matches("[data-card-menu-button]")'), true, 'Editor restores the original card opener');
        const saved = (await evaluate('window.electronAPI.getAllBooks()')).find(item => item.id === book.id);
        assert.equal(saved.title, book.title); assert.equal(saved.publisher, book.publisher);
      }
      await click('[data-library-dialog=more-menu]');
      await button(text.auditAndRefreshMetadata);
      await until('!!document.querySelector("[data-metadata-layout]")');
      await trap(); await shot(prefix + '-audit');
      assert.equal(await evaluate('[...document.querySelectorAll("[data-metadata-body] div")].filter(e=>e.classList.contains("overscroll-contain")).every(e=>e.scrollWidth<=e.clientWidth+1)'), true, 'Audit content fits');
      await key('Escape');
      await until('!document.querySelector("[data-metadata-layout]")');
      const openDetails = async book => {
        await evaluate('(()=>{const title=[...document.querySelectorAll("[data-library-book-card] h3")].find(e=>e.textContent===' + JSON.stringify(book.title) + ');title.closest("[data-library-book-card]").querySelector("[data-card-menu-button]").click();})()');
        await button(text.bookDetailsBtn);
        await until('!!document.querySelector("[data-book-detail-overview]")');
      };
      await openDetails(books[0]);
      await button(text.detailMoreActions); await button(text.detailLend);
      await until('!!document.querySelector("[role=dialog] input")');
      await trap(); await shot(prefix + '-lend');
      await key('Escape');
      await until('!document.querySelector("[role=dialog]")');
      assert.equal(await evaluate('document.activeElement.matches("[data-card-menu-button]")'), true, 'Lending restores the original card opener');
      await openDetails(books[1]);
      await click('[data-detail-read]');
      await until('!!document.querySelector("[data-reader-shared-header]") && !!document.querySelector("[data-pdf-width]")');
      await shot(prefix + '-read');
      await click('[data-nav-item=library]');
      await until('document.querySelectorAll("[data-card-menu-button]").length===2');
      await openDetails(books[0]);
      await button(text.detailMoreActions); await button(text.deleteFromLibrary);
      await until('!document.querySelector("[data-book-detail-overview]") && !!document.querySelector("[data-feedback-toast]")');
      await button(text.undo);
      await until('(async()=> (await window.electronAPI.getAllBooks()).length===2)()');
      await shot(prefix + '-undo');
      await evaluate('(async()=>{await window.electronAPI.addBook({id:"third-trash",title:"كتاب ثالث Third book",author:"Author",bookType:"physical",categories:[],tags:[],lendingHistory:[]});for(const book of await window.electronAPI.getAllBooks())await window.electronAPI.deleteBook(book.id);})()');
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("footer")'); await pause(1600);
      await click('[data-nav-item=library]');
      await until('!!document.querySelector("[data-library-dialog=more-menu]")');
      await click('[data-library-dialog=more-menu]');
      await evaluate('(()=>{const b=[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.includes(' + JSON.stringify(text.trashBin) + '));b.click();})()');
      await until('document.querySelectorAll("[role=dialog] img").length===2');
      await button(text.selectAllTrash);
      await trap(); await shot(prefix + '-trash-selected');
      await button(text.restoreSelected);
      await until('(async()=> (await window.electronAPI.getAllBooks()).length===3)()');
      const restored = language === 'ar' ? 'تم استرجاع ' + (3).toLocaleString(language) + ' كتب' : 'Restored 3 books';
      await until('document.querySelector("[data-feedback-toast]")?.textContent.includes(' + JSON.stringify(restored) + ')');
      await shot(prefix + '-restored');
      await key('Escape');
      await evaluate('(async()=>{await window.electronAPI.deleteBook("third-trash");await window.electronAPI.permanentlyDeleteBook("third-trash");})()');
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
      assert.equal(BrowserWindow.getAllWindows().length, 1);
      results.push({ language, theme, width, realBooks: 2, keyboard: true, coverZoom: true, readingLog: true, metadataPanels: 5, lend: true, read: true, undo: true, bulkRestore: 3 });
      save();
    }
    assert.deepEqual(errors, []); save(); app.quit();
  })().catch(async error => { console.error(error); save(); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
