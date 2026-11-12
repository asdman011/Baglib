require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_SWEEP_PROFILE;
const evidence = process.env.BAGLIB_SWEEP_EVIDENCE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
    if (started)
        return;
    started = true;
    const errors = [], results = [];
    let current = 'bootstrap', configuration;
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3)
        errors.push({ current, message }); });
    const evaluate = code => win.webContents.executeJavaScript(code, true);
    const until = async (code) => {
        for (let i = 0; i < 250; i++) {
            try {
                if (await evaluate(code))
                    return;
            }
            catch { }
            await pause(150);
        }
        throw new Error('Timed out ' + code);
    };
    const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
    const press = keyCode => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); };
    const navigate = async (id, root) => {
        await click('[data-nav-item="' + id + '"]');
        await until('!!document.querySelector(' + JSON.stringify(root) + ')');
        await pause(300);
    };
    const ready = async () => {
        await pause(500);
        await until('!document.querySelector("[data-splash-brand]")');
        await evaluate('document.fonts.ready');
    };
    win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => { }); });
    const shot = async (page) => {
        current = page;
        await ready();
        await pause(350);
        const name = [configuration.lang, configuration.theme, configuration.width, page].join('-');
        const geometry = await evaluate(`(() => {
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0};
      const root=document.querySelector('main')||document.body;
      const leaves=[...root.querySelectorAll('button,label,h1,h2,h3,p,span,select,input')].filter(visible);
      const outside=leaves.filter(e=>{const r=e.getBoundingClientRect();return r.x<-2||r.right>innerWidth+2}).slice(0,30).map(e=>({tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,140),className:e.className}));
      const clipped=leaves.filter(e=>e.scrollWidth>e.clientWidth+3&&getComputedStyle(e).overflowX==='hidden').slice(0,30).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,140),className:e.className}));
      const labels=leaves.filter(e=>['BUTTON','LABEL','H1','H2','H3'].includes(e.tagName)).map(e=>(e.textContent||e.getAttribute('aria-label')||'').trim()).filter(Boolean);
      return {lang:document.documentElement.lang,dir:document.documentElement.dir,dark:document.documentElement.classList.contains('dark'),viewport:innerWidth,documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,outside,clipped,labels,canonicalFields:[...root.querySelectorAll('h3 bdi,[data-library-book-row] [title] bdi')].map(e=>({text:e.textContent,direction:getComputedStyle(e).direction})),body:root.innerText.slice(0,20000)};
    })()`);
        assert.equal(geometry.dir, configuration.lang === 'ar' ? 'rtl' : 'ltr');
        assert.equal(geometry.dark, configuration.theme === 'dark');
        assert.equal(geometry.viewport, configuration.width);
        if (page.startsWith('library-')) {
            assert.ok(geometry.canonicalFields.length > 0, 'Canonical title isolation is present');
            for (const field of geometry.canonicalFields) {
                const first = field.text.match(/[\p{Script=Arabic}A-Za-z]/u)?.[0];
                if (first)
                    assert.equal(field.direction, /[A-Za-z]/.test(first) ? 'ltr' : 'rtl');
            }
        }
        const keys = new Set(Object.keys(translations.ar));
        const rawKeys = geometry.labels.filter(label => keys.has(label));
        fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
        results.push({ ...configuration, page, screenshot: name + '.png', ...geometry, rawKeys });
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
        console.log('CAPTURE', name);
    };
    const library = async (view = 'grid', recent = 'all') => {
        await navigate('library', '[data-library-recent]');
        await click('[data-recent-view="' + recent + '"]');
        await click('[data-view-mode-toggle] button:' + (view === 'grid' ? 'first' : 'last') + '-child');
        await until('!!document.querySelector(' + JSON.stringify(view === 'grid' ? '[data-library-book-card]' : '[data-library-book-row]') + ')');
        await pause(250);
    };
    const readBook = async (book) => {
        await library();
        await evaluate('[...document.querySelectorAll("[data-library-book-card]")].find(e=>e.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').querySelector("[data-card-read-button]").click()');
        await until('!!document.querySelector("[data-reader-go-to]")');
        if (book.digitalFormat.toUpperCase() === 'PDF')
            await until('!!document.querySelector(".pdf-page-container canvas")');
        else {
            await until('!!document.querySelector("[data-epub-marks-status]")');
            await until('!document.querySelector("[data-reader-content] .animate-spin")');
            await pause(1200);
        }
    };
    (async () => {
        win.setMinimumSize(320, 400);
        win.setContentSize(1280, 900);
        await until('!!window.electronAPI && !!document.querySelector("footer")');
        await ready();
        // Fixture writes are confined to the disposable profile.
        await evaluate('window.electronAPI.getAllBooks().then(async books=>{for(const book of books)await window.electronAPI.deleteBook(book.id)})');
        const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
        const files = ['ar', 'en'].map(lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('/text-layer/')));
        files.push(manifest.files.filter(file => file.kind === 'epub' && file.lang === 'en').sort((a, b) => a.bytes - b.bytes)[0]);
        assert.ok(files.every(Boolean));
        const imported = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify(files.map(file => ({ filePath: path.resolve('tests/real-files', file.path), duplicateAction: 'import_anyway' }))) + ',"ux-sweep")');
        assert.equal(imported.successfulImports, 3);
        const books = await evaluate('window.electronAPI.getAllBooks()');
        const ordered = files.map(file => books.find(book => book.filePath === path.resolve('tests/real-files', file.path)));
        for (const note of [{ id: 'sweep-ar', title: 'عِلْمٌ — Arabic and English', content: '# تأملات\nملاحظات عربية مع English ومثال **مهم**.\n[[quran:hafs:2:255|آية الكرسي]]', tags: ['عِلْمٌ', 'English'] }, { id: 'sweep-en', title: 'English notes — ملاحظات', content: '## Reading notes\nMixed-script reference [[note:sweep-ar|عِلْمٌ]].\nUseful ideas for review.', tags: ['Reading'] }])
            await evaluate('window.electronAPI.studyNotes.save(' + JSON.stringify({ ...note, aliases: [] }) + ')');
        await evaluate('window.electronAPI.knowledgeCards.save(' + JSON.stringify({ front: 'ما الفكرة الأساسية؟ Main idea?', back: 'تأملات عربية — English answer', sourceKind: 'note', sourceRef: 'note:sweep-ar', sourceLabel: 'عِلْمٌ — Arabic', language: 'ar' }) + ')');
        await evaluate('window.electronAPI.boards.save(' + JSON.stringify({ id: 'sweep-board', title: 'عِلْمٌ — Study board', preset: 'blank', items: [], edges: [], expectedRevision: 0 }) + ')');
        await evaluate('window.electronAPI.reader.recordSession(' + JSON.stringify({ workId: ordered[0].id, startedAt: new Date(Date.now() - 60000).toISOString(), endedAt: new Date().toISOString(), pagesRead: 1 }) + ')');
        for (const lang of ['ar', 'en'])
            for (const theme of ['light', 'dark']) {
                await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(lang) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(theme) + ')');
                await win.loadURL('http://localhost:3000');
                await until('!!window.electronAPI && !!document.querySelector("footer")');
                await ready();
                for (const width of [1280, 480]) {
                    configuration = { lang, theme, width };
                    win.setContentSize(width, 900);
                    await pause(300);
                    await navigate('dashboard', '[data-dashboard-view]');
                    await shot('dashboard');
                    await library();
                    await shot('library-grid');
                    await library('list');
                    await shot('library-list');
                    await library('grid', 'opened');
                    await shot('library-recent-opened');
                    await library('grid', 'imported');
                    await shot('library-recent-imported');
                    await library();
                    await click('[data-card-menu-button]');
                    await until('!!document.querySelector("[data-menu-action=details]")');
                    await click('[data-menu-action=details]');
                    await until('!!document.querySelector("[data-book-detail-overview]")');
                    await shot('book-detail');
                    press('Escape');
                    await until('!document.querySelector("[data-book-detail-overview]")');
                    for (const [index, page] of [[0, 'reader-pdf-ar'], [1, 'reader-pdf-en'], [2, 'reader-epub-en']]) {
                        await readBook(ordered[index]);
                        await shot(page);
                    }
                    await navigate('notes', '[data-notes-overview]');
                    await click('[data-notes-tab=notes]');
                    if (await evaluate('!!document.querySelector("[data-notes-back-button]")'))
                        await click('[data-notes-back-button]');
                    await until('!!document.querySelector("[data-study-note=sweep-ar]")');
                    await shot('notes-list');
                    await click('[data-study-note=sweep-ar]');
                    await until('!!document.querySelector("[data-note-editor-pane]")');
                    await shot('notes-editor');
                    if (await evaluate('!!document.querySelector("[data-notes-back-button]")'))
                        await click('[data-notes-back-button]');
                    await click('[data-notes-tab=cards]');
                    await until('!!document.querySelector("[data-saved-cards]")');
                    await shot('notes-cards');
                    await click('[data-notes-tab=boards]');
                    await until('!!document.querySelector("[data-boards-entry=sweep-board]")');
                    await shot('notes-boards');
                    await click('[data-boards-entry=sweep-board] button');
                    await until('!!document.querySelector("[data-board-surface]")');
                    await shot('notes-board-canvas');
                    await navigate('quran', '[data-quran-workspace]');
                    await pause(1000);
                    if (await evaluate('!!document.querySelector("[data-islamic-reader-panel]")')) {
                        const extra = [lang, theme, width, 'quran-panel'].join('-');
                        fs.writeFileSync(path.join(evidence, extra + '.png'), (await win.webContents.capturePage()).toPNG());
                        await click('[data-islamic-reader-panel] > div > button');
                        await until('!document.querySelector("[data-islamic-reader-panel]")');
                    }
                    await shot('quran');
                    await navigate('sunnah', '.sunnah-workspace');
                    await pause(1000);
                    await shot('sunnah');
                    await navigate('bayan', 'article');
                    await pause(1000);
                    await shot('bayan');
                    await navigate('planner', '[data-study-planner]');
                    await shot('planner');
                    await navigate('statistics', '[data-statistics-workspace]');
                    await shot('statistics');
                    await navigate('settings', '[data-settings-directory]');
                    await shot('settings');
                }
            }
        assert.equal(results.length, 160);
        assert.equal(BrowserWindow.getAllWindows().filter(window => window.isVisible()).length, 1);
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors, files: files.map(file => file.path), arabicEpubAvailable: manifest.files.some(file => file.kind === 'epub' && file.lang === 'ar') }, null, 2));
        console.log('PASS UX sweep', results.length, 'screenshots', errors.length, 'renderer errors');
        app.quit();
    })().catch(async (error) => {
        console.error(error);
        fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors, current, configuration }, null, 2));
        try {
            fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
        }
        finally {
            app.exit(1);
        }
    });
});
require('../../dist/main/index.js');
