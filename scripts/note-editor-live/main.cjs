const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_EDITOR_LIVE_DIR;
const hasQuran = process.env.BAGLIB_EDITOR_QURAN_AVAILABLE !== '0';
const hasPoetry = process.env.BAGLIB_EDITOR_POETRY_AVAILABLE !== '0';
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  // KEY-317: scratchpad and first-run guide for throwaway profiles.
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && Promise.all([window.electronAPI.settings.set('onboarding.v1',{seen:true}), window.electronAPI.settings.get('dashboard.layout.v1').then(v => v ? null : window.electronAPI.settings.set('dashboard.layout.v1',{version:1,modules:[{id:'today',visible:true},{id:'calendar',visible:true},{id:'readingGoals',visible:false},{id:'activeReads',visible:false},{id:'studyProgress',visible:false},{id:'studyInsights',visible:false},{id:'scratchpad',visible:true},{id:'athan',visible:false},{id:'khatmah',visible:false},{id:'studyRhythm',visible:false}]}))])").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const press = (keyCode, modifiers = []) => { owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  // Key presses go through Chromium's input queue while insertText applies at once, so a press could land after
  // text typed just after it. Waiting first keeps the order a person would produce.
  const type = async text => { await pause(250); owner.webContents.insertText(text); await pause(250); };
  const value = () => evaluate("document.querySelector('[data-study-note-editor]').value");
  const navigateHome = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await owner.loadURL('http://localhost:3000'); return; } catch (error) { if (attempt === 4) throw error; await pause(500); }
    }
  };
  const load = async language => { owner.setContentSize(1280, 900); await until('!!window.electronAPI && !!document.querySelector("footer")', 200); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await navigateHome(); await until('!!window.electronAPI && !!document.querySelector("[data-study-note-editor] .cm-content")', 200); await pause(800); };
  const settle = () => pause(1500);
  // Since KEY-304 the Notes page is a list plus an editor; a saved note's links render in its preview.
  const openSavedNote = async id => {
    await evaluate("document.querySelector('[data-nav-item=\"notes\"]').click()");
    await until(`!!document.querySelector('[data-study-note="${id}"]')`);
    await evaluate(`document.querySelector('[data-study-note="${id}"]').click()`);
    await until("!!document.querySelector('[data-note-preview-toggle]')");
    await evaluate("(()=>{const b=document.querySelector('[data-note-preview-toggle]');if(b.getAttribute('data-note-preview-toggle')==='edit')b.click();})()");
    await until(`[...document.querySelectorAll('[data-note-preview="${id}"] button')].some(b=>b.textContent==='رياض الصالحين (3)')`);
  };
  // Real mouse moves onto a link until its preview card has loaded (moves can be dropped while the page lays out).
  const hover = async box => {
    for (let attempt = 0; attempt < 5; attempt++) {
      owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x - 40, y: box.y - 40 }); await pause(150);
      owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y });
      try { await until("!!document.querySelector('[data-study-link-preview]') && !document.querySelector('[data-study-link-preview]').textContent.includes('…')", 20); return; } catch { /* move again */ }
    }
    throw new Error('Timed out: preview card');
  };
  const closed = () => until("!document.querySelector('.cm-tooltip-autocomplete')", 50).catch(() => {});
  const options = () => evaluate("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map(li=>li.textContent)");
  (async () => {
    const results = {};
    const skipped = [];
    await load('en');
    await evaluate(`window.electronAPI.addBook({id:'editor-book',title:'رياض الصالحين',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'pages.pdf'))}})`);
    await evaluate(`window.electronAPI.studyNotes.save({id:'patience-note',title:'الصبر عند البلاء',content:'الصبر ضياء',aliases:['patience'],tags:[],expectedRevision:0})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate("document.querySelector('[data-study-note-editor]').value=''");
      await evaluate("document.querySelector('[data-study-note-editor] .cm-content').focus()");
      // Arabic line with full tashkeel, then a link to the saved note through [[ suggestions.
      await type('وَالصَّبْرُ ضِيَاءٌ ');
      await type('[[الصب');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0"); await settle();
      result.noteOptions = await options();
      press('Enter'); await pause(300); await closed();
      // An ayah from a typed reference, with Arabic-Indic digits.
      press('Enter'); await type('[[٢:٢٥٥-٢٥٧');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
      result.ayahOptions = await options();
      press('Enter'); await pause(300); await closed();
      // A book by title.
      press('Enter'); await type('[[رياض#٣');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0"); await settle();
      press('Enter'); await pause(300);
      // An English line, bolded with Ctrl+B.
      press('Enter'); await type('Patience is light.');
      press('Home', ['shift']); await pause(150);
      result.selected = await evaluate('getSelection().toString()');
      press('B', ['control']); await pause(300);
      // Slash commands: an honorific and today's date.
      press('End'); press('Enter'); await type('/sal');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
      result.slashOptions = await options();
      press('Enter'); await pause(300);
      await pause(300); press('Enter'); await pause(200); await type('/date');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
      press('Enter'); await pause(300);
      // /quran and /hadith insert the text itself with its reference.
      if (hasQuran) {
        await pause(300); press('Enter'); await pause(200); await type('/قرآن');
        await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
        press('Enter'); await pause(300); await type('2:255');
        await until("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].some(li=>li.textContent.includes('2:255'))", 100);
        press('Enter'); await pause(400);
      } else {
        console.log('SKIPPED: no installed Quran pack');
        skipped.push(`${language}:quran-slash-quote`);
      }
      press('End'); press('Enter'); await pause(200); await type('/hadith');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
      press('Enter'); await pause(300); await type('إنما الأعمال بالنيات');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0", 150);
      await settle(); result.hadithOptions = await options();
      press('Enter'); await pause(400);
      // /poem inserts verses with their poet and poem link.
      if (hasPoetry) {
        press('End'); press('Enter'); await pause(200); await type('/شعر');
        await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
        press('Enter'); await pause(300); await type('قفا نبك');
        await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0", 150);
        await settle(); result.poemOptions = await options();
        press('Enter'); await pause(400); await closed();
        // Plain [[ search also finds poems.
        press('End'); press('Enter'); await pause(200); await type('[[قفا نبك');
        await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0", 150);
        await settle(); result.poemLinkOptions = await options();
        press('Escape'); await pause(200);
        await evaluate("(()=>{const view=document.querySelector('[data-study-note-editor]');view.value=view.value.replace(/\\n\\[\\[قفا نبك$/u,'');})()");
      } else {
        console.log('SKIPPED: no installed poetry partition');
        skipped.push(`${language}:poetry-slash-and-search`);
      }
      // Plain [[ search also finds ayahs by words.
      if (hasQuran) {
        press('End'); press('Enter'); await pause(200); await type('[[الحمد لله رب العالمين');
        await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0", 100);
        await settle(); result.wordSearchOptions = await options();
        result.quranProbe = await evaluate("window.electronAPI.quran.readerCatalog().then(c=>{const s=c.ok&&c.data.sources.find(x=>x.kind==='script'&&x.profile==='hafs');return s?window.electronAPI.quran.searchAyahs({script:s.id,text:'الحمد لله رب العالمين'}).then(r=>JSON.stringify(r).slice(0,200)):'no script';})");
        press('Escape'); await pause(200);
        await evaluate("(()=>{const view=document.querySelector('[data-study-note-editor]');view.value=view.value.replace(/\\n\\[\\[الحمد لله رب العالمين$/u,'');})()");
      } else {
        console.log('SKIPPED: no installed Quran pack');
        skipped.push(`${language}:quran-word-search`);
      }
      result.text = await value();
      // Live preview: lines without the cursor show only the link label.
      result.previewLines = await evaluate("[...document.querySelectorAll('[data-study-note-editor] .cm-line')].slice(0,3).map(line=>line.textContent)");
      // Visual direction: where the text sits inside its line box (start edge for that line's own direction).
      result.lineDirections = await evaluate("[...document.querySelectorAll('[data-study-note-editor] .cm-line')].map(line=>{const range=document.createRange();range.selectNodeContents(line);const text=range.getBoundingClientRect();const box=line.getBoundingClientRect();return Math.abs(text.right-box.right)<Math.abs(text.left-box.left)?'rtl':'ltr';})");
      result.editorDir = await evaluate("document.querySelector('[data-study-note-editor]').getAttribute('dir')");
      // Arabic diacritics: the first line's text box must fit inside the line box.
      result.linkSpans = await evaluate("document.querySelectorAll('[data-study-note-editor] .cm-study-link').length");
      result.firstLineFits = await evaluate("(()=>{const line=document.querySelector('[data-study-note-editor] .cm-line');const range=document.createRange();range.selectNodeContents(line);const text=range.getBoundingClientRect();const box=line.getBoundingClientRect();return text.top>=box.top-1&&text.bottom<=box.bottom+1;})()");
      await shot(`editor-${language}-1280`);
      // Ctrl+S saves through the existing save path.
      press('S', ['control']);
      await until("window.electronAPI.studyNotes.list().then(notes=>notes.some(n=>n.content.includes('quran:hafs:2:255')))");
      const saved = await evaluate("window.electronAPI.studyNotes.list().then(notes=>notes.find(n=>n.content.includes('quran:hafs:2:255')))");
      result.savedTitle = saved.title;
      result.cleared = (await value()) === '';
      // Callouts and footnotes in the rendered preview.
      await evaluate("document.querySelector('[data-study-note-editor]').value='> [!ayah] آية الكرسي\\n> نص\\nقول[^1]\\n[^1]: المصدر'");
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(language === 'ar' ? 'معاينة Markdown' : 'Markdown Preview')})).click()`);
      await until("!!document.querySelector('[data-scratchpad-preview] [data-callout=ayah]')");
      result.callout = await evaluate("document.querySelector('[data-scratchpad-preview] [data-callout=ayah]').textContent");
      result.footnotes = await evaluate("[!!document.querySelector('[data-scratchpad-preview] [data-footnote-ref=\"1\"]'),!!document.querySelector('[data-scratchpad-preview] [data-footnote=\"1\"]')]");
      await shot(`callout-${language}-1280`);
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(language === 'ar' ? 'تحرير' : 'Edit')}))?.click()`);
      await evaluate("document.querySelector('[data-study-note-editor]')&&(document.querySelector('[data-study-note-editor]').value='')");
      // The page link opens the PDF at page 3 from the Notes view.
      await openSavedNote(saved.id);
      // Hover (focus) card on the ayah link shows its text without leaving the note.
      if (hasQuran) {
        const box = await evaluate(`(()=>{const el=document.querySelector('[data-note-preview] [data-study-link="quran:hafs:2:255"]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
        await hover(box);
        result.preview = await evaluate("document.querySelector('[data-study-link-preview]').textContent.slice(0,80)");
        await shot(`preview-${language}-1280`);
        owner.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 }); await pause(500);
      } else {
        console.log('SKIPPED: no installed Quran pack');
        skipped.push(`${language}:quran-hover-preview`);
      }
      // Poem link hover shows its verses.
      if (hasPoetry) {
        const poemBox = await evaluate(`(()=>{const el=document.querySelector('[data-note-preview] [data-study-link^="poetry:ashaar:"]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
        await hover(poemBox);
        result.poemPreview = await evaluate("document.querySelector('[data-study-link-preview]').textContent.slice(0,120)");
        await shot(`poem-preview-${language}-1280`);
        owner.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 }); await pause(200);
      } else {
        console.log('SKIPPED: no installed poetry partition');
        skipped.push(`${language}:poetry-hover-preview`);
      }
      await evaluate(`[...document.querySelectorAll('[data-note-preview] button')].find(b=>b.textContent==='رياض الصالحين (3)').click()`);
      await until("!!document.querySelector('.textLayer span')", 200);
      await pause(2600);
      result.openedPage = await evaluate("window.electronAPI.reader.getLastLocation('editor-book')");
      // Note from the book's annotations: two highlights, out of page order, become one note with page links.
      await evaluate(`Promise.all([window.electronAPI.saveAnnotation({bookId:'editor-book',type:'highlight',locationCfiOrPage:JSON.stringify({page:3,rects:[]}),selectedText:'Page three',noteContent:'Highlight on Page 3'}),window.electronAPI.saveAnnotation({bookId:'editor-book',type:'note',locationCfiOrPage:'1',selectedText:'Page one',noteContent:'${language === 'ar' ? 'فكرتي' : 'My thought'}'})])`);
      await load(language);
      await openSavedNote(saved.id);
      await evaluate(`[...document.querySelectorAll('[data-note-preview] button')].find(b=>b.textContent==='رياض الصالحين (3)').click()`);
      // The reader's annotations list opens from the header's "more" menu (Notes panel).
      await until("!!document.querySelector('[data-pdf-header-more]')", 150);
      await evaluate(`(async()=>{for(const more of document.querySelectorAll('[data-pdf-header-more]')){more.click();for(let i=0;i<20;i++){const item=[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.trim()===${JSON.stringify(language === 'ar' ? 'الملاحظات' : 'Notes')});if(item){item.click();return;}await new Promise(r=>setTimeout(r,100));}more.click();}throw new Error('no Notes item');})()`);
      await until("!!document.querySelector('[data-annotations-to-note]:not([disabled])')", 100);
      await evaluate("document.querySelector('[data-annotations-to-note]').click()");
      await until("!!document.querySelector('[data-notes-overview] [data-study-note-editor]') && document.querySelector('[data-notes-overview] [data-study-note-editor]')?.value?.includes('#p=3')", 100);
      result.annotationNote = await evaluate("document.querySelector('[data-notes-overview] [data-study-note-editor]').value");
      await shot(`annotation-note-${language}-1280`);
      // Leave no unsaved capture draft behind; BagLib merges an unsaved draft into the next capture by design.
      await evaluate("window.electronAPI.settings.set('study.capture.draft.v1',{content:'',title:'',tagsInput:'',aliasesInput:'',workId:''})");
      await evaluate("window.electronAPI.getAnnotations('editor-book').then(rows=>Promise.all(rows.map(row=>window.electronAPI.deleteAnnotation(row.id))))");
      await shot(`page-link-${language}-1280`);
      await load(language);
      owner.setContentSize(480, 900); await pause(600);
      await evaluate("document.querySelector('[data-study-note-editor]').scrollIntoView({block:'center'})");
      await evaluate("document.querySelector('[data-study-note-editor]').value='سطر عربي\\nEnglish line'"); await shot(`editor-${language}-480`);
      await evaluate("window.electronAPI.studyNotes.remove(" + JSON.stringify(saved.id) + ")");
      await evaluate("document.querySelector('[data-study-note-editor]').value=''");
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.ok(result.noteOptions[0].includes('الصبر عند البلاء'), 'note suggestion');
      assert.ok(result.ayahOptions[0].includes('2:255'), 'ayah suggestion');
      assert.match(result.text, /\[\[note:patience-note\|الصبر عند البلاء\]\]/u);
      assert.match(result.text, /\[\[quran:hafs:2:255-257\|2:255-257\]\]/u);
      // Book links carry the source after '@' (Work -> Edition -> Source).
      assert.match(result.text, /\[\[book:editor-book(?:@[^#|\]]+)?#p=3\|رياض الصالحين \(3\)\]\]/u);
      assert.match(result.text, /ﷺ/u); assert.match(result.text, /14\d\d|١٤[٠-٩]{2}/u);
      assert.deepEqual(result.previewLines.slice(1), ['2:255-257', 'رياض الصالحين (3)']);
      assert.ok(result.previewLines[0].endsWith('الصبر عند البلاء') && !result.previewLines[0].includes('note:'));
      assert.ok(result.linkSpans >= 3); assert.equal(result.openedPage, '3');
      assert.match(result.text, /\n> \[\[sunnah:[^\]|]+\|[^\]]+\]\]/u);
      assert.ok(result.hadithOptions.length > 0);
      if (hasQuran) {
        assert.match(result.text, /^> ﴿[^\n]+\(255\)﴾\n> \[\[quran:hafs:2:255\|2:255\]\]$/mu);
        assert.ok(result.wordSearchOptions.some(option => /1:2/u.test(option)));
        assert.match(result.quranProbe, /"surah":1,"ayah":2/u);
        assert.ok(result.preview.includes('2:255') && result.preview.length > 20);
      }
      if (hasPoetry) {
        assert.ok(result.poemOptions[0].startsWith('امرؤ القيس — قفا نبك'), 'the poem itself first');
        assert.match(result.text, /\n> [^\n]*\n?(?:> [^\n]*\n)*> \[\[poetry:ashaar:\d+:\d+:\d+\|[^\]]+\]\]/u);
        assert.ok(result.poemLinkOptions.some(option => /شعر|Poetry/u.test(option)), 'poem in [[ search');
        assert.ok(result.poemPreview.length > 20 && !/لا تتوفر|No preview/u.test(result.poemPreview), 'poem preview');
      }
      assert.ok(result.callout.length > 0); assert.deepEqual(result.footnotes, [true, true]);
      assert.equal(result.annotationNote.replace(/book:editor-book@[^#|\]]+/gu, 'book:editor-book'), `## رياض الصالحين\n\n> Page one [[book:editor-book#p=1|رياض الصالحين (1)]]\n\n${language === 'ar' ? 'فكرتي' : 'My thought'}\n\n> Page three [[book:editor-book#p=3|رياض الصالحين (3)]]`);
      assert.match(result.text, /\*\*Patience is light\.\*\*/u);
      assert.deepEqual(result.lineDirections.slice(0, 4), ['rtl', 'rtl', 'rtl', 'ltr']);
      assert.equal(result.firstLineFits, true); assert.equal(result.cleared, true);
    }
    assert.deepEqual(consoleLines.filter(line => /codemirror|cm-|uncaught/iu.test(line)), []);
    if (skipped.length > 0) {
      fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ passed: false, skipped, results }, null, 2));
      console.log(JSON.stringify({ directory, passed: false, skipped }));
      app.exit(2);
      return;
    }
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
