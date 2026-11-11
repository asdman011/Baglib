const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_RELATIONS_LIVE_DIR;
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
  // Key presses are queued while insertText applies at once: wait first so the order is a person's.
  const type = async text => { await pause(250); owner.webContents.insertText(text); await pause(250); };
  const value = () => evaluate("document.querySelector('[data-study-note-editor]').value");
  const options = () => evaluate("[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map(li=>li.textContent)");
  const choose = async text => {
    await until(`[...document.querySelectorAll('.cm-tooltip-autocomplete li')].some(li=>li.textContent.includes(${JSON.stringify(text)}))`);
    await pause(400);
    // Arrow down to the wanted item, then Enter, as a person would.
    const index = await evaluate(`[...document.querySelectorAll('.cm-tooltip-autocomplete li')].findIndex(li=>li.textContent.includes(${JSON.stringify(text)}))`);
    for (let step = 0; step < index; step++) { press('Down'); await pause(80); }
    await pause(200); press('Enter'); await pause(400);
  };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("[data-study-note-editor] .cm-content")'); await pause(800);
  };
  const notesView = async language => {
    await evaluate("document.querySelector('[data-nav-item=\"notes\"]').click()");
    await until("document.querySelectorAll('[data-study-note]').length>=2");
  };
  // Since KEY-304 the Notes page is a list plus an editor: select a note; its links render in the preview,
  // and its graph button sits in the editor header.
  const selectNote = async (id, preview) => {
    await evaluate(`document.querySelector('[data-study-note="${id}"]').click()`);
    await until(`!!document.querySelector('[data-note-editor-pane] [data-graph-button]') && !!document.querySelector('[data-note-preview-toggle]')`);
    if (preview) {
      await evaluate("(()=>{const b=document.querySelector('[data-note-preview-toggle]');if(b.getAttribute('data-note-preview-toggle')==='edit')b.click();})()");
      await until(`!!document.querySelector('[data-note-preview="${id}"]')`);
    }
  };
  (async () => {
    const results = {};
    await load('en');
    await evaluate("window.electronAPI.studyNotes.save({id:'claim-note',title:'الصبر واجب',content:'الصبر واجب عند البلاء',aliases:['patience duty'],tags:[],expectedRevision:0})");
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate("document.querySelector('[data-study-note-editor]').value=''");
      await evaluate("document.querySelector('[data-study-note-editor] .cm-content').focus()");
      await type(language === 'ar' ? 'حديث في الباب ' : 'A hadith on this ');
      // `[[` + the start of a relationship name offers it in the interface language.
      await type(language === 'ar' ? '[[يؤ' : '[[sup');
      await until("document.querySelectorAll('.cm-tooltip-autocomplete li').length>0");
      result.relationOptions = await options();
      await choose(language === 'ar' ? 'يؤيد' : 'supports');
      result.afterRelation = await value();
      // The search goes on for the target; choosing the note keeps the relationship in the link.
      await type('الصبر');
      await choose('الصبر واجب');
      result.linked = await value();
      // With the cursor just after the link, the relationship menu shows; a choice changes the written link.
      await until("!!document.querySelector('[data-relation-menu]')");
      result.menu = await evaluate("[...document.querySelectorAll('[data-relation-choice]')].map(b=>b.textContent + (b.getAttribute('aria-pressed')==='true' ? '*' : ''))");
      await shot(`menu-${language}`);
      await evaluate("document.querySelector('[data-relation-choice=\"refutes\"]').click()");
      await pause(300);
      result.afterMenu = await value();
      // Ctrl+Alt+R steps to the next one (refutes → explains); then the menu puts supports back.
      press('R', ['control', 'alt']); await pause(400);
      result.afterShortcut = await value();
      await until("!!document.querySelector('[data-relation-choice=\"supports\"]')");
      await evaluate("document.querySelector('[data-relation-choice=\"supports\"]').click()");
      await pause(300);
      // Leave the line: the link shows its label with a relationship chip.
      press('End'); press('Enter'); await type(language === 'ar' ? 'سطر آخر' : 'another line');
      await pause(400);
      result.chip = await evaluate("document.querySelector('[data-study-note-editor] [data-link-relation]')?.textContent");
      await shot(`editor-${language}`);
      // Save it as a note through the API with the editor's own text, then read it in Notes and in the graph.
      const content = await value();
      await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ id: `evidence-${language}`, title: language === 'ar' ? 'الدليل' : 'Evidence', content, aliases: [], tags: [], expectedRevision: 0 })})`);
      result.saved = content;
      await notesView(language);
      await selectNote(`evidence-${language}`, true);
      await until(`!!document.querySelector('[data-note-preview="evidence-${language}"] [data-link-relation]')`);
      result.viewChip = await evaluate(`document.querySelector('[data-note-preview="evidence-${language}"] [data-link-relation]').textContent`);
      await shot(`notes-${language}`);
      await evaluate("document.querySelector('[data-note-editor-pane] [data-graph-button]').click()");
      await until("!!document.querySelector('[data-graph-relation]')");
      result.graphLabel = await evaluate("document.querySelector('[data-graph-relation] text')?.textContent");
      result.graphRelation = await evaluate("document.querySelector('[data-graph-relation]').getAttribute('data-graph-relation')");
      result.listRelation = await evaluate("document.querySelector('[data-graph-list-relation]')?.textContent");
      // The relationship filter: a chip per relationship present; choosing it keeps only those lines.
      result.filterChips = await evaluate("[...document.querySelectorAll('[data-graph-filter-relation]')].map(b=>b.textContent)");
      await evaluate("document.querySelector('[data-graph-filter-relation=\"supports\"]').click()");
      await pause(300);
      result.filteredPressed = await evaluate("document.querySelector('[data-graph-filter-relation=\"supports\"]').getAttribute('aria-pressed')");
      result.filteredNodes = await evaluate("document.querySelectorAll('[data-knowledge-graph] [data-graph-node]').length");
      await shot(`graph-${language}`);
      // From the claim's side the same line reads as incoming.
      await evaluate("document.querySelector('[data-knowledge-graph] header button[aria-label]').click()");
      await until("!document.querySelector('[data-knowledge-graph]')");
      await selectNote('claim-note', false);
      await evaluate("document.querySelector('[data-note-editor-pane] [data-graph-button]').click()");
      await until("!!document.querySelector('[data-graph-list-relation]')");
      result.incoming = await evaluate("[...document.querySelectorAll('[data-graph-list-relation]')].map(e=>e.textContent)");
      await evaluate("document.querySelector('[data-knowledge-graph] header button[aria-label]').click()");
      results[language] = result; console.log(JSON.stringify({ language, result }, null, 1));
      const name = language === 'ar' ? 'يؤيد' : 'supports';
      assert.ok(result.relationOptions.some(option => option.includes(name)), 'relation offered');
      assert.ok(result.afterRelation.endsWith('[[supports::'), result.afterRelation);
      assert.match(result.linked, /\[\[supports::note:claim-note\|الصبر واجب\]\]$/u);
      assert.equal(result.menu.length, 8);
      assert.ok(result.menu.includes(`${name}*`), JSON.stringify(result.menu));
      assert.match(result.afterMenu, /\[\[refutes::note:claim-note\|الصبر واجب\]\]$/u);
      assert.match(result.afterShortcut, /\[\[explains::note:claim-note\|الصبر واجب\]\]$/u);
      assert.equal(result.chip, name);
      assert.equal(result.viewChip, name);
      assert.equal(result.graphRelation, 'supports');
      assert.equal(result.graphLabel, name);
      assert.equal(result.listRelation, name);
      assert.deepEqual(result.filterChips, [`${name} (1)`]);
      assert.equal(result.filteredPressed, 'true');
      assert.equal(result.filteredNodes, 2);
      assert.ok(result.incoming.some(text => text.includes(name)), JSON.stringify(result.incoming));
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
