// KEY-309 (U15): the six UX journeys, end to end, in ar/en, 1280/480 px, light/dark.
// Every step is a user action through the UI. A journey that fails records the failing step and a screenshot,
// and the run continues with the next journey. Results go to result.json in the evidence folder.
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const profile = process.env.BAGLIB_JOURNEY_PROFILE;
const evidence = process.env.BAGLIB_JOURNEY_EVIDENCE;
const only = (process.env.BAGLIB_JOURNEY_ONLY || '').split(',').filter(Boolean);
const journeysOnly = (process.env.BAGLIB_JOURNEY_IDS || '').split(',').filter(Boolean).map(Number);
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const python = path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe');
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [], results = [];
  let configuration;
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push({ configuration, message }); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, tries = 120) => {
    for (let i = 0; i < tries; i++) { try { if (await evaluate(code)) return; } catch { } await pause(150); }
    throw new Error('Timed out waiting for: ' + code.slice(0, 160));
  };
  const has = selector => evaluate('!!document.querySelector(' + JSON.stringify(selector) + ')');
  const press = (keyCode, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  const tr = key => translations[configuration.lang][key];
  const ready = async () => { await until('!document.querySelector("[data-splash-brand]")'); await evaluate('document.fonts.ready'); await pause(300); };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => { }); });
  const shot = async name => fs.writeFileSync(path.join(evidence, [configuration.lang, configuration.theme, configuration.width, name].join('-') + '.png'), (await win.webContents.capturePage()).toPNG());

  // One journey: named steps, each one user action. Time and step count are recorded.
  let journey;
  const step = async (label, action) => {
    journey.steps++; journey.current = label;
    await action();
  };
  const ui = {
    click: (label, selector) => step(label, async () => { await until('!!document.querySelector(' + JSON.stringify(selector) + ')'); await evaluate('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');e.scrollIntoView({block:"center"});e.click();})()'); await pause(200); }),
    clickText: (label, scope, text) => step(label, async () => {
      const find = '[...document.querySelectorAll(' + JSON.stringify(scope) + ')].find(e=>e.textContent.trim().includes(' + JSON.stringify(text) + ')&&e.getBoundingClientRect().width>0)';
      await until('!!' + find); await evaluate('(()=>{const e=' + find + ';e.scrollIntoView({block:"center"});e.click();})()'); await pause(200);
    }),
    type: (label, selector, value) => step(label, async () => {
      await until('!!document.querySelector(' + JSON.stringify(selector) + ')');
      await evaluate('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');e.focus();const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(e,' + JSON.stringify(value) + ');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');
      await pause(250);
    }),
    nav: (id, root) => step('open ' + id, async () => {
      if (await has('[data-srs-exit-button]')) await evaluate('document.querySelector("[data-srs-exit-button]").click()');
      await evaluate('document.querySelector(\'[data-nav-item="' + id + '"]\').click()');
      await until('!!document.querySelector(' + JSON.stringify(root) + ')'); await pause(300);
    }),
    select: label => step(label, async () => {
      // Select a passage of real text, as a mouse drag would, then let the reader show its selection menu.
      await evaluate(`(()=>{
        const span=!document.querySelector('[data-study-epub-page]')&&[...document.querySelectorAll('.pdf-page-container .textLayer span')].find(s=>s.textContent.trim().length>3);
        if(span){const r=document.createRange();r.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(r);span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return;}
        const root=document.querySelector('[data-study-epub-page]')?[...document.querySelectorAll('[data-study-epub-page] p')].find(e=>e.textContent.trim().length>40):document.querySelector('.pdf-page-container .textLayer');
        if(!root)throw new Error('No text');
        const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())&&node.textContent.trim().length<6){}
        if(!node)throw new Error('No text node');
        const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(node.textContent.length,60));
        root.scrollIntoView({block:'center'});getSelection().removeAllRanges();getSelection().addRange(range);
        root.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
      await pause(400);
    }),
  };
  const journeyRun = async (id, title, body) => {
    if (journeysOnly.length && !journeysOnly.includes(id)) return;
    journey = { id, title, ...configuration, steps: 0, ok: false, ms: 0, failedStep: null, error: null, notes: [] };
    const start = Date.now();
    try { await body(); journey.ok = true; }
    catch (error) {
      journey.failedStep = journey.current; journey.error = String(error.message || error).slice(0, 400);
      await shot('J' + id + '-failure').catch(() => { });
    }
    journey.ms = Date.now() - start;
    delete journey.current;
    results.push(journey);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`J${id} ${configuration.lang}-${configuration.theme}-${configuration.width}: ${journey.ok ? 'OK' : 'FAIL at "' + journey.failedStep + '" ' + journey.error} (${journey.steps} steps, ${(journey.ms / 1000).toFixed(1)} s)`);
    // Return to a known state for the next journey.
    press('Escape');
    await win.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await ready();
  };

  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 900);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await ready();
    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
    const arPdf = manifest.files.find(file => file.kind === 'pdf' && file.lang === 'ar' && file.path.includes('/text-layer/'));
    const enEpub = manifest.files.filter(file => file.kind === 'epub' && file.lang === 'en').sort((a, b) => a.bytes - b.bytes)[0];
    // Work on copies inside the throwaway profile, so saving marks never touches the user's real files.
    const copies = path.join(profile, 'journey-files');
    fs.mkdirSync(copies, { recursive: true });
    const copy = file => { const target = path.join(copies, path.basename(file.path)); fs.copyFileSync(path.resolve('tests/real-files', file.path), target); return target; };
    const arPdfPath = copy(arPdf), enEpubPath = copy(enEpub);
    const configs = [];
    for (const lang of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) configs.push({ lang, theme, width });
    for (const config of configs) {
      if (only.length && !only.includes(`${config.lang}-${config.theme}-${config.width}`)) continue;
      configuration = config;
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(config.lang) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(config.theme) + ')');
      win.setContentSize(config.width, 900);
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      await ready();

      // J1 — import an Arabic PDF and an English EPUB; find them, filter by topic and author, mark one as physical.
      await journeyRun(1, 'Import, find, filter, mark physical', async () => {
        await evaluate('window.electronAPI.getAllBooks().then(async books=>{for(const book of books)await window.electronAPI.deleteBook(book.id)})');
        await step('choose the two files in the import dialog (native picker, driven through the same IPC)', async () => {
          const result = await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify([arPdfPath, enEpubPath].map(filePath => ({ filePath, duplicateAction: 'import_anyway' }))) + ',"ux-journeys")');
          if (result.successfulImports !== 2) throw new Error('imported ' + result.successfulImports);
          await win.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await ready();
        });
        await ui.nav('library', '[data-library-recent]');
        const books = await evaluate('window.electronAPI.getAllBooks()');
        const total = books.length;
        await until('document.querySelectorAll("[data-library-book-card]").length===' + total);
        const arBook = books.find(book => book.filePath === arPdfPath), enBook = books.find(book => book.filePath === enEpubPath);
        await ui.type('search the Arabic title', '[data-simple-search-input]', arBook.title.split(/\s+/).slice(0, 2).join(' '));
        await until('[...document.querySelectorAll("[data-library-book-card]")].some(e=>e.getAttribute("aria-label")===' + JSON.stringify(arBook.title) + ')&&document.querySelectorAll("[data-library-book-card]").length<' + total);
        await step('clear the search', async () => { await evaluate('document.querySelector("[data-simple-search-input]").focus()'); press('Escape'); await until('document.querySelectorAll("[data-library-book-card]").length===' + total); });
        if (!await evaluate('!!document.querySelector("[data-library-filter-rail]")?.offsetParent')) {
          await ui.clickText('open "Advanced filters"', 'button', tr('advancedFiltersToggle'));
        }
        const topic = await evaluate('!!document.querySelector("[data-filter-topic-chip]")');
        if (topic) {
          // An empty topic (count 0) is the case a new user meets right after importing.
          await ui.click('filter by a topic', (await has('[data-filter-topic-chip][data-topic-count="0"]') ? '[data-filter-topic-chip][data-topic-count="0"]' : '[data-filter-topic-chip]') + ' button[aria-pressed]');
          await pause(400);
          await until('document.querySelectorAll("[data-library-book-card]").length!==' + total + '||!!document.querySelector("[data-library-topic-hint]")', 20).catch(() => { });
          const shown = await evaluate('document.querySelectorAll("[data-library-book-card]").length');
          if (shown === 0) {
            // KEY-328: the empty result explains why and offers to select the unclassified books.
            await until('!!document.querySelector("[data-library-topic-hint]")');
            await shot('J1-topic-hint');
            await ui.click('choose "Select the books without a topic"', '[data-library-select-unclassified]');
            await until('document.querySelectorAll("[data-library-book-card]").length===' + total + '&&document.querySelectorAll("[data-library-book-card] input[type=checkbox]:checked").length>0');
            await ui.click('clear the selection', 'button[aria-label=' + JSON.stringify(tr('batchDeselectAll')) + ']:not([type=checkbox])');
            await until('document.querySelectorAll("[data-library-book-card] input[type=checkbox]:checked").length===0');
          } else {
            await ui.click('turn the topic off', '[data-filter-topic-chip] button[aria-pressed=true]');
            await until('document.querySelectorAll("[data-library-book-card]").length===' + total);
          }
        } else journey.notes.push('No topic chips are offered.');
        await ui.clickText('filter by the English author', '[data-library-filter-rail] label', enBook.author);
        await until('[...document.querySelectorAll("[data-library-book-card]")].every(e=>e.getAttribute("aria-label")===' + JSON.stringify(enBook.title) + ')');
        await ui.clickText('turn the author off', '[data-library-filter-rail] label', enBook.author);
        await until('document.querySelectorAll("[data-library-book-card]").length===' + total);
        await step('open the Arabic book menu', async () => { await evaluate('[...document.querySelectorAll("[data-library-book-card]")].find(e=>e.getAttribute("aria-label")===' + JSON.stringify(arBook.title) + ').querySelector("[data-card-menu-button]").click()'); await until('!!document.querySelector("[data-menu-action=physical]")'); });
        await ui.click('choose "physical copy"', '[data-menu-action=physical]');
        await ui.type('enter the shelf room', 'input[list="room-suggestions"]', config.lang === 'ar' ? 'المكتبة الرئيسية' : 'Study room');
        await ui.clickText('save', 'button', tr('saveChanges'));
        await until('window.electronAPI.getAllBooks().then(b=>["physical","hybrid"].includes(b.find(x=>x.id===' + JSON.stringify(arBook.id) + ').bookType))');
        await shot('J1-done');
      });

      // J2 — read a PDF: mark it up, save it, and reopen it in another viewer.
      await journeyRun(2, 'Mark up a PDF, save, reopen elsewhere', async () => {
        const books = await evaluate('window.electronAPI.getAllBooks()');
        const arBook = books.find(book => book.filePath === arPdfPath);
        if (!arBook) throw new Error('Journey 1 did not import the PDF');
        await ui.nav('library', '[data-library-recent]');
        await step('open the Arabic PDF', async () => {
          await until('!!document.querySelector("[data-library-book-card]")');
          await evaluate('[...document.querySelectorAll("[data-library-book-card]")].find(e=>e.getAttribute("aria-label")===' + JSON.stringify(arBook.title) + ').querySelector("[data-card-read-button]").click()');
          await until('document.querySelectorAll(".pdf-page-container .textLayer span").length>0', 200);
        });
        if (!await evaluate('!!document.querySelector("[data-markup-tool-button=highlight]")?.offsetParent')) await ui.click('open the markup palette', '[data-markup-palette]');
        await ui.click('pick the highlighter', '[data-markup-tool-button=highlight]');
        const before = (await evaluate('window.electronAPI.knowledge.getByWork(' + JSON.stringify(arBook.id) + ')')).length;
        await ui.select('drag over a line of text');
        await until('window.electronAPI.knowledge.getByWork(' + JSON.stringify(arBook.id) + ').then(r=>r.length>' + before + ')');
        await ui.click('save into the PDF', '[data-reader-save]');
        await until('document.querySelector("[data-pdf-save-state]")?.dataset.pdfSaveState==="saved"', 200);
        await shot('J2-saved');
        await step('reopen the saved file in another PDF engine (pdfium)', async () => {
          const out = execFileSync(python, ['-I', '-c', 'import sys, pikepdf, pypdfium2\nq = pikepdf.open(sys.argv[1])\nprint(sum(len(page.get("/Annots", [])) for page in q.pages))\npypdfium2.PdfDocument(sys.argv[1])[0].render(scale=1, may_draw_forms=True).to_pil().save(sys.argv[2])', arBook.filePath, path.join(evidence, [config.lang, config.theme, config.width, 'J2-pdfium.png'].join('-'))], { encoding: 'utf8', windowsHide: true });
          if (!(Number(out.trim()) > 0)) throw new Error('No annotations in the saved file: ' + out);
          journey.notes.push('Saved file opens in pdfium with ' + out.trim() + ' annotation(s).');
        });
      });

      // J3 — take a note from a passage, then make a card and review it.
      await journeyRun(3, 'Note from a passage, card, review', async () => {
        const books = await evaluate('window.electronAPI.getAllBooks()');
        const enBook = books.find(book => book.filePath === enEpubPath);
        if (!enBook) throw new Error('Journey 1 did not import the EPUB');
        await ui.nav('library', '[data-library-recent]');
        await step('open the English EPUB', async () => {
          await until('!!document.querySelector("[data-library-book-card]")');
          await evaluate('[...document.querySelectorAll("[data-library-book-card]")].find(e=>e.getAttribute("aria-label")===' + JSON.stringify(enBook.title) + ').querySelector("[data-card-read-button]").click()');
          await until('!!document.querySelector("[data-study-epub-page]")', 200);
        });
        for (let turn = 0; turn < 8 && !await evaluate('[...document.querySelectorAll("[data-study-epub-page] p")].some(e=>e.textContent.trim().length>40)'); turn++) {
          await ui.click('turn the page', 'button[aria-label=' + JSON.stringify(tr('nextCoverPage')) + ']'); await pause(600);
        }
        await until('[...document.querySelectorAll("[data-study-epub-page] p")].some(e=>e.textContent.trim().length>40)', 60);
        const before = (await evaluate('window.electronAPI.knowledge.getByWork(' + JSON.stringify(enBook.id) + ')')).length;
        await ui.select('select a passage');
        await ui.click('choose "add note"', 'button[aria-label=' + JSON.stringify(tr('addNoteAction')) + ']');
        await ui.type('write the note', 'textarea[placeholder=' + JSON.stringify(tr('zenNotePlaceholder')) + ']', config.lang === 'ar' ? 'فكرة مهمة — key idea' : 'Key idea — فكرة');
        await shot('J3-note');
        await ui.clickText('save the note', 'button', tr('zenSaveNote'));
        await until('window.electronAPI.knowledge.getByWork(' + JSON.stringify(enBook.id) + ').then(r=>r.some(x=>x.knowledgeType==="note")&&r.length>' + before + ')');
        await ui.select('select the passage again');
        const cards = (await evaluate('window.electronAPI.knowledgeCards.list()')).length;
        await ui.click('make a review card ("Review")', '[data-reader-study=review]');
        await until('window.electronAPI.knowledgeCards.list().then(c=>c.length>' + cards + ')');
        await ui.nav('notes', '[data-notes-overview]');
        await ui.click('open the cards tab', '[data-notes-tab=cards]');
        await ui.click('start a review', '[data-start-review-button]');
        await ui.click('choose a confidence before revealing', '[data-srs-review] input[type=radio][value="3"]');
        await ui.click('reveal the answer', '[data-srs-reveal]:not(:disabled)');
        await shot('J3-review');
        await ui.click('rate it', '[data-srs-rating]');
      });

      // J4 — plan today from the dashboard, then snooze for prayer.
      await journeyRun(4, 'Plan today, snooze for prayer', async () => {
        await ui.nav('dashboard', '[data-dashboard-view]');
        await until('!!document.querySelector("[data-today-study-panel]")');
        if (!await has('[data-today-step]')) journey.notes.push('No suggested steps for today in this profile; the panel shows its empty state.');
        await ui.click('open "Prayer snooze"', '[data-dashboard-snooze-btn]');
        await ui.clickText('choose "Configure"', '[data-dashboard-snooze-modal] button', tr('dashPrayerSnoozeConfigure'));
        await until('!!document.querySelector("[data-dashboard-rhythm-modal] details[open]")');
        await step('turn on the study rhythm', async () => { await evaluate('(()=>{const l=[...document.querySelectorAll("[data-dashboard-rhythm-modal] label")].find(e=>e.textContent.includes(' + JSON.stringify(tr('rhythmEnabled')) + '));const c=l.querySelector("input");if(!c.checked)c.click();})()'); });
        // A real prayer time cannot be waited for; the zikr pause uses the same snooze screen, set to this minute.
        // Times follow the prayer-settings time zone.
        const zone = await evaluate('window.electronAPI.athan.getState().then(s=>s.coordinates.timezone)');
        await ui.type('set a pause time (this minute)', '[data-dashboard-rhythm-modal] input[type=time]', new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
        await ui.clickText('save', '[data-dashboard-rhythm-modal] button', tr('rhythmSaveApprove'));
        await until('document.querySelector("[data-study-snooze]")?.open', 200);
        await shot('J4-snooze');
        await ui.click('resume after the pause', '[data-study-snooze] button');
        await until('!document.querySelector("[data-study-snooze]").open');
        await evaluate('window.electronAPI.settings.get("dashboard.study.rhythm.v1").then(s=>window.electronAPI.settings.set("dashboard.study.rhythm.v1",{...s,enabled:false,zikr:""}))');
      });

      // J5 — open an ayah and a hadith, compare tafsir, link them to a note.
      await journeyRun(5, 'Ayah and hadith, compare tafsir, link to a note', async () => {
        const panelText = 'document.querySelector("[data-islamic-reader-panel] [role=tabpanel]")?.textContent.trim().slice(0,300)||""';
        const tafsirSelect = '[...document.querySelectorAll("[data-reader-settings-popover] select")].find(s=>[...s.options].some(o=>/tafsir|تفسير|Ibn Kathir|ابن كثير|السعدي|Sa.di|Muyassar|الميسر|Jalalayn|الجلالين/i.test(o.textContent)))';
        await ui.nav('quran', '[data-quran-workspace]');
        await ui.click('open the ayah menu', '[data-quran-ayah-actions]');
        await ui.click('choose "Tafsir"', '[data-menu-action="tafsir"]');
        await until('(' + panelText + ').length>40', 200);
        const firstTafsir = await evaluate(panelText);
        await ui.click('open reading options', '[data-reader-settings]');
        const choices = await evaluate('(()=>{const s=' + tafsirSelect + ';return s?[...s.options].filter(o=>o.value&&o.value!==s.value).map(o=>o.value):[]})()');
        if (!choices.length) journey.notes.push('Only one tafsir is installed, so there is nothing to compare in this profile.');
        else {
          await step('switch to a second tafsir', async () => { await evaluate('(()=>{const s=' + tafsirSelect + ';s.value=' + JSON.stringify(choices[0]) + ';s.dispatchEvent(new Event("change",{bubbles:true}));})()'); });
          await step('read the second tafsir on the same ayah', async () => {
            press('Escape');
            if (!await has('[data-islamic-reader-panel] [role=tabpanel]')) { await evaluate('document.querySelector("[data-quran-ayah-actions]").click()'); await until('!!document.querySelector(\'[data-menu-action="tafsir"]\')'); await evaluate('document.querySelector(\'[data-menu-action="tafsir"]\').click()'); }
            await until('(' + panelText + ').length>40 && (' + panelText + ')!==' + JSON.stringify(firstTafsir), 200);
          });
          journey.notes.push('Comparing means switching the tafsir in Reading options; there is no side-by-side view (KEY-170).');
          await shot('J5-second-tafsir');
        }
        press('Escape');
        const notesBefore = (await evaluate('window.electronAPI.studyNotes.list()')).length;
        await ui.click('open the ayah menu again', '[data-quran-ayah-actions]');
        await ui.click('choose "New note"', '[data-menu-action="note"]');
        await until('!!document.querySelector("[data-note-editor-pane]")', 200);
        await ui.type('give the note a title', '[data-note-editor-title]', config.lang === 'ar' ? 'آية وحديث — study' : 'Ayah and hadith — دراسة');
        await ui.clickText('save the note', '[data-note-editor-actions] button', tr('save'));
        await until('window.electronAPI.studyNotes.list().then(n=>n.length>' + notesBefore + '&&n.some(x=>x.content.includes("quran:")))');
        const ayahNote = (await evaluate('window.electronAPI.studyNotes.list()')).filter(note => note.content.includes('quran:')).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
        journey.notes.push('Ayah note saved with title: ' + ayahNote.title);
        await ui.nav('sunnah', '.sunnah-workspace');
        await until('!!document.querySelector("[data-hadith-id]")', 200);
        await step('right-click a hadith', async () => { await evaluate('(()=>{const e=document.querySelector("[data-hadith-id]");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+20}));})()'); await until('!!document.querySelector(\'[data-menu-action="link"]\')'); });
        await ui.click('choose "Link to an existing note"', '[data-menu-action="link"]');
        await ui.clickText('pick the new note', '[role=dialog] button', ayahNote.title || ayahNote.content.slice(0, 30));
        await until('window.electronAPI.studyNotes.list().then(n=>n.some(x=>x.id===' + JSON.stringify(ayahNote.id) + '&&x.content.includes("sunnah:")))');
        await shot('J5-linked-note');
      });

      // J6 — build a curriculum from a template and follow its first step.
      await journeyRun(6, 'Curriculum from a template, first step', async () => {
        await ui.nav('pathways', '[data-pathways-space]');
        await ui.clickText('open "Templates"', '[role=tab]', tr('pathwaysTabTemplates'));
        await ui.click('use the first template', '[data-template-use]');
        await until('!!document.querySelector("[data-pathway-next]")', 200);
        await shot('J6-pathway');
        if (!await has('[data-pathway-continue-main]')) {
          // KEY-327: a step without a source offers to attach one; the English book from J1 becomes its source.
          const enTitle = (await evaluate('window.electronAPI.getAllBooks()')).find(book => book.filePath === enEpubPath)?.title || '';
          await ui.click('choose "Add a source for this step"', '[data-pathway-add-source]');
          await ui.type('search the books', '[data-pathway-resource-picker] [data-study-link-picker] input', '/books ' + enTitle.split(/\s+/).slice(0, 2).join(' '));
          await ui.clickText('pick the book', '[data-pathway-resource-picker] [data-study-link-picker] button', enTitle.slice(0, 20));
          await until('!!document.querySelector("[data-pathway-continue-main]")');
        }
        await ui.click('continue to the first step', '[data-pathway-continue-main]');
        await until('!!document.querySelector("[data-reader-go-to], [data-study-epub-page], .pdf-page-container")', 200);
        await shot('J6-first-step');
      });

      // J7 (opt-in, BAGLIB_JOURNEY_IDS=7) — KEY-246 review: a question typed in a note appears in Open questions, links back, and can be answered.
      if (journeysOnly.includes(7)) await journeyRun(7, 'Question in a note becomes an open question', async () => {
        await ui.nav('settings', '[data-settings-directory]');
        await ui.click('open "Open questions" settings', '[data-settings-entry="questions"]');
        await step('turn capture on', async () => { await until('!!document.querySelector("[role=dialog] input[type=checkbox]:not(:disabled)")'); await evaluate('(()=>{const c=document.querySelector("[role=dialog] input[type=checkbox]");if(!c.checked)c.click();})()'); await until('window.electronAPI.settings.get("knowledge.questions.enabled").then(v=>v===true)'); });
        press('Escape');
        await ui.nav('notes', '[data-notes-overview]');
        await ui.click('open the notes tab', '[data-notes-tab=notes]');
        await ui.click('create a new note', '[data-new-note-button]');
        await until('!!document.querySelector("[data-note-editor-pane] .cm-content")', 200);
        const title = config.lang === 'ar' ? 'أسئلة مفتوحة — ' + config.theme + config.width : 'Open questions — ' + config.theme + config.width;
        await ui.type('title the note', '[data-note-editor-title]', title);
        await step('write two questions', async () => {
          await evaluate('document.querySelector("[data-note-editor-pane] .cm-content").focus()');
          await win.webContents.insertText('ما حكم الدفاع عن الأرض؟ What does the author mean by policing?');
          await pause(300);
        });
        await ui.clickText('save the note', '[data-note-editor-actions] button', tr('save'));
        const note = await (async () => { for (let i = 0; i < 60; i++) { const found = (await evaluate('window.electronAPI.studyNotes.list()')).find(n => n.title === title); if (found) return found; await pause(200); } throw new Error('note not saved'); })();
        await until('window.electronAPI.knowledgeHistory.questions().then(q=>q.filter(x=>x.source==="note:' + note.id + '").length>=2)', 120);
        const questions = (await evaluate('window.electronAPI.knowledgeHistory.questions()')).filter(q => q.source === 'note:' + note.id);
        journey.notes.push('Captured: ' + questions.map(q => q.text).join(' | '));
        if (await has('[data-notes-back-button]')) await ui.click('back to the list', '[data-notes-back-button]');
        await step('show Open questions', async () => { await evaluate('(()=>{const s=[...document.querySelectorAll("[data-notes-list-pane] select")].find(e=>e.querySelector("option[value=questions]"));s.value="questions";s.dispatchEvent(new Event("change",{bubbles:true}));})()'); await until('!!document.querySelector(\'[data-captured-question="' + questions[0].id + '"]\')'); });
        await shot('J7-open-questions');
        await ui.click('follow the source link', '[data-captured-question="' + questions[0].id + '"] button');
        await until('document.querySelector("[data-note-editor-title]")?.value===' + JSON.stringify(title), 120);
        if (await has('[data-notes-back-button]')) await ui.click('back to the list', '[data-notes-back-button]');
        await step('show Open questions again', async () => { await evaluate('(()=>{const s=[...document.querySelectorAll("[data-notes-list-pane] select")].find(e=>e.querySelector("option[value=questions]"));s.value="questions";s.dispatchEvent(new Event("change",{bubbles:true}));})()'); await until('!!document.querySelector(\'[data-captured-question="' + questions[0].id + '"] [data-question-answer]\')'); });
        await ui.click('mark it answered', '[data-captured-question="' + questions[0].id + '"] [data-question-answer]');
        await until('window.electronAPI.knowledgeHistory.questions().then(q=>q.find(x=>x.id==="' + questions[0].id + '").status==="answered")');
      });

      // J8 (opt-in, BAGLIB_JOURNEY_IDS=8) — KEY-251 review: a personal comment on an ayah is searchable and its result opens the ayah.
      if (journeysOnly.includes(8)) await journeyRun(8, 'Comment on an ayah, find it, open the ayah', async () => {
        const words = config.lang === 'ar' ? 'تأمل خاص بآية ' + config.theme + config.width : 'Personal reflection ' + config.theme + config.width;
        await ui.nav('quran', '[data-quran-workspace]');
        const firstAyah = await evaluate('(()=>{const e=document.querySelector(\'.mushaf-svg-surface [data-surah="2"][data-aya]\');return e?{surah:+e.dataset.surah,ayah:+e.dataset.aya}:null})()');
        await ui.click('open the ayah menu', '[data-quran-ayah-actions]');
        await ui.click('choose "Comments"', '[data-menu-action="comment"]');
        await ui.type('write a reflection', '[role=dialog] textarea', words);
        await ui.clickText('save it', '[role=dialog] button', tr('commentarySave'));
        await until('window.electronAPI.commentary.search(' + JSON.stringify(words) + ').then(r=>r.length===1)');
        const saved = (await evaluate('window.electronAPI.commentary.search(' + JSON.stringify(words) + ')'))[0];
        journey.notes.push('Saved on ' + saved.reference + (firstAyah ? ' (page starts at ' + firstAyah.surah + ':' + firstAyah.ayah + ')' : ''));
        press('Escape');
        // Move the reader to another surah, so opening the result has to bring the commented ayah back.
        const pageOf = () => evaluate(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)`);
        const savedPage = await pageOf();
        const savedSurah = Number(saved.reference.split(':').slice(-2)[0]);
        await step('go to another surah', async () => {
          await evaluate('(()=>{const s=[...document.querySelectorAll("[data-reader-picker] select")].find(s=>[...s.options].some(o=>o.value==="2"));s.value="' + (savedSurah === 2 ? 1 : 2) + '";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
          await until('(' + `Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)` + ')!==' + savedPage, 200);
        });
        await ui.nav('notes', '[data-notes-overview]');
        await ui.click('open the cards tab', '[data-notes-tab=cards]');
        await step('open "My personal commentary"', async () => { await evaluate('(()=>{const i=document.querySelector("input[aria-label=' + JSON.stringify(tr('commentarySearch')).replace(/"/g, '\\"') + ']");i.closest("details").open=true;i.scrollIntoView({block:"center"});})()'); });
        await ui.type('search the comment', 'input[aria-label=' + JSON.stringify(tr('commentarySearch')) + ']', words.split(' ').slice(0, 2).join(' '));
        await until('!!document.querySelector(\'[data-commentary-open]\')');
        await shot('J8-search');
        await ui.click('open its ayah', '[data-commentary-open]');
        await until('(' + `Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)` + ')===' + savedPage, 200);
        await shot('J8-opened');
      });

      // J9 (opt-in, BAGLIB_JOURNEY_IDS=9) — the storage manager opens from Library → More with translated labels.
      if (journeysOnly.includes(9)) await journeyRun(9, 'Open the storage manager', async () => {
        await ui.nav('library', '[data-library-recent]');
        await ui.click('open "More"', '[data-library-dialog="more-menu"]');
        await ui.clickText('choose the storage manager', '[role=menuitem]', tr('storageManagerTitle'));
        await until('!!document.querySelector("[role=dialog]")');
        await pause(800);
        const check = await evaluate(`(() => {
          const dialog = document.querySelector('[role=dialog]');
          const text = dialog.innerText;
          const arabic = (text.match(/[\\u0600-\\u06FF]/gu) || []).length, latin = (text.match(/[A-Za-z]/g) || []).length;
          const keys = [...dialog.querySelectorAll('button,span,p,h2,h3,label')].map(e => e.textContent.trim()).filter(t => /^storage[A-Z]\\w+$/.test(t));
          return { arabic, latin, keys, overflow: dialog.scrollWidth > dialog.clientWidth + 1 };
        })()`);
        journey.notes.push('Storage dialog text: ' + JSON.stringify(check));
        if (check.keys.length) throw new Error('raw keys: ' + check.keys.join(','));
        if (config.lang === 'ar' ? check.arabic === 0 : check.arabic > check.latin) throw new Error('wrong language in dialog');
        await shot('J9-storage');
      });
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log('DONE', results.filter(r => r.ok).length + '/' + results.length, 'journeys passed;', errors.length, 'renderer errors');
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
    try { fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG()); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
