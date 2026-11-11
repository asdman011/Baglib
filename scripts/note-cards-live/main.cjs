const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_CARDS_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const press = (keyCode, modifiers = []) => { owner.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); owner.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
  // Key presses are queued while insertText applies at once; wait so typed text never overtakes a key.
  const type = async text => { await pause(250); owner.webContents.insertText(text); await pause(300); };
  const editor = '[data-notes-overview] [data-study-note-editor]';
  const slash = async () => { await type(' /card'); await until("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].length>0"); await pause(300); press('Enter'); await pause(800); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    // KEY-317: localStorage needs a page of this origin first.
    await owner.loadURL('http://localhost:3000'); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
  };
  const queueFronts = () => evaluate('window.electronAPI.knowledgeCards.reviewQueue().then(q=>q.cards.map(c=>c.front))');
  (async () => {
    const results = {};
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      // Ctrl+Shift+N from the dashboard opens a new note in Notes with the cursor in the editor.
      // A key press can be dropped while the window is still settling, so press again until the note opens.
      for (let attempt = 0; attempt < 5; attempt++) {
        owner.webContents.focus();
        press('N', ['control', 'shift']);
        try { await until(`!!document.querySelector('${editor} .cm-content')`, 15); break; } catch { if (attempt === 4) throw new Error('Ctrl+Shift+N did not open a note'); }
      }
      await pause(400);
      result.focused = await evaluate(`document.querySelector('${editor}').contains(document.activeElement)`);
      // Cloze: two blanks make two cards.
      await type('أركان الإسلام {{c1::خمسة}} أولها {{c2::الشهادتان}}');
      await slash();
      // Since KEY-301 card messages are toasts.
      const toasts = "[...document.querySelectorAll('[data-feedback-toast]')].map(t=>t.textContent).join(' | ')";
      const expected = language === 'ar' ? 'أُضيفت بطاقتان إلى المراجعة.' : '2 cards added to review.';
      await until(`(${toasts}).includes(${JSON.stringify(expected)})`, 50).catch(() => {});
      result.clozeMessage = await evaluate(toasts);
      // question :: answer
      press('Enter'); await type('Capital of Egypt :: Cairo');
      await slash();
      // A plain line explains the formats instead of making a card.
      press('Enter'); await type('A plain sentence.');
      await slash();
      await until(`(${toasts}).includes('::')`, 50).catch(() => {});
      result.plainMessage = await evaluate(toasts);
      result.text = await evaluate(`document.querySelector('${editor}').value`);
      result.fronts = await queueFronts();
      await shot(`cards-${language}-1280`);
      const ids = await evaluate('window.electronAPI.knowledgeCards.list().then(cards=>cards.map(c=>c.id))');
      for (const id of ids) await evaluate(`window.electronAPI.knowledgeCards.remove(${JSON.stringify(id)})`);
      await evaluate("window.electronAPI.settings.set('study.capture.draft.v1',{content:'',title:'',tagsInput:'',aliasesInput:'',workId:''})");
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.focused, true);
      assert.ok(result.clozeMessage.includes(language === 'ar' ? 'أُضيفت بطاقتان إلى المراجعة.' : '2 cards added to review.'), result.clozeMessage);
      assert.deepEqual([...result.fronts].sort(), ['Capital of Egypt', 'أركان الإسلام […] أولها الشهادتان', 'أركان الإسلام خمسة أولها […]'].sort());
      assert.deepEqual(result.text.split('\n').map(line => line.trim()), ['أركان الإسلام {{c1::خمسة}} أولها {{c2::الشهادتان}} #card', 'Capital of Egypt :: Cairo #card', 'A plain sentence.']);
      assert.match(result.plainMessage, language === 'ar' ? /::/u : /question :: answer/u);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|codemirror/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
