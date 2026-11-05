const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_HQ_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const press = (keyCode, modifiers = []) => { owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  // One character at a time, as a person types; triggers expand on the character that completes them.
  const typeChars = async text => { for (const ch of text) { await pause(60); owner.webContents.insertText(ch); } await pause(250); };
  const editor = '[data-study-note-editor]';
  const value = () => evaluate(`document.querySelector('${editor}').value`);
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until(`!!window.electronAPI && !!document.querySelector('${editor} .cm-content')`); await pause(800);
    await evaluate(`document.querySelector('${editor}').value=''`);
    await evaluate(`document.querySelector('${editor} .cm-content').focus()`);
  };
  (async () => {
    const results = {};
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      result.toggleOn = await evaluate("document.querySelector('[data-honorifics-toggle]').getAttribute('aria-pressed')");
      await typeChars('قال النبي (ص) وقال عمر (رض) ثم PBUH ');
      result.expanded = await value();
      // One Undo gives back exactly what was typed for the last expansion.
      await typeChars('ابن تيمية (رح)');
      press('Z', ['control']); await pause(300);
      result.afterUndo = await value();
      // Turned off: triggers stay as typed, and the choice survives a reload.
      await evaluate("document.querySelector('[data-honorifics-toggle]').click()"); await pause(500);
      await evaluate(`document.querySelector('${editor}').value=''`); await evaluate(`document.querySelector('${editor} .cm-content').focus()`);
      await typeChars('قال (ص)');
      result.whenOff = await value();
      await load(language);
      result.toggleAfterReload = await evaluate("document.querySelector('[data-honorifics-toggle]').getAttribute('aria-pressed')");
      await evaluate("document.querySelector('[data-honorifics-toggle]').click()"); await pause(500);
      await shot(`honorifics-${language}-1280`);
      // S2: a captured question moves Open → Investigating → Answered in the Notes view.
      await evaluate("window.electronAPI.knowledgeHistory.setCapture(true)");
      await evaluate(`window.electronAPI.studyNotes.save({id:'q-note-${language}',title:'سؤال',content:'ما معنى الصبر الجميل؟',aliases:[],tags:[],expectedRevision:0})`);
      await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'سجل الملاحظات' : 'Notes Log')}).click()`);
      await until("!!document.querySelector('[data-captured-question] [data-question-investigate]')");
      const id = await evaluate("document.querySelector('[data-captured-question]').getAttribute('data-captured-question')");
      result.chipOpen = await evaluate(`document.querySelector('[data-captured-question="${id}"] [data-question-status]').textContent`);
      await evaluate(`document.querySelector('[data-captured-question="${id}"] [data-question-investigate]').click()`);
      await until(`document.querySelector('[data-captured-question="${id}"] [data-question-status]')?.dataset.questionStatus==='investigating'`);
      result.chipInvestigating = await evaluate(`document.querySelector('[data-captured-question="${id}"] [data-question-status]').textContent`);
      result.storedInvestigating = await evaluate(`window.electronAPI.knowledgeHistory.questions().then(q=>q.find(x=>x.id==='${id}').status)`);
      await evaluate(`document.querySelector('[data-captured-question="${id}"]').scrollIntoView({block:'center'})`);
      await shot(`question-${language}-1280`);
      await evaluate(`document.querySelector('[data-captured-question="${id}"] [data-question-answer]').click()`);
      await until(`document.querySelector('[data-captured-question="${id}"] [data-question-status]')?.dataset.questionStatus==='answered'`);
      result.storedAnswered = await evaluate(`window.electronAPI.knowledgeHistory.questions().then(q=>q.find(x=>x.id==='${id}').status)`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.toggleOn, 'true');
      assert.equal(result.expanded, 'قال النبي ﷺ وقال عمر رضي الله عنه ثم ﷺ ');
      assert.equal(result.afterUndo, 'قال النبي ﷺ وقال عمر رضي الله عنه ثم ﷺ ابن تيمية (رح)');
      assert.equal(result.whenOff, 'قال (ص)');
      assert.equal(result.toggleAfterReload, 'false');
      assert.equal(result.chipOpen, language === 'ar' ? 'مفتوح' : 'Open');
      assert.equal(result.chipInvestigating, language === 'ar' ? 'قيد البحث' : 'Investigating');
      assert.equal(result.storedInvestigating, 'investigating'); assert.equal(result.storedAnswered, 'answered');
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|codemirror/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
