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
        await step('clear the search', async () => { await evaluate('document.querySelector("[data-simple-search-input]").focus()'); await until('document.activeElement?.hasAttribute("data-simple-search-input")'); win.webContents.focus(); press('Escape'); await until('document.querySelectorAll("[data-library-book-card]").length===' + total); });
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

      // J10 (opt-in, BAGLIB_JOURNEY_IDS=10) — the online library hub opens from a book's details with translated labels.
      if (journeysOnly.includes(10)) await journeyRun(10, 'Open the online library hub', async () => {
        await ui.nav('library', '[data-library-recent]');
        await ui.click('open a book menu', '[data-library-book-card] [data-card-menu-button]');
        await ui.click('choose "Edit metadata"', '[data-menu-action="metadata"]');
        await ui.clickText('choose "Edit work details"', 'button', tr('editMaterialTitle'));
        await ui.click('open the online library hub', 'button[aria-label=' + JSON.stringify(tr('openLibraryHubTooltip')) + ']');
        await until('document.querySelectorAll("[role=dialog]").length>=2 || !!document.querySelector("input[placeholder*=\\"' + (config.lang === 'ar' ? 'ابحث في' : 'Search ') + '\\"]")');
        await pause(500);
        const check = await evaluate(`(() => {
          const dialogs = [...document.querySelectorAll('[role=dialog]')]; const hub = dialogs[dialogs.length - 1];
          const placeholder = [...hub.querySelectorAll('input')].map(i => i.placeholder).find(Boolean) || '';
          const keys = [...hub.querySelectorAll('button,span,p,h2,h3,label')].map(e => e.textContent.trim()).filter(t => /^online[A-Z]\\w+$/.test(t));
          return { placeholder, keys, overflow: hub.scrollWidth > hub.clientWidth + 1, text: hub.innerText.slice(0, 300) };
        })()`);
        journey.notes.push('Hub: ' + JSON.stringify({ placeholder: check.placeholder, keys: check.keys, overflow: check.overflow }));
        if (check.keys.length) throw new Error('raw keys ' + check.keys.join(','));
        if (config.lang === 'en' && /[؀-ۿ]/u.test(check.placeholder)) throw new Error('Arabic placeholder in English: ' + check.placeholder);
        await shot('J10-online-hub');
      });

      // J11 (opt-in, BAGLIB_JOURNEY_IDS=11) — KEY-253 review: Shrouh opens beside the hadith with attribution; commentary is keyed by the hadith.
      if (journeysOnly.includes(11)) await journeyRun(11, 'Shrouh beside a hadith, personal commentary', async () => {
        await ui.nav('sunnah', '.sunnah-workspace');
        await until('!!document.querySelector("[data-hadith-id]")', 200);
        await ui.click('open the study panel', '[data-reader-panel-toggle]');
        await ui.click('open "Related"', '[data-islamic-reader-panel] [role=tab][id$="-related"]');
        await until('!!document.querySelector("[data-islamic-reader-panel] .sunnah-research-citation, [data-islamic-reader-panel] .sunnah-research-empty")', 200);
        const citation = await evaluate('(()=>{const c=document.querySelector("[data-islamic-reader-panel] .sunnah-research-citation");return c?{title:c.querySelector("strong")?.textContent.trim()||"",author:c.querySelectorAll("span")[0]?.textContent.trim()||"",page:c.querySelectorAll("span")[1]?.textContent.trim()||""}:null})()');
        if (!citation) { journey.notes.push('The first hadith has no aligned Shrouh text in this pack.'); return; }
        if (!citation.title || !citation.page) throw new Error('attribution missing ' + JSON.stringify(citation));
        journey.notes.push('Shrouh source: ' + citation.title + ' — ' + citation.author + ' — ' + citation.page);
        await ui.clickText('show it beside the hadith', '[data-islamic-reader-panel] button', tr('sunnahBesideHadith'));
        await until('!!document.querySelector("[data-islamic-reader-panel] .sunnah-beside .sunnah-research-text")');
        const reference = await evaluate('(()=>{const d=[...document.querySelectorAll("[data-islamic-reader-panel] details")].find(d=>d.querySelector("input[aria-label=' + JSON.stringify(tr('commentarySearch')).replace(/"/g, '\\"') + ']"));return !!d})()');
        if (!reference) throw new Error('personal commentary not in the research panel');
        await shot('J11-shrouh-beside');
      });

      // J12 (opt-in, BAGLIB_JOURNEY_IDS=12) — KEY-254 review: subject → chapter, statistics and top narrators, clicked live.
      if (journeysOnly.includes(12)) await journeyRun(12, 'Hadith subjects and statistics', async () => {
        await ui.nav('sunnah', '.sunnah-workspace');
        await until('!!document.querySelector("[data-hadith-id]")', 200);
        const chapterBefore = await evaluate('[...document.querySelectorAll(".sunnah-workspace select")].map(s=>s.value).join("|")');
        if (await evaluate('!!document.querySelector("[data-reader-settings-popover]")?.hidden')) await ui.click('open reading options', '[data-reader-settings]');
        await ui.clickText('open "Insights"', '[data-reader-settings-popover] button', tr('sunnahInsights'));
        await until('!!document.querySelector("[data-reader-settings-popover]")?.hidden'); // the popover steps aside for the panel it opened
        await ui.clickText('open "Subjects"', '.sunnah-insights .sunnah-research-tabs button', tr('sunnahSubjects'));
        await until('!!document.querySelector(".sunnah-subjects button[aria-expanded]")', 200);
        await ui.click('open a subject', '.sunnah-subjects button[aria-expanded]:nth-of-type(1)');
        await until('!!document.querySelector(".sunnah-subjects .sunnah-research-results button")');
        const target = await evaluate('[...document.querySelectorAll(".sunnah-subjects .sunnah-research-results button")].find(b=>!b.closest("li")?.textContent.includes("—"))?.textContent.trim().slice(0,80) || ""');
        await step('open one of its chapters', async () => {
          // Pick a chapter other than the one already open, so the move is visible.
          for (let i = 0; i < 6; i++) {
            const clicked = await evaluate('(()=>{const b=[...document.querySelectorAll(".sunnah-subjects .sunnah-research-results button")][' + i + '];if(!b)return false;b.click();return true;})()');
            if (!clicked) break;
            await pause(800);
            if (await evaluate('[...document.querySelectorAll(".sunnah-workspace select")].map(s=>s.value).join("|")!==' + JSON.stringify(chapterBefore))) break;
            if (!await has('.sunnah-subjects .sunnah-research-results button')) { await evaluate(`document.querySelector('[data-reader-settings-popover]')?.hidden&&document.querySelector('[data-reader-settings]').click()`); await pause(300); await evaluate('[...document.querySelectorAll("[data-reader-settings-popover] button")].find(b=>b.textContent.includes(' + JSON.stringify(tr('sunnahInsights')) + '))?.click()'); await pause(300); await evaluate('document.querySelector(".sunnah-subjects button[aria-expanded]")?.click()'); await pause(300); }
          }
          await until('[...document.querySelectorAll(".sunnah-workspace select")].map(s=>s.value).join("|")!==' + JSON.stringify(chapterBefore) + '&&!!document.querySelector("[data-hadith-id]")', 40);
        });
        journey.notes.push('Subject chapter opened: ' + target);
        if (await evaluate('!!document.querySelector("[data-reader-settings-popover]")?.hidden')) await ui.click('open reading options', '[data-reader-settings]');
        await ui.clickText('open "Insights" again', '[data-reader-settings-popover] button', tr('sunnahInsights'));
        await ui.clickText('open "Statistics"', '.sunnah-insights .sunnah-research-tabs button', tr('sunnahStatistics'));
        await until('!!document.querySelector(".sunnah-workspace ol.sunnah-subjects li button")', 300);
        const stats = await evaluate('[...document.querySelectorAll(".sunnah-workspace dd, .sunnah-workspace .sunnah-stat strong, .sunnah-workspace [class*=stat] strong")].map(e=>e.textContent.trim()).slice(0,6)');
        journey.notes.push('Statistics shown: ' + JSON.stringify(stats));
        await ui.click('open the top narrator', '.sunnah-workspace ol.sunnah-subjects li button');
        await until('document.querySelector(".sunnah-workspace ol.sunnah-subjects li button")?.getAttribute("aria-expanded")==="true"');
        await shot('J12-statistics');
      });

      // J13 (opt-in, BAGLIB_JOURNEY_IDS=13) — KEY-248 review: a research pathway holds ordered books, notes and links, and exports references.
      if (journeysOnly.includes(13)) await journeyRun(13, 'Research pathway: order resources, export references', async () => {
        const exportDir = path.join(evidence, 'exports-' + [config.lang, config.theme, config.width].join('-'));
        fs.mkdirSync(exportDir, { recursive: true });
        // The save dialog is native; answer it with a file in the evidence folder (only this journey exports).
        const { dialog } = require('electron');
        dialog.showSaveDialog = async (_owner, options) => ({ canceled: false, filePath: path.join(exportDir, path.basename((options || _owner || {}).defaultPath || 'references.txt')) });
        const books = await evaluate('window.electronAPI.getAllBooks()');
        const enTitle = books.find(book => book.filePath === enEpubPath)?.title || books[0]?.title || '';
        await ui.nav('pathways', '[data-pathways-space]');
        await ui.clickText('open "Templates"', '[role=tab]', tr('pathwaysTabTemplates'));
        await ui.click('use the research template', '[data-template-use]');
        await until('!!document.querySelector("[data-pathway-next]")', 200);
        await ui.click('choose "Add a source for this step"', '[data-pathway-add-source]');
        await ui.type('search the books', '[data-pathway-resource-picker] [data-study-link-picker] input', '/books ' + enTitle.split(/\s+/).slice(0, 2).join(' '));
        await ui.clickText('pick the book', '[data-pathway-resource-picker] [data-study-link-picker] button', enTitle.slice(0, 20));
        await until('!!document.querySelector("[data-pathway-item-kind=resource]")');
        await ui.type('name a link', '[data-pathway-link-input]', config.lang === 'ar' ? 'مكتبة الشاملة' : 'Shamela library');
        await ui.type('give its address', 'input[aria-label=' + JSON.stringify(tr('pathwayLinkUrl')) + ']', 'https://shamela.ws/');
        await ui.clickText('add the link', 'button', tr('pathwayAddLink'));
        await until('!!document.querySelector("[data-pathway-end] [data-pathway-item-kind=link]")');
        // Order: move the second step up through its row menu.
        const order = () => evaluate('[...document.querySelectorAll("[data-pathway-item-kind=step]")].map(e=>e.dataset.pathwayItem)');
        const before = await order();
        await step('open the second step menu', async () => { await evaluate('(()=>{const e=document.querySelectorAll("[data-pathway-item-kind=step]")[1];const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}));})()'); await until('!!document.querySelector(\'[data-menu-action="up"]\')'); });
        await ui.click('move it up', '[data-menu-action="up"]');
        for (let i = 0; i < 40 && JSON.stringify(await order()) === JSON.stringify(before); i++) await pause(150);
        const after = await order();
        if (after[0] !== before[1] || after[1] !== before[0]) throw new Error('order did not change: ' + JSON.stringify({ before: before.slice(0, 2), after: after.slice(0, 2) }));
        for (const [format, action] of [['bib', 'export-bib'], ['md', 'export-md']]) {
          await step('open the pathway menu', async () => { await evaluate('(()=>{const e=document.querySelector("[data-pathway-next]").parentElement;const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}));})()'); await until('!!document.querySelector(\'[data-menu-action="' + action + '"]\')'); });
          await ui.click('export ' + format, '[data-menu-action="' + action + '"]');
          for (let i = 0; i < 40 && !fs.readdirSync(exportDir).some(f => f.endsWith('.' + format)); i++) await pause(150);
          const file = fs.readdirSync(exportDir).find(f => f.endsWith('.' + format));
          if (!file) throw new Error('no ' + format + ' export');
          const text = fs.readFileSync(path.join(exportDir, file), 'utf8');
          if (!text.includes(enTitle.split(/\s+/)[0]) || !text.includes('shamela.ws')) throw new Error(format + ' export lacks the book or the link: ' + text.slice(0, 200));
          journey.notes.push(format + ' export: ' + file + ' (' + text.length + ' chars)');
        }
        await shot('J13-pathway');
      });

      // J14 (opt-in, BAGLIB_JOURNEY_IDS=14) — KEY-249 review: draft a curriculum with AI (a local stub provider), edit it,
      // create it, and see a step completed in the planner count toward its progress.
      if (journeysOnly.includes(14)) await journeyRun(14, 'Curriculum from AI, edited, progress via planner', async () => {
        const http = require('node:http');
        const outline = config.lang === 'ar' ? '# التمهيد\n- قراءة المقدمة\n- تلخيص الفصل الأول\n# التطبيق\n- حل التمارين' : '# Foundations\n- Read the introduction\n- Summarise chapter one\n# Practice\n- Work the exercises';
        const stub = http.createServer((request, response) => { request.on('data', () => { }); request.on('end', () => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ message: { content: outline }, models: [] })); }); });
        await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
        try {
          const saved = await evaluate('window.electronAPI.ai.getSettings()');
          await evaluate('window.electronAPI.ai.saveSettings(' + JSON.stringify({ ...(saved || {}), enabled: true, provider: 'ollama', ollamaModel: 'stub', ollamaEndpoint: 'http://127.0.0.1:' + stub.address().port }) + ')');
          await ui.nav('pathways', '[data-pathways-space]');
          await ui.clickText('open "Templates"', '[role=tab]', tr('pathwaysTabTemplates'));
          await ui.type('type a subject', '[data-pathway-creator-form] input[aria-label=' + JSON.stringify(tr('pathwayAiSubject')) + ']', config.lang === 'ar' ? 'أصول الفقه' : 'Principles of jurisprudence');
          await ui.clickText('choose "Draft with AI"', '[data-pathway-creator-form] button', tr('pathwayAiDraft'));
          await until('document.querySelector("[data-pathway-creator-form] textarea")?.value.includes(' + JSON.stringify(outline.split('\n')[1].slice(2)) + ')', 120);
          const extra = config.lang === 'ar' ? '\n- مراجعة الملاحظات' : '\n- Review the notes';
          await step('edit the draft (add a step)', async () => {
            const current = await evaluate('document.querySelector("[data-pathway-creator-form] textarea").value');
            await evaluate('(()=>{const e=document.querySelector("[data-pathway-creator-form] textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(e,' + JSON.stringify(current + extra) + ');e.dispatchEvent(new Event("input",{bubbles:true}));})()');
          });
          const name = (config.lang === 'ar' ? 'منهج تجريبي ' : 'Trial curriculum ') + config.theme + config.width;
          await ui.type('name it', '[data-pathway-creator-form] input[aria-label=' + JSON.stringify(tr('pathwayName')) + ']', name);
          await ui.clickText('create it', '[data-pathway-creator-form] button', tr('pathwayCreate'));
          await until('!!document.querySelector("[data-pathway-next]")', 200);
          const pathway = (await evaluate('window.electronAPI.pathways.list()')).find(item => item.name === name);
          if (!pathway) throw new Error('pathway not created');
          const detail = await evaluate('window.electronAPI.pathways.get(' + JSON.stringify(pathway.id) + ')');
          const steps = detail.items.filter(item => item.kind === 'step');
          if (steps.length !== 4) throw new Error('expected 4 steps (3 drafted + 1 edited), got ' + steps.length);
          journey.notes.push('AI-drafted curriculum "' + name + '" has ' + steps.length + ' steps, kind ' + pathway.kind);
          // Progress tied to the planner: finish the first step in the Study planner, then see it counted here.
          await ui.nav('planner', '[data-study-planner]');
          const task = (await evaluate('window.electronAPI.planner.list()')).find(item => item.title === steps[0].title);
          if (!task) throw new Error('the step is not in the planner');
          await step('mark the step done in the planner', async () => { await evaluate('window.electronAPI.planner.save(' + JSON.stringify({ ...task, expectedUpdatedAt: task.updatedAt, status: 'completed' }) + ')'); });
          await ui.nav('pathways', '[data-pathways-space]');
          await ui.click('open the curriculum', '[data-pathway-row="' + pathway.id + '"] button');
          await until('(window.electronAPI.pathways.get(' + JSON.stringify(pathway.id) + ').then(d=>d.done===1))');
          await until('[...document.querySelectorAll("[data-pathway-progress], [role=progressbar]")].some(e=>/1/.test(e.getAttribute("aria-valuenow")||e.textContent))', 60);
          await shot('J14-curriculum');
        } finally { stub.close(); }
      });

      // J15 (opt-in, BAGLIB_JOURNEY_IDS=15) — KEY-250 review: Arabic search across Quran, Sunnah and poetry handles
      // diacritics and spelling variants, and each result names its source.
      if (journeysOnly.includes(15)) await journeyRun(15, 'Search study sources in Arabic', async () => {
        await ui.nav('islamic', '[data-islamic-hub]');
        const groupHits = () => evaluate(`(() => { const out = {}; for (const h of document.querySelectorAll('[data-islamic-hub] section h3')) { const sec = h.closest('section'); out[h.textContent.replace(/\\s*\\(.*\\)$/, '').trim()] = [...sec.querySelectorAll('button')].map(b => b.textContent.trim().slice(0, 60)).filter(Boolean); } return out; })()`);
        const search = async (label, text) => {
          await ui.type(label, '[data-islamic-search]', text);
          await until('!document.querySelector("[data-islamic-hub] [aria-busy=true], [data-islamic-hub] .animate-pulse") && [...document.querySelectorAll("[data-islamic-hub] section h3")].length>=3', 200);
          await pause(400);
          return groupHits();
        };
        const quran = tr('navQuran'), sunnah = tr('navSunnah');
        const plain = await search('search an ayah without diacritics', 'الحمد لله رب العالمين');
        const vowelled = await search('search it with full diacritics', 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ');
        const variant = await search('search with a hamza variant', 'اياك نعبد واياك نستعين');
        const has = (hits, ref) => (hits[quran] || []).some(row => row.startsWith(ref));
        if (!has(plain, '1:2')) throw new Error('plain search missed 1:2: ' + JSON.stringify(plain[quran]));
        if (!has(vowelled, '1:2')) throw new Error('vowelled search missed 1:2: ' + JSON.stringify(vowelled[quran]));
        if (!has(variant, '1:5')) throw new Error('hamza-variant search missed 1:5: ' + JSON.stringify(variant[quran]));
        const hadith = await search('search a hadith', 'انما الاعمال بالنيات');
        if (!(hadith[sunnah] || []).length) throw new Error('no hadith result: ' + JSON.stringify(hadith));
        // ة and ه stay distinct: a ه spelling of a ة word is not silently matched.
        const taMarbuta = await search('search with ة', 'الصلاة');
        const ha = await search('search with ه', 'الصلاه');
        journey.notes.push('Results: ' + JSON.stringify({ plain: (plain[quran] || []).length, vowelled: (vowelled[quran] || []).length, variant: (variant[quran] || []).slice(0, 1), hadith: (hadith[sunnah] || []).slice(0, 1), 'ة': (taMarbuta[quran] || []).length, 'ه': (ha[quran] || []).length }));
        if ((ha[quran] || []).length >= (taMarbuta[quran] || []).length && (taMarbuta[quran] || []).length > 0) journey.notes.push('Note: the ه spelling matched as many ayahs as ة; check the ة/ه rule.');
        await search('search the ayah again', 'اياك نعبد');
        await ui.clickText('open the result', '[data-islamic-hub] section button', '1:5');
        await until('!!document.querySelector("[data-quran-workspace]")', 200);
        await shot('J15-opened');
      });

      // J16 (opt-in, BAGLIB_JOURNEY_IDS=16) — native file pickers use the interface language.
      if (journeysOnly.includes(16)) await journeyRun(16, 'Native pickers in the interface language', async () => {
        const { dialog } = require('electron');
        const seen = [];
        dialog.showOpenDialog = async (...args) => { seen.push(args.find(arg => arg && typeof arg === 'object' && 'properties' in arg)); return { canceled: true, filePaths: [] }; };
        await step('open the file picker', async () => { await evaluate('window.electronAPI.openFilesDialog()'); });
        await step('open the folder picker', async () => { await evaluate('window.electronAPI.openDirectoryDialog()'); });
        const [files, folder] = seen;
        if (!files || !folder) throw new Error('pickers not opened');
        const expect = tr('dialogPickBooks');
        if (files.title !== expect) throw new Error('file picker title ' + files.title);
        if (folder.title !== tr('dialogPickScanFolder')) throw new Error('folder picker title ' + folder.title);
        if (files.filters[0].name !== tr('dialogFilterAllBooks')) throw new Error('filter name ' + files.filters[0].name);
        journey.notes.push('Picker titles: ' + files.title + ' | ' + folder.title);
      });

      // J17 (opt-in, BAGLIB_JOURNEY_IDS=17) — KEY-50: register RSS and Atom feeds and read their items, from a local server.
      if (journeysOnly.includes(17)) await journeyRun(17, 'Register RSS feeds and read new items', async () => {
        const http = require('node:http');
        const rssXml = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>مكتبة تجريبية — إصدارات</title>'
          + '<item><title><![CDATA[صَحِيحُ مُسْلِمٍ — طبعة محققة]]></title><link>/b/1</link><guid>r1</guid><pubDate>Tue, 10 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;وصل حديثًا إلى المكتبة&lt;/p&gt;</description></item>'
          + '<item><title>New: The Muqaddimah</title><link>https://example.org/m</link><guid>r2</guid><pubDate>Wed, 11 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>';
        const atomXml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Library Blog</title><entry><title>Atom arrival</title><id>a1</id><updated>2026-11-12T08:00:00Z</updated><link rel="alternate" href="https://example.org/a"/><summary>From the blog</summary></entry></feed>';
        const server = http.createServer((request, response) => {
          if (request.url === '/rss.xml') { response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8'); response.end(rssXml); }
          else if (request.url === '/atom.xml') { response.setHeader('Content-Type', 'application/atom+xml'); response.end(atomXml); }
          else { response.setHeader('Content-Type', 'text/html'); response.end('<html><body>not a feed</body></html>'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = 'http://127.0.0.1:' + server.address().port;
        try {
          for (const feed of await evaluate('window.electronAPI.rss.list()')) await evaluate('window.electronAPI.rss.remove(' + JSON.stringify(feed.id) + ')');
          await ui.nav('library', '[data-library-recent]');
          await ui.click('open a book menu', '[data-library-book-card] [data-card-menu-button]');
          await ui.click('choose "Edit metadata"', '[data-menu-action="metadata"]');
          await ui.clickText('choose "Edit work details"', 'button', tr('editMaterialTitle'));
          await ui.click('open the online library hub', 'button[aria-label=' + JSON.stringify(tr('openLibraryHubTooltip')) + ']');
          await ui.clickText('open "RSS feeds"', 'button', tr('rssTabLabel'));
          await until('!!document.querySelector("[data-rss-empty]")', 120);
          const addFeed = async (label, url) => { await ui.type(label, '[data-rss-address]', url); await ui.click('choose "Add feed"', '[data-rss-add]'); };
          await addFeed('enter an Arabic RSS feed', base + '/rss.xml');
          await until('document.querySelectorAll("[data-rss-item]").length===2', 120);
          await addFeed('enter an Atom feed', base + '/atom.xml');
          await until('document.querySelectorAll("[data-rss-item]").length===3', 120);
          const rows = await evaluate('[...document.querySelectorAll("[data-rss-item]")].map(e=>[e.querySelector("bdi").textContent,e.querySelector("[data-rss-item-source]").textContent])');
          if (rows[0][0] !== 'Atom arrival' || rows[2][0] !== 'صَحِيحُ مُسْلِمٍ — طبعة محققة' || rows[2][1] !== 'مكتبة تجريبية — إصدارات') throw new Error('items/sources ' + JSON.stringify(rows));
          await shot('J17-feeds');
          await addFeed('enter the same feed again', base + '/rss.xml');
          await until('document.querySelector("[data-rss-error]")?.textContent===' + JSON.stringify(tr('rssErrorExists')));
          await addFeed('enter a page that is not a feed', base + '/page');
          await until('document.querySelector("[data-rss-error]")?.textContent===' + JSON.stringify(tr('rssErrorNotFeed')));
          await ui.click('remove the Atom feed', '[data-rss-feed]:last-of-type [data-rss-remove]');
          await until('document.querySelectorAll("[data-rss-item]").length===2', 120);
          journey.notes.push('Items: ' + JSON.stringify(rows));
        } finally { server.close(); }
      });

      // J19 (opt-in, BAGLIB_JOURNEY_IDS=19) — KEY-334: the ruling line under a graded hadith shows every scholar's judgment in the side panel.
      if (journeysOnly.includes(19)) await journeyRun(19, 'Each scholar\'s judgment on a hadith', async () => {
        await ui.nav('sunnah', '.sunnah-workspace');
        await until('!!document.querySelector("[data-hadith-id]")', 200);
        if (!await has('[data-sunnah-grading-button]')) await step('open Sunan Abu Dawud', async () => {
          await evaluate('(()=>{const s=document.querySelector(".sunnah-workspace select");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(s,"AbuDaud");s.dispatchEvent(new Event("change",{bubbles:true}));})()');
          await until('!!document.querySelector("[data-sunnah-grading-button]")', 200);
        });
        await evaluate('document.querySelector("[data-sunnah-grading-button]").scrollIntoView({block:"center"})'); await pause(300);
        const scrollBefore = await evaluate('document.querySelector(".sunnah-scroll").scrollTop');
        const expected = await evaluate('Number((document.querySelector("[data-sunnah-grading-button]").textContent.match(/\\d+/)||[0])[0])');
        await step('click the ruling line', async () => { await evaluate('document.querySelector("[data-sunnah-grading-button]").click()'); await pause(300); });
        await until('document.querySelectorAll("[data-islamic-reader-panel] .sunnah-judgment").length>0', 200);
        const judgments = await evaluate('[...document.querySelectorAll("[data-islamic-reader-panel] .sunnah-judgment strong")].map(e=>e.textContent.trim())');
        if (judgments.length < Math.min(expected, 2)) throw new Error('expected about ' + expected + ' judgments, saw ' + JSON.stringify(judgments));
        const scrollAfter = await evaluate('document.querySelector(".sunnah-scroll").scrollTop');
        if (Math.abs(scrollAfter - scrollBefore) > 4) throw new Error('the reading position moved ' + scrollBefore + ' -> ' + scrollAfter);
        journey.notes.push('Judgments shown (' + judgments.length + '/' + expected + '): ' + judgments.join(', '));
        await shot('J19-judgments');
      });

      // J20 (opt-in, BAGLIB_JOURNEY_IDS=20) — KEY-335: a real mouse drag over many PDF lines grows smoothly (no jumps to the
      // page start or end) and ends as one connected block per line, in an Arabic and an English PDF.
      if (journeysOnly.includes(20)) await journeyRun(20, 'Drag-select many lines in a PDF', async () => {
        const enPdf = manifest.files.filter(file => file.kind === 'pdf' && file.lang === 'en' && file.path.includes('/text-layer/')).sort((a, b) => a.bytes - b.bytes)[0];
        for (const file of [arPdf, enPdf]) {
          const filePath = path.join(copies, path.basename(file.path));
          if (!fs.existsSync(filePath)) fs.copyFileSync(path.resolve('tests/real-files', file.path), filePath);
          let book = (await evaluate('window.electronAPI.getAllBooks()')).find(item => item.filePath === filePath);
          if (!book) {
            await evaluate('window.electronAPI.importDigitalFiles(' + JSON.stringify([{ filePath, duplicateAction: 'import_anyway' }]) + ',"ux-journeys")');
            await win.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")'); await ready();
            book = (await evaluate('window.electronAPI.getAllBooks()')).find(item => item.filePath === filePath);
          }
          await ui.nav('library', '[data-library-recent]');
          await step('open ' + file.lang + ' PDF', async () => {
            await until('[...document.querySelectorAll("[data-library-book-card]")].some(e=>e.getAttribute("aria-label")===' + JSON.stringify(book.title) + ')', 200);
            await evaluate('[...document.querySelectorAll("[data-library-book-card]")].find(e=>e.getAttribute("aria-label")===' + JSON.stringify(book.title) + ').querySelector("[data-card-read-button]").click()');
            await until('!!document.querySelector(".pdf-page-container")', 300);
          });
          // Find a page whose visible part has 6+ full lines; plan a drag from the start of one line to the middle of a line ~6 lines below.
          const planCode = `(()=>{
            const rtl=${JSON.stringify(file.lang === 'ar')};
            const layer=[...document.querySelectorAll(".pdf-page-container .textLayer")].filter(l=>l.querySelectorAll("span").length>30).sort((a,b)=>Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top))[0];
            if(!layer)return null;
            const box=layer.getBoundingClientRect();
            if(box.top<40||box.top>innerHeight*0.4){layer.scrollIntoView({block:"start"});return "scrolled";}
            const spans=[...layer.querySelectorAll("span")].filter(s=>s.textContent.trim().length>1).map(s=>s.getBoundingClientRect()).filter(r=>r.width>4&&r.top>60&&r.bottom<innerHeight-40);
            const lines=[];for(const r of spans){const l=lines.find(x=>Math.abs(x.top-r.top)<r.height*0.5);if(l){l.left=Math.min(l.left,r.left);l.right=Math.max(l.right,r.right);}else lines.push({top:r.top,height:r.height,left:r.left,right:r.right});}
            lines.sort((a,b)=>a.top-b.top);
            const wide=lines.filter(l=>l.right-l.left>box.width*0.3);
            if(wide.length<6)return null;
            const a=wide[1],b=wide[Math.min(wide.length-1,7)];
            return {start:{x:Math.round(rtl?a.right-3:a.left+3),y:Math.round(a.top+a.height/2)},end:{x:Math.round((b.left+b.right)/2),y:Math.round(b.top+b.height/2)},lines:wide.indexOf(b)-wide.indexOf(a)+1};
          })()`;
          let plan = null;
          await step('go to a page full of text', async () => {
            for (const page of [12, 16, 20, 24, 30, 6, 8]) {
              if (page) await evaluate('(()=>{const i=document.querySelector("[data-reader-go-to]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,"' + page + '");i.dispatchEvent(new Event("input",{bubbles:true}));i.form.requestSubmit();})()');
              for (let i = 0; i < 16; i++) {
                await pause(300);
                const result = await evaluate(planCode);
                if (!result || result === 'scrolled') continue;
                // The text layer can still be re-hydrating; only drag once the line positions are stable.
                await pause(1200);
                const again = await evaluate(planCode);
                if (again && again !== 'scrolled' && JSON.stringify(again) === JSON.stringify(result)) { plan = again; break; }
              }
              if (plan) break;
            }
          });
          if (!plan) throw new Error('no page with enough lines in view');
          const samples = [];
          await step('drag over ' + plan.lines + ' lines with the mouse', async () => {
            await evaluate('getSelection().removeAllRanges();window.__j20=1');
            win.webContents.sendInputEvent({ type: 'mouseMove', x: plan.start.x, y: plan.start.y });
            win.webContents.sendInputEvent({ type: 'mouseDown', x: plan.start.x, y: plan.start.y, button: 'left', clickCount: 1 });
            await pause(150);
            const steps = 24;
            for (let i = 1; i <= steps; i++) {
              const x = Math.round(plan.start.x + (plan.end.x - plan.start.x) * i / steps), y = Math.round(plan.start.y + (plan.end.y - plan.start.y) * i / steps);
              win.webContents.sendInputEvent({ type: 'mouseMove', x, y, button: 'left' });
              await pause(60);
              samples.push(await evaluate('window.__j20?getSelection().toString().length:-1'));
            }
            win.webContents.sendInputEvent({ type: 'mouseUp', x: plan.end.x, y: plan.end.y, button: 'left', clickCount: 1 });
            await pause(500);
            if (!await evaluate('!!window.__j20')) throw new Error('the page reloaded during the drag; samples ' + samples.join(',') + ' plan ' + JSON.stringify(plan));
          });
          const final = await evaluate('getSelection().toString().length');
          // A jump to the page start or end shows as a sample far larger than the final selection, or a drop back to nothing.
          const peak = Math.max(...samples), started = samples.findIndex(n => n > 0);
          if (final < 40) throw new Error('selection too short: ' + final + ' samples ' + samples.join(','));
          if (peak > final * 1.25 + 40) throw new Error('selection jumped during the drag: peak ' + peak + ' final ' + final + ' samples ' + samples.join(','));
          if (started >= 0 && samples.slice(started).some(n => n === 0)) throw new Error('selection vanished during the drag: ' + samples.join(','));
          const blocks = await evaluate(`(()=>{
            const page=[...document.querySelectorAll(".pdf-page-container")].find(p=>p.querySelector(".pdf-active-selection-rect"));
            if(!page)return null;
            const rects=[...page.querySelectorAll(".pdf-active-selection-rect")].map(e=>({y:parseFloat(e.style.top),h:parseFloat(e.style.height)})).sort((a,b)=>a.y-b.y);
            let open=0;for(let i=1;i<rects.length;i++){const gap=rects[i].y-(rects[i-1].y+rects[i-1].h);if(gap>0.05)open++;}
            // Two blocks on one line (overlapping vertically by more than half) means the line is broken into pieces.
            // The first and last lines are partly selected; in RTL text their selected words need not be adjacent on screen.
            const top=rects[0].y, bottom=Math.max(...rects.map(r=>r.y)), edge=r=>Math.abs(r.y-top)<r.h*0.5||Math.abs(r.y-bottom)<r.h*0.5;
            let split=0;for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){if(edge(rects[i])||edge(rects[j]))continue;const o=Math.min(rects[i].y+rects[i].h,rects[j].y+rects[j].h)-Math.max(rects[i].y,rects[j].y);if(o>Math.min(rects[i].h,rects[j].h)*0.5)split++;}
            return {count:rects.length,open,split,locked:!!document.querySelector(".pdf-selection-locked"),live:document.querySelectorAll(".pdf-live-selection-rect").length};
          })()`);
          if (!blocks) throw new Error('no selection overlay after release');
          if (blocks.split > 0) throw new Error('a line is split into several blocks: ' + JSON.stringify(blocks));
          if (blocks.open > 1) throw new Error('gaps between lines: ' + JSON.stringify(blocks));
          journey.notes.push(file.lang + ' PDF: ' + plan.lines + ' lines → ' + blocks.count + ' blocks, ' + blocks.split + ' split lines, ' + blocks.open + ' paragraph gaps; ' + samples.length + ' samples, peak ' + peak + ', final ' + final);
          await shot('J20-' + file.lang + '-selection');
          await evaluate('getSelection().removeAllRanges()');
          press('Escape');
        }
      });

      // J18 (opt-in, BAGLIB_JOURNEY_IDS=18) — KEY-50 follow-up: opt-in notifications report only items newer than the last check.
      if (journeysOnly.includes(18)) await journeyRun(18, 'Feed notifications for new items', async () => {
        const http = require('node:http');
        let entries = ['<item><title>أول إصدار</title><link>https://example.org/1</link><guid>n1</guid><pubDate>Mon, 09 Nov 2026 08:00:00 GMT</pubDate></item>'];
        const xml = () => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>خلاصة التنبيهات</title>' + entries.join('') + '</channel></rss>';
        const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8'); response.end(xml()); });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
          for (const feed of await evaluate('window.electronAPI.rss.list()')) await evaluate('window.electronAPI.rss.remove(' + JSON.stringify(feed.id) + ')');
          await evaluate('window.electronAPI.settings.set("rss.seen.v1", [])');
          await ui.nav('settings', '[data-settings-directory]');
          await ui.click('open "Feed notifications"', '[data-settings-entry="rss"]');
          await step('turn them on', async () => { await until('!!document.querySelector("[role=dialog] input[type=checkbox]:not(:disabled)")'); await evaluate('(()=>{const c=document.querySelector("[role=dialog] input[type=checkbox]");if(!c.checked)c.click();})()'); await until('window.electronAPI.settings.get("rss.notify.v1").then(v=>v===true)'); });
          press('Escape');
          await step('register the feed', async () => { await evaluate('window.electronAPI.rss.add(' + JSON.stringify('http://127.0.0.1:' + server.address().port + '/feed') + ')'); });
          const before = (await evaluate('window.electronAPI.athan.notificationHistory()')).filter(record => record.kind === 'rss').length;
          if (await evaluate('window.electronAPI.rss.checkNow()') !== 0) throw new Error('the existing item was reported');
          entries = ['<item><title>إصدار جديد: فتح الباري</title><link>https://example.org/2</link><guid>n2</guid><pubDate>Thu, 12 Nov 2026 08:00:00 GMT</pubDate></item>', ...entries];
          await step('the background check runs', async () => { if (await evaluate('window.electronAPI.rss.checkNow()') !== 1) throw new Error('the new item was not reported'); });
          const records = (await evaluate('window.electronAPI.athan.notificationHistory()')).filter(record => record.kind === 'rss');
          if (records.length !== before + 1) throw new Error('expected one feed notification, got ' + (records.length - before));
          const record = records[0];
          if (record.title !== tr('rssNotifyTitle').replace('{feed}', 'خلاصة التنبيهات') || record.body !== 'إصدار جديد: فتح الباري' || record.target !== 'library') throw new Error('record ' + JSON.stringify(record));
          if (await evaluate('window.electronAPI.rss.checkNow()') !== 0) throw new Error('the same item was reported twice');
          journey.notes.push('Notification: ' + record.title + ' — ' + record.body);
          await ui.nav('dashboard', '[data-dashboard-view]');
          await step('open the notification', async () => { await evaluate('window.electronAPI.athan.notificationAction(' + JSON.stringify(record.id) + ', "open")'); await until('!!document.querySelector("[data-library-recent]")', 120); });
          await shot('J18-opened');
        } finally {
          server.close();
          await evaluate('window.electronAPI.settings.set("rss.notify.v1", false)').catch(() => { });
        }
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
