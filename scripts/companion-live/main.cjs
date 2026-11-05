const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_COMPANION_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(directory, 'درس.wav')] });
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const labels = {
  ar: { library: 'المكتبة', read: 'قراءة', lectures: 'المحاضرات', sunnah: 'السنة النبوية', add: 'إضافة ملفات' },
  en: { library: 'Library', read: 'Read', lectures: 'Lectures', sunnah: 'Sunnah', add: 'Add files' },
};
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const press = (keyCode, modifiers = []) => { owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  const type = async text => { await pause(250); owner.webContents.insertText(text); await pause(250); };
  const pane = '[data-companion-pane]';
  const paneValue = () => evaluate(`document.querySelector('${pane} [data-study-note-editor]')?.value ?? null`);
  const nav = label => evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}).click()`);
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
  };
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.addBook');
    await evaluate(`window.electronAPI.addBook({id:'companion-book',title:'كتاب الصبر — Patience',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, 'book.pdf'))}})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate("localStorage.removeItem('baglib.companion.v1')");
      await evaluate("window.electronAPI.settings.set('companion.draft.v1',{content:'',title:'',tagsInput:'',aliasesInput:'',workId:''})");
      await load(language);
      // Reader: open the book, then the side note with Ctrl+Shift+M.
      await nav(labels[language].library);
      await until(`[...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(labels[language].read)}||b.textContent.trim()===${JSON.stringify(labels[language].read)})`);
      await evaluate(`(()=>{const read=${JSON.stringify(labels[language].read)};const isRead=b=>b.title===read||b.textContent.trim()===read;const title=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.includes('Patience'));let node=title;while(node&&![...node.querySelectorAll('button')].some(isRead))node=node.parentElement;[...node.querySelectorAll('button')].find(isRead).click();})()`);
      await until("document.querySelectorAll('.textLayer span').length > 0", 300);
      result.toggleShown = await evaluate("!!document.querySelector('[data-companion-toggle]')");
      for (let attempt = 0; attempt < 5 && !(await evaluate(`!!document.querySelector('${pane}')`)); attempt++) { owner.webContents.focus(); press('M', ['control', 'shift']); await pause(800); }
      await until(`!!document.querySelector('${pane} [data-study-note-editor] .cm-content')`);
      result.place = await evaluate(`document.querySelector('${pane} [data-companion-place]').textContent`);
      // The pane is really on screen above the full-window reader, and the reader ends where the pane starts.
      result.paneVisible = await evaluate(`(()=>{const r=document.querySelector('${pane}').getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);const reader=document.querySelector('[role=region][class*="fixed"]').getBoundingClientRect();return !!hit&&!!hit.closest('${pane}')&&(Math.abs(reader.right-r.left)<2||Math.abs(reader.left-r.right)<2);})()`);
      // Select text on the PDF page and send it with a link to the page.
      await evaluate("(()=>{const span=[...document.querySelectorAll('.textLayer span')].find(s=>s.textContent.trim().length>3);const r=document.createRange();r.selectNodeContents(span);const s=getSelection();s.removeAllRanges();s.addRange(r);})()");
      await evaluate(`document.querySelector('${pane} [data-companion-quote]').click()`);
      await until(`(document.querySelector('${pane} [data-study-note-editor]')?.value||'').includes('book:companion-book#p=1')`);
      result.afterQuote = await paneValue();
      await shot(`reader-${language}-1280`);
      // Lectures: the same note stays open; new lines start with the playback time.
      await nav(labels[language].lectures);
      await until(`!!document.querySelector('${pane}')`);
      result.keptAcrossViews = (await paneValue())?.includes('book:companion-book#p=1') ?? false;
      await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(labels[language].add)}||b.textContent.includes('درس'))`);
      if (!(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('درس'))"))) {
        await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(labels[language].add)}).click()`);
      }
      await until("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('درس'))");
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('درس')).click()");
      await until('!!document.querySelector("video, audio")');
      // The player resumes the saved position once the media loads; let that settle, then seek.
      await until("document.querySelector('video, audio').readyState>=1"); await pause(1500);
      await evaluate("(()=>{const m=document.querySelector('video, audio');m.muted=true;m.pause();m.currentTime=12;})()");
      await until("Math.round(document.querySelector('video, audio').currentTime)===12"); await pause(500);
      await until("Math.round(document.querySelector('video, audio').currentTime)===12");
      await until(`!!document.querySelector('${pane} [data-companion-stamp]')`);
      result.stampChecked = await evaluate(`document.querySelector('${pane} [data-companion-stamp]').checked`);
      await evaluate(`(()=>{const c=document.querySelector('${pane} .cm-content');c.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);})()`);
      await pause(200); press('Enter'); await type(language === 'ar' ? 'فائدة من الدرس' : 'Point from the lecture');
      await evaluate(`document.querySelector('${pane} [data-companion-link]').click()`); await pause(400);
      result.afterLecture = await paneValue();
      await shot(`lecture-${language}-1280`);
      // Sunnah: a link to the hadith on screen.
      await nav(labels[language].sunnah);
      await until(`!!document.querySelector('${pane} [data-companion-place]') && document.querySelector('${pane} [data-companion-link]') && !document.querySelector('${pane} [data-companion-link]').disabled`, 200);
      result.hadithPlace = await evaluate(`document.querySelector('${pane} [data-companion-place]').textContent`);
      await evaluate(`(()=>{const c=document.querySelector('${pane} .cm-content');c.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);})()`);
      await evaluate(`document.querySelector('${pane} [data-companion-link]').click()`); await pause(400);
      result.afterHadith = await paneValue();
      // Save: the pane keeps editing the saved note.
      await evaluate(`document.querySelector('${pane} [data-scratchpad-save]').click()`);
      await until(`document.querySelector('${pane} [data-companion-note]').value!==''`, 100);
      const savedId = await evaluate(`document.querySelector('${pane} [data-companion-note]').value`);
      const saved = await evaluate(`window.electronAPI.studyNotes.list().then(n=>n.find(x=>x.id===${JSON.stringify(savedId)}))`);
      result.savedContent = saved?.content;
      await until(`(document.querySelector('${pane} [data-study-note-editor]')?.value||'').includes('sunnah:')`);
      // A second save of the same note works (fresh revision after the first).
      await type(' ');
      await evaluate(`document.querySelector('${pane} [data-study-note-editor]').value+='\\n${language === 'ar' ? 'سطر بعد الحفظ' : 'line after saving'}'`); await pause(300);
      await evaluate(`document.querySelector('${pane} [data-scratchpad-save]').click()`); await pause(1200);
      result.secondSave = (await evaluate(`window.electronAPI.studyNotes.list().then(n=>n.find(x=>x.id===${JSON.stringify(savedId)}).content)`)).includes(language === 'ar' ? 'سطر بعد الحفظ' : 'line after saving');
      await shot(`sunnah-${language}-1280`);
      // Close and reopen with the edge tab; narrow window.
      await evaluate(`document.querySelector('${pane} header button').click()`);
      await until(`!document.querySelector('${pane}') && !!document.querySelector('[data-companion-toggle]')`);
      await evaluate("document.querySelector('[data-companion-toggle]').click()");
      await until(`!!document.querySelector('${pane}')`);
      await until(`document.querySelector('${pane} [data-companion-note]').value===${JSON.stringify(savedId)}`, 50).catch(() => {});
      result.reopenedNote = await evaluate(`document.querySelector('${pane} [data-companion-note]').value`) === savedId;
      owner.setContentSize(800, 900); await pause(800); await shot(`sunnah-${language}-800`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.toggleShown, true); assert.equal(result.paneVisible, true);
      assert.match(result.place, /\(1\)/u);
      assert.match(result.afterQuote, /^> .+ \[\[book:companion-book#p=1\|كتاب الصبر — Patience \(1\)\]\]/u);
      assert.equal(result.keptAcrossViews, true);
      assert.equal(result.stampChecked, true);
      assert.match(result.afterLecture, /\n\[\[media:[0-9a-f-]{36}:12\|0:12\]\] (فائدة من الدرس|Point from the lecture) \[\[media:[0-9a-f-]{36}:12\|[^\]]+· 0:12\]\] $/u);
      assert.ok(result.hadithPlace.length > 5);
      assert.match(result.afterHadith, /\[\[sunnah:[^\]|]+\|[^\]]+\]\] $/u);
      assert.ok(result.savedContent && result.savedContent.includes('sunnah:') && result.savedContent.includes('media:'), 'saved');
      assert.equal(result.secondSave, true); assert.equal(result.reopenedNote, true);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|codemirror/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
