// KEY-415 live check (one language per launch, window off-screen per KEY-408):
//   a real lecture → "Add this moment to a list" → Starred holds media:<id>:<seconds>;
//   a real PDF → page 57 (or its last page) → reader menu "Add this page to a list" → Starred holds book:<id>#p=57;
//   a note opened from a list → its star in the editor → Starred holds note:<id>;
//   the Lists hub shows the three kinds; each item reopens at its place → no renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_LISTKINDS_PROFILE;
const evidence = process.env.BAGLIB_LISTKINDS_EVIDENCE;
const language = process.env.BAGLIB_LISTKINDS_LANG || 'ar';
const files = JSON.parse(process.env.BAGLIB_LISTKINDS_FILES);

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
  const starred = () => evaluate(`window.electronAPI.personalLists.invoke('items', 'starred').then(r=>r.data.map(i=>[i.itemKind,i.itemRef,i.label]))`);
  const openHubStarred = async () => {
    await click('[data-nav-item="notes"]');
    await until(`!!document.querySelector('button[data-notes-tab="lists"]')`);
    await click('button[data-notes-tab="lists"]');
    await until(`!!document.querySelector('[data-lists-open="starred"]')`);
    await click('[data-lists-open="starred"]');
  };
  const addToStarredFromDialog = async kind => {
    await until(`!!document.querySelector('[data-add-place-dialog=${JSON.stringify(kind)}] [data-add-place-list="starred"]')`);
    await click('[data-add-place-list="starred"]');
    await until(`!!document.querySelector('[data-add-place-added]')`);
  };

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 920);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark');localStorage.setItem('baglib.lectures.layout','overlay')`);
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await loadApp();
    await until('!!window.electronAPI?.personalLists && !!document.querySelector("footer")');

    // Seed: the real PDF as a book, the real video as a lecture, and a note held in a custom list.
    const book = { id: 'listkinds-book', title: path.basename(files.pdf, '.pdf'), author: language === 'ar' ? 'مؤلف' : 'Author', bookType: 'digital', digitalFormat: 'PDF', filePath: files.pdf, categories: [], tags: [], lendingHistory: [] };
    await evaluate(`window.electronAPI.addBook(${JSON.stringify(book)})`);
    await evaluate(`window.electronAPI.lectures.addPaths(${JSON.stringify([files.video])})`);
    const lecture = (await evaluate('window.electronAPI.lectures.list()')).find(l => l.path === files.video);
    assert.ok(lecture, 'the real video was added as a lecture');
    const noteTitle = language === 'ar' ? 'ملاحظة عن الصبر' : 'A note on patience';
    const note = await evaluate(`window.electronAPI.studyNotes.save({ title: ${JSON.stringify(noteTitle)}, content: ${JSON.stringify(noteTitle + '\n\n' + (language === 'ar' ? 'نصّ الملاحظة.' : 'Note body.'))}, aliases: [], tags: [] })`);
    const reading = await evaluate(`window.electronAPI.personalLists.invoke('create', ${JSON.stringify(language === 'ar' ? 'للمراجعة' : 'To review')}).then(r=>r.data)`);
    await evaluate(`window.electronAPI.personalLists.invoke('add', ${JSON.stringify(reading.id)}, { itemKind: 'note', itemRef: 'note:${note.id}', label: ${JSON.stringify(noteTitle)} })`);
    await loadApp();
    await until('!!document.querySelector("[data-nav-item=lectures]")');

    // 1. A lecture moment.
    await click('[data-nav-item="lectures"]');
    await until(`!!document.querySelector('[data-lecture-select]')`);
    await click('[data-lecture-select]');
    await until(`(()=>{const v=document.querySelector('[data-lecture-player]');return !!v && v.readyState>=1 && v.duration>0;})()`, 200);
    const seconds = await evaluate(`(()=>{const v=document.querySelector('[data-lecture-player]');v.pause();v.currentTime=Math.min(754, Math.floor(v.duration/2));return Math.floor(v.currentTime);})()`);
    await until(`!!document.querySelector('[data-lecture-add-to-list]')`);
    await click('[data-lecture-add-to-list]');
    results.dialogDir = await evaluate(`getComputedStyle(document.querySelector('[data-add-place-dialog]')).direction`);
    assert.equal(results.dialogDir, language === 'ar' ? 'rtl' : 'ltr');
    await addToStarredFromDialog('lecture');
    await shot('01-lecture-moment-added');
    await click('[data-add-place-close]');
    results.lectureRef = `media:${lecture.id}:${seconds}`;
    assert.ok((await starred()).some(([kind, ref]) => kind === 'lecture' && ref === results.lectureRef), `Starred holds ${results.lectureRef}`);

    // 2. An exact page of the real PDF, from the reader's menu.
    await click('[data-nav-item="library"]');
    await until(`!!document.querySelector('[data-library-book-card] [data-card-read-button]')`);
    // Lectures are works too, so pick the PDF's own card by its title.
    await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-library-book-card]')].find(e=>e.textContent.includes(${JSON.stringify(book.title)}));card.querySelector('[data-card-read-button]').click();})()`);
    await until(`!!document.querySelector('[data-pdf-header-more]')`, 300);
    // Page 57, or the last page of a shorter PDF.
    await until(`Number(document.querySelector('[data-reader-go-to]').getAttribute('aria-valuemax'))>1`, 300);
    const target = String(Math.min(57, Number(await evaluate(`document.querySelector('[data-reader-go-to]').getAttribute('aria-valuemax')`))));
    results.targetPage = target;
    await evaluate(`(()=>{const input=document.querySelector('[data-reader-go-to]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,${JSON.stringify(target)});input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();})()`);
    await until(`document.querySelector('[data-reader-go-to]').getAttribute('aria-valuenow')===${JSON.stringify(target)}`);
    results.readerPage = await evaluate(`document.querySelector('[data-reader-go-to]').getAttribute('aria-valuenow')`);
    await click('[data-pdf-header-more]');
    await until(`!!document.querySelector('[data-baglib-menu] [data-menu-action="reader-add-page-to-list"]')`);
    await click('[data-baglib-menu] [data-menu-action="reader-add-page-to-list"]');
    await addToStarredFromDialog('page');
    await shot('02-page-added');
    await click('[data-add-place-close]');
    // Leave the reader on page 1, so reopening from the list must move it back to the saved page.
    await evaluate(`(()=>{const input=document.querySelector('[data-reader-go-to]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();})()`);
    await until(`document.querySelector('[data-reader-go-to]').getAttribute('aria-valuenow')==='1'`);
    await pause(1500);
    const pageItem = (await starred()).find(([kind]) => kind === 'page');
    assert.ok(pageItem, 'Starred holds a page');
    results.pageRef = pageItem[1];
    // The reference also names the file source the reader opened, so the right edition reopens.
    assert.match(results.pageRef, new RegExp(`^book:${book.id}(@[0-9a-f-]{36})?#p=${results.readerPage}$`));
    assert.equal(results.readerPage, target, 'the reader went to the target page');

    // 3. The note: open it from its list, then star it in the editor.
    await openHubStarred();
    await click(`[data-lists-open=${JSON.stringify(reading.id)}]`);
    await until(`!!document.querySelector('[data-lists-item-open="note:${note.id}"]')`);
    await click(`[data-lists-item-open="note:${note.id}"]`);
    await until(`!!document.querySelector('[data-note-editor-pane] [data-list-star="note:${note.id}"]')`, 200);
    results.noteTitleShown = await evaluate(`document.querySelector('[data-note-editor-title]').value`);
    assert.equal(results.noteTitleShown, noteTitle, 'the list opened the whole note');
    await click(`[data-note-editor-pane] [data-list-star="note:${note.id}"]`);
    await until(`document.querySelector('[data-note-editor-pane] [data-list-star="note:${note.id}"]').getAttribute('aria-pressed')==='true'`);
    await shot('03-note-starred');
    assert.ok((await starred()).some(([kind, ref]) => kind === 'note' && ref === `note:${note.id}`), 'Starred holds the note');

    // 4. The hub shows the three kinds; each reopens at its place.
    await openHubStarred();
    await until(`document.querySelectorAll('[data-lists-item]').length === 3`);
    for (const kind of ['lecture', 'note', 'page']) await until(`!!document.querySelector('[data-lists-kind=${JSON.stringify(kind)}]')`);
    results.hubDir = await evaluate(`getComputedStyle(document.querySelector('[data-personal-lists-hub]')).direction`);
    assert.equal(results.hubDir, language === 'ar' ? 'rtl' : 'ltr');
    await shot('04-hub-three-kinds');

    await click(`[data-lists-item-open=${JSON.stringify(results.lectureRef)}]`);
    await until(`(()=>{const v=document.querySelector('[data-lecture-player]');return !!v && v.readyState>=1 && Math.abs(v.currentTime-${seconds})<2;})()`, 200);
    results.lectureReopenedAt = await evaluate(`Math.floor(document.querySelector('[data-lecture-player]').currentTime)`);
    await evaluate(`document.querySelector('[data-lecture-player]').pause()`);

    await openHubStarred();
    await until(`!!document.querySelector('[data-lists-item-open=${JSON.stringify(results.pageRef)}]')`);
    await click(`[data-lists-item-open=${JSON.stringify(results.pageRef)}]`);
    await until(`document.querySelector('[data-reader-go-to]')?.getAttribute('aria-valuenow')===${JSON.stringify(target)}`, 300);
    results.pageReopened = Number(target);
    await shot('05-page-reopened');

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon|reminder check failed/iu.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[list-kinds-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[list-kinds-live-${language}] FAILED`, error);
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
