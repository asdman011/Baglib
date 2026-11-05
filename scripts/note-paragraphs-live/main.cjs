const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_PARAGRAPHS_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const FIRST = 'الصبر حبس النفس عن الجزع.\nوهو ثلاثة أنواع.';
const SOURCE = `${FIRST}\n\nالشكر قيد النعم ^thanks`;
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const press = (keyCode, modifiers = []) => { owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  // Key presses are queued while insertText applies at once; wait so typed text never overtakes a key.
  const type = async text => { await pause(250); owner.webContents.insertText(text); await pause(250); };
  const options = () => evaluate("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map(li=>li.textContent)");
  const editor = '[data-study-note-editor]';
  const source = () => evaluate("window.electronAPI.studyNotes.list().then(n=>n.find(x=>x.id==='source-note'))");
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until(`!!window.electronAPI && !!document.querySelector('${editor} .cm-content')`); await pause(800);
  };
  const notesView = async language => {
    await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'سجل الملاحظات' : 'Notes Log')}).click()`);
    await until("!!document.querySelector('[data-study-note=\"source-note\"]')");
  };
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    for (const language of ['ar', 'en']) {
      const result = {};
      // Reset: the source note goes back to its original text through a normal save (history keeps the rest).
      await evaluate(`window.electronAPI.studyNotes.list().then(async notes=>{for(const n of notes) if(n.id!=='source-note') await window.electronAPI.studyNotes.remove(n.id); const source=notes.find(n=>n.id==='source-note'); await window.electronAPI.studyNotes.save({id:'source-note',title:'الصبر والشكر',content:${JSON.stringify(SOURCE)},aliases:[],tags:[],expectedRevision:source?source.revision:0});})`);
      await load(language);
      const before = await source();
      await evaluate(`document.querySelector('${editor}').value=''`);
      await evaluate(`document.querySelector('${editor} .cm-content').focus()`);
      // 1. A paragraph without an anchor: found by its words, gets an anchor in its own note, text untouched.
      await type('[[حبس النفس');
      await until("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].length>0");
      await pause(1200);
      result.options = await options();
      press('Enter'); await pause(1500);
      const after = await source();
      result.anchorAdded = after.content;
      result.revisionStep = after.revision - before.revision;
      const anchor = /وهو ثلاثة أنواع\. \^([A-Za-z0-9]{6})/u.exec(after.content)?.[1];
      result.anchor = anchor;
      // 2. A paragraph that already has an anchor reuses it and leaves the note alone.
      press('Enter'); await type('[[الشكر قيد');
      await until("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].length>0");
      await pause(1200);
      press('Enter'); await pause(1200);
      result.secondRevisionStep = (await source()).revision - after.revision;
      // 3. An embed of one paragraph, and a link whose anchor does not exist.
      press('Enter'); await type('![[note:source-note#^thanks|embed]] [[note:source-note#^gone99|missing]]');
      result.text = await evaluate(`document.querySelector('${editor}').value`);
      // 4. Anchors in the editor are faint and deleted as one unit.
      await evaluate(`document.querySelector('${editor}').value='نص قصير ^abc123'`);
      await pause(300);
      result.faint = await evaluate(`!!document.querySelector('${editor} .cm-paragraph-anchor')`);
      await evaluate(`(()=>{const c=document.querySelector('${editor} .cm-content');c.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);})()`);
      await pause(200); press('Backspace'); await pause(300);
      result.afterBackspace = await evaluate(`document.querySelector('${editor}').value`);
      // Save the linking note through the scratchpad.
      await evaluate(`document.querySelector('${editor}').value=${JSON.stringify(result.text)}`);
      await pause(300);
      await evaluate("document.querySelector('[data-scratchpad-save]').click()");
      await until("window.electronAPI.studyNotes.list().then(n=>n.length===2)");
      await notesView(language);
      const linking = await evaluate("window.electronAPI.studyNotes.list().then(n=>n.find(x=>x.id!=='source-note').id)");
      const card = `[data-study-note="${linking}"]`;
      await until(`!!document.querySelector('${card} [data-embedded-note]')`);
      result.embed = await evaluate(`document.querySelector('${card} [data-embedded-note]').textContent`);
      result.sourceShownText = await evaluate("document.querySelector('[data-study-note=\"source-note\"]').textContent");
      // 5. Hover shows only the paragraph.
      const box = await evaluate(`(()=>{const el=document.querySelector('${card} [data-study-link="note:source-note#^${anchor}"]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
      for (let attempt = 0; attempt < 5; attempt++) {
        owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x - 40, y: box.y - 40 }); await pause(150);
        owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y });
        try { await until("!!document.querySelector('[data-study-link-preview]') && !document.querySelector('[data-study-link-preview]').textContent.includes('…')", 20); break; } catch {}
      }
      result.preview = await evaluate("document.querySelector('[data-study-link-preview]')?.textContent");
      await shot(`preview-${language}-1280`);
      owner.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 }); await pause(300);
      // 6. Clicking opens the note at that paragraph and highlights it.
      await evaluate(`document.querySelector('${card} [data-study-link="note:source-note#^${anchor}"]').click()`);
      await until(`document.querySelector('[data-study-note="source-note"] [data-paragraph="${anchor}"]')?.getAttribute('data-paragraph-focused')==='true'`, 50);
      result.highlighted = await evaluate(`document.querySelector('[data-study-note="source-note"] [data-paragraph="${anchor}"]').textContent`);
      result.inView = await evaluate(`(()=>{const r=document.querySelector('[data-study-note="source-note"] [data-paragraph="${anchor}"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`);
      await shot(`highlight-${language}-1280`);
      // 7. A missing anchor opens the whole note with nothing highlighted.
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" + JSON.stringify(language === 'ar' ? 'الملاحظات المرتبطة' : 'Linked notes') + ")?.click()");
      await until(`!!document.querySelector('${card} [data-study-link="note:source-note#^gone99"]')`);
      await evaluate(`document.querySelector('${card} [data-study-link="note:source-note#^gone99"]').click()`);
      await until("document.querySelectorAll('[data-study-note]').length===1 && !!document.querySelector('[data-study-note=\"source-note\"]')");
      await pause(600);
      result.missingFocused = await evaluate("!!document.querySelector('[data-paragraph-focused]')");
      result.alert = await evaluate("!!document.querySelector('[data-notes-overview] [role=alert]')");
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.ok(result.options.some(option => option.includes('الصبر حبس النفس عن الجزع')), 'paragraph option');
      assert.ok(anchor, 'anchor added');
      assert.equal(result.anchorAdded, `${FIRST} ^${anchor}\n\nالشكر قيد النعم ^thanks`);
      assert.equal(result.revisionStep, 1);
      assert.equal(result.secondRevisionStep, 0);
      assert.match(result.text, new RegExp(`\\[\\[note:source-note#\\^${anchor}\\|[^\\]]+\\]\\]`, 'u'));
      assert.match(result.text, /\[\[note:source-note#\^thanks\|الشكر قيد النعم\]\]/u);
      assert.equal(result.faint, true);
      assert.equal(result.afterBackspace, 'نص قصير');
      assert.equal(result.embed.trim(), 'الشكر قيد النعم');
      assert.ok(!result.sourceShownText.includes('^'), 'anchors hidden');
      assert.ok(result.preview && result.preview.includes('الصبر حبس النفس') && !result.preview.includes('قيد النعم'), 'preview is only the paragraph');
      assert.ok(result.highlighted.includes('وهو ثلاثة أنواع') && result.inView);
      assert.equal(result.missingFocused, false); assert.equal(result.alert, false);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|codemirror/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
