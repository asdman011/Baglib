const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_COMMENTS_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const notesLabel = { ar: 'سجل الملاحظات', en: 'Notes Log' };
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const setText = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const thread = '[data-comment-threads="comment-note"]';
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(notesLabel[language])}).click()`);
    await until(`!!document.querySelector('[data-study-note="comment-note"]')`);
    await evaluate(`document.querySelector('[data-note-history="comment-note"]').open=true`);
    await until(`!!document.querySelector('${thread} [data-comment-add]')`);
  };
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    await evaluate(`window.electronAPI.studyNotes.save({id:'comment-note',title:'الصبر — Patience',content:'الصبر ضياء — Patience is light',aliases:[],tags:[],expectedRevision:0})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      const before = await evaluate(`window.electronAPI.knowledgeHistory.versions('comment-note').then(v=>v[0].revision)`);
      // New thread, then a reply.
      await setText(`${thread} [data-comment-new]`, language === 'ar' ? 'هل المقصود الصبر على الطاعة؟' : 'Does this mean patience in obedience?');
      await click(`${thread} [data-comment-add]`);
      await until(`document.querySelectorAll('${thread} [data-comment-thread]').length===1`);
      await click(`${thread} [data-comment-reply-button]`);
      await until(`!!document.querySelector('${thread} [data-comment-thread] textarea')`);
      await setText(`${thread} [data-comment-thread] textarea`, language === 'ar' ? 'نعم، وعن المعصية أيضًا — and from sin' : 'Yes, and from sin — وعن المعصية');
      await evaluate(`[...document.querySelectorAll('${thread} [data-comment-thread] button')].find(b=>b.textContent===${JSON.stringify(language === 'ar' ? 'رد' : 'Reply')}).click()`);
      await until(`document.querySelectorAll('${thread} [data-comment-reply]').length===1`);
      result.openBadge = await evaluate(`document.querySelector('${thread} [data-comment-open-count]').textContent`);
      await until(`document.querySelector('[data-study-note="comment-note"] [data-note-open-comments]')?.textContent.includes('1')`);
      result.listBadge = await evaluate(`document.querySelector('[data-study-note="comment-note"] [data-note-open-comments]').textContent`);
      await shot(`thread-${language}-1280`);
      // Resolve: it leaves the Open view and appears under Resolved.
      await click(`${thread} [data-comment-resolve]`);
      await until(`document.querySelectorAll('${thread} [data-comment-thread]').length===0`);
      await until(`!document.querySelector('[data-study-note="comment-note"] [data-note-open-comments]')`, 25).catch(() => {});
      result.badgeAfterResolve = await evaluate(`!!document.querySelector('[data-study-note="comment-note"] [data-note-open-comments]')`);
      await click(`${thread} [data-comment-filter="resolved"]`);
      await until(`document.querySelector('${thread} [data-comment-thread]')?.dataset.resolved==='true'`);
      await shot(`resolved-${language}-1280`);
      // Reopen from the Resolved view.
      await click(`${thread} [data-comment-resolve]`);
      await until(`document.querySelectorAll('${thread} [data-comment-thread]').length===0`);
      await click(`${thread} [data-comment-filter="open"]`);
      await until(`document.querySelectorAll('${thread} [data-comment-thread]').length===1`);
      // The list filter shows only notes with open comments.
      await click('[data-notes-open-comments]');
      result.filteredNotes = await evaluate(`document.querySelectorAll('[data-study-note]').length`);
      await click('[data-notes-open-comments]');
      result.revisions = (await evaluate(`window.electronAPI.knowledgeHistory.versions('comment-note').then(v=>v[0].revision)`)) - before;
      owner.setContentSize(480, 900); await pause(600);
      await evaluate(`document.querySelector('${thread}').scrollIntoView({block:'center'})`); await shot(`thread-${language}-480`);
      // Delete the thread (confirm stubbed) so the next language starts clean.
      await evaluate('window.confirm=()=>true;0');
      await evaluate(`[...document.querySelectorAll('${thread} [data-comment-thread] > div button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'حذف' : 'Delete')}).click()`);
      await until(`document.querySelectorAll('${thread} [data-comment-thread]').length===0`);
      result.leftAfterDelete = (await evaluate(`window.electronAPI.knowledgeHistory.comments('comment-note')`)).length;
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.match(result.openBadge, /1/u); assert.match(result.listBadge, /1/u);
      assert.equal(result.badgeAfterResolve, false); assert.equal(result.filteredNotes, 1);
      assert.equal(result.revisions, 4); assert.equal(result.leftAfterDelete, 0);
    }
    assert.deepEqual(consoleLines, []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
