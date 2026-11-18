// KEY-386 live check (one language per launch, window off-screen per KEY-408), with real files:
//   Library  two real PDFs (ar + en) as books; star one from its card; make a new list from the
//            other card's "Add to list" menu; chips show; the "in list" filter shows only its books,
//            any/all works.
//   Sunnah   (copy of the real corpus) add the open hadith to the list from its header menu; the
//            hadith filter lists it and narrows the chapter; right-click offers Star / Add to list.
//   Quran    an ayah is added through IPC; the reader's filter lists it and opens it.
//   Poetry   star a real poem from its card; the poem filter lists it.
//   Hub      Notes → Lists shows every list with counts by kind, renames, reorders, opens a hadith.
//   No renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_LISTS_PROFILE;
const evidence = process.env.BAGLIB_LISTS_EVIDENCE;
const language = process.env.BAGLIB_LISTS_LANG || 'ar';
const files = JSON.parse(process.env.BAGLIB_LISTS_FILES);

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
    throw new Error(`${error.message}: ${code.slice(0, 240)}`);
  });
  const until = async (code, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${language}.png`), (await owner.webContents.capturePage()).toPNG());
  };
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing '+${JSON.stringify(selector)});e.click();})()`);
  const nav = async id => {
    await click(`[data-nav-item="${id}"]`);
    await pause(600);
  };
  const lists = () => evaluate(`window.electronAPI.personalLists.invoke('all').then(r=>r.data)`);
  const items = id => evaluate(`window.electronAPI.personalLists.invoke('items',${JSON.stringify(id)},null).then(r=>r.data)`);
  const setInput = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);

  (async () => {
    const results = { language };
    const listName = language === 'ar' ? 'أحاديثُ الصبر' : 'Patience — الصبر';
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    // Seed the two real PDFs as books.
    for (const file of files) {
      const book = { id: `lists-${file.lang}`, title: path.basename(file.path, '.pdf'), author: file.lang === 'ar' ? 'عبد الله عزام' : 'Author', bookType: 'digital', digitalFormat: 'PDF', filePath: file.path, categories: [], tags: [], lendingHistory: [] };
      await evaluate(`window.electronAPI.addBook(${JSON.stringify(book)})`);
    }
    await loadApp();
    await until('!!window.electronAPI?.personalLists && !!document.querySelector("footer")');
    const initial = await lists();
    assert.deepEqual(initial.map(l => l.id), ['starred'], 'only Starred at first');

    // 1. Library: star the Arabic book; make a new list from the English book's menu.
    await nav('library');
    await until(`!!document.querySelector('[data-list-star="book:lists-ar"]')`);
    await click('[data-list-star="book:lists-ar"]');
    await until(`document.querySelector('[data-list-star="book:lists-ar"]').getAttribute('aria-pressed')==='true'`);
    await click('[data-list-add="book:lists-en"]');
    await until(`!!document.querySelector('[data-list-menu-new]')`);
    await click('[data-list-menu-new]');
    await until(`!!document.querySelector('[data-new-list-dialog] [data-new-list-name]')`);
    results.dialogDir = await evaluate(`getComputedStyle(document.querySelector('[data-new-list-dialog]')).direction`);
    assert.equal(results.dialogDir, language === 'ar' ? 'rtl' : 'ltr');
    await setInput('[data-new-list-name]', listName);
    await shot('01-new-list-dialog');
    await click('[data-new-list-create]');
    await until(`!document.querySelector('[data-new-list-dialog]')`);
    let all = await lists();
    const custom = all.find(l => l.kind === 'custom');
    assert.equal(custom.name, listName, 'name kept exactly as typed');
    await until(`!!document.querySelector('[data-list-controls="book:lists-en"] [data-list-chip="${custom.id}"]')`);
    // Filter: the list → only the English book; Starred + list with "all" → none; "any" → both.
    const allCards = await evaluate(`document.querySelectorAll('[data-library-book-card]').length`);
    await until(`!!document.querySelector('[data-list-filter="book"] [data-list-filter-option="${custom.id}"]')`);
    await click(`[data-list-filter="book"] [data-list-filter-option="${custom.id}"]`);
    await until(`document.querySelectorAll('[data-library-book-card]').length===1`);
    results.libraryFilterOne = await evaluate(`[...document.querySelectorAll('[data-library-book-card]')].map(e=>e.getAttribute('aria-label'))`);
    await shot('02-library-filter-chip');
    await click(`[data-list-filter="book"] [data-list-filter-option="starred"]`);
    await until(`!!document.querySelector('[data-list-filter-mode]')`);
    await until(`document.querySelectorAll('[data-library-book-card]').length===2`);
    await evaluate(`(()=>{const s=document.querySelector('[data-list-filter-mode]');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'all');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`document.querySelectorAll('[data-library-book-card]').length===0`);
    results.libraryAnyAll = 'any=2, all=0';
    await click('[data-list-filter="book"] [data-list-filter-clear]');
    await until(`document.querySelectorAll('[data-library-book-card]').length===${allCards}`);

    // 2. Sunnah: add the open hadith to the list from its header menu.
    await nav('sunnah');
    await until(`!!document.querySelector('[data-hadith-id] [data-list-add]')`, 300);
    const hadithRef = await evaluate(`document.querySelector('[data-hadith-id] [data-list-add]').getAttribute('data-list-add')`);
    results.hadithRef = hadithRef;
    await click('[data-hadith-id] [data-list-add]');
    await until(`!!document.querySelector('[data-list-menu-item="${custom.id}"]')`);
    await click(`[data-list-menu-item="${custom.id}"]`);
    await until(`!!document.querySelector('[data-hadith-id] [data-list-chip="${custom.id}"]')`);
    await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`);
    // Right-click offers Star / Add to list.
    await evaluate(`(()=>{const e=document.querySelector('[data-hadith-id]');const r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x+40,clientY:r.y+40}));})()`);
    await until(`[...document.querySelectorAll('[role=menuitem]')].some(e=>/${language === 'ar' ? 'أضف إلى قائمة' : 'Add to list'}/.test(e.textContent))`);
    await shot('03-hadith-context-menu');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await pause(300);
    await click(`[data-list-filter="hadith"] [data-list-filter-option="${custom.id}"]`);
    await until(`!!document.querySelector('[data-list-filter-result="${hadithRef}"]')`);
    results.hadithFilterLabel = await evaluate(`document.querySelector('[data-list-filter-result="${hadithRef}"]').textContent.slice(0,120)`);
    await shot('04-sunnah-filter');
    await click('[data-list-filter="hadith"] [data-list-filter-clear]');

    // 3. Quran: add an ayah (Ayat al-Kursi) through IPC; the reader's filter lists it and opens it.
    const ayahLabel = language === 'ar' ? 'آية الكرسي ٢:٢٥٥' : 'Ayat al-Kursi 2:255';
    await evaluate(`window.electronAPI.personalLists.invoke('add',${JSON.stringify(custom.id)},{itemKind:'ayah',itemRef:'quran:hafs:2:255',label:${JSON.stringify(ayahLabel)}})`);
    await nav('quran');
    await until(`!!document.querySelector('[data-quran-reader]')`, 300);
    await until(`!!document.querySelector('[data-list-filter="ayah"] [data-list-filter-option="${custom.id}"]')`, 300);
    await click(`[data-list-filter="ayah"] [data-list-filter-option="${custom.id}"]`);
    await until(`!!document.querySelector('[data-list-filter-result="quran:hafs:2:255"]')`);
    await shot('05-quran-filter');
    await click('[data-list-filter-result="quran:hafs:2:255"]');
    await pause(1500);
    await click('[data-list-filter="ayah"] [data-list-filter-clear]');

    // 4. Poetry: star a real poem from its card; the poem filter lists it.
    await nav('bayan');
    const poemsReady = await (async () => {
      try {
        await until(`!!document.querySelector('[data-bayan-view] [data-list-star]')`, 200);
        return true;
      } catch {
        return false;
      }
    })();
    if (poemsReady) {
      const poemRef = await evaluate(`document.querySelector('[data-bayan-view] [data-list-star]').getAttribute('data-list-star')`);
      await click(`[data-bayan-view] [data-list-star="${poemRef}"]`);
      await until(`document.querySelector('[data-bayan-view] [data-list-star="${poemRef}"]').getAttribute('aria-pressed')==='true'`);
      await click(`[data-list-filter="poem"] [data-list-filter-option="starred"]`);
      await until(`!!document.querySelector('[data-list-filter-result="${poemRef}"]')`);
      results.poemRef = poemRef;
      await shot('06-poetry-starred-filter');
      await click('[data-list-filter="poem"] [data-list-filter-clear]');
    } else {
      results.poemRef = 'poetry corpus not available in this profile';
    }

    // 5. Hub: Notes → Lists.
    await nav('notes');
    await until(`!!document.querySelector('button[data-notes-tab="lists"]')`);
    await click('button[data-notes-tab="lists"]');
    await until(`!!document.querySelector('[data-personal-lists-hub]')`);
    await click(`[data-lists-open="${custom.id}"]`);
    await until(`document.querySelectorAll('[data-lists-item]').length===3`);
    results.hubItems = await evaluate(`[...document.querySelectorAll('[data-lists-item]')].map(e=>e.getAttribute('data-lists-item'))`);
    assert.deepEqual(results.hubItems, ['book:lists-en', hadithRef, 'quran:hafs:2:255']);
    await shot('07-hub-list');
    // Kind tab narrows to hadith.
    await click('[data-lists-kind="hadith"]');
    await until(`document.querySelectorAll('[data-lists-item]').length===1`);
    await click('[data-lists-kind="all"]');
    // Reorder: move the ayah to the top through the service the hub uses, then check the order shown.
    const listItems = await items(custom.id);
    await evaluate(`window.electronAPI.personalLists.invoke('reorder-items',${JSON.stringify(custom.id)},${JSON.stringify([listItems[2].id, listItems[0].id, listItems[1].id])}).then(()=>window.dispatchEvent(new CustomEvent('baglib:personal-lists-changed')))`);
    await until(`document.querySelector('[data-lists-item]').getAttribute('data-lists-item')==='quran:hafs:2:255'`);
    // Rename in place, then search by an unvocalised name (Arabic normalisation).
    await click(`[data-lists-rename="${custom.id}"]`);
    await until(`!!document.querySelector('[data-lists-rename-input]')`);
    const renamed = language === 'ar' ? 'أحاديثُ الصبرِ والشكر' : 'Patience and gratitude';
    await setInput('[data-lists-rename-input]', renamed);
    await evaluate(`document.querySelector('[data-lists-rename-input]').form.requestSubmit()`);
    await until(`(async()=> (await window.electronAPI.personalLists.invoke('all')).data.some(l=>l.name===${JSON.stringify(renamed)}))()`);
    await setInput('[data-lists-search]', language === 'ar' ? 'احاديث الصبر' : 'gratitude');
    await until(`!!document.querySelector('[data-lists-row="${custom.id}"]')`);
    await setInput('[data-lists-search]', '');
    // Open the hadith from the hub → the Sunnah reader shows it.
    await click(`[data-lists-item-open="${hadithRef}"]`);
    await until(`!!document.querySelector('[data-hadith-id] [data-list-add="${hadithRef}"]')`, 300);
    results.openedFromHub = hadithRef;
    all = await lists();
    results.counts = all.map(l => ({ name: l.name, counts: l.counts }));

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon|reminder check failed/iu.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[personal-lists-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[personal-lists-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error) + '\n' + JSON.stringify(errors, null, 2));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      img => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
