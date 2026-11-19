// KEY-432 live verification script in Electron (ar & en, study-note & research editors, real files).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY432_PROFILE;
const evidence = process.env.BAGLIB_KEY432_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-432 hard timeout'); app.exit(1); }, 200_000).unref();

let running = false;
app.on('browser-window-created', (_, win) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('did-finish-load', () => {
    if (running || win.webContents.getURL().startsWith('devtools:')) return;
    running = true;
    run(win, errors).catch(async error => {
      console.error(error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  win.setSize(1440, 960);
  win.show();
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = code => {
    const f = frame();
    assert.ok(f, 'editor iframe');
    return f.executeJavaScript(code, true);
  };
  async function until(code, child = false, tries = 200) {
    for (let i = 0; i < tries; i++) {
      try {
        if (await (child ? edit(code) : evaluate(code))) return;
      } catch {}
      await pause(120);
    }
    throw new Error('Timed out: ' + code);
  }
  const shot = async name => {
    await pause(350);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };

  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
  await evaluate(`(async () => {
    await window.electronAPI.settings.set("onboarding.v1", { seen: true });
    await window.electronAPI.settings.set("workspace.tabs.v1", null);
    await window.electronAPI.settings.set("workspace.closed.v1", null);
  })()`);
  await evaluate('location.reload()');
  await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');

  // Import real ar & en PDFs from tests/real-files
  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const arPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes');
  const enPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.textLayer === 'yes');
  assert.ok(arPdf && enPdf);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', arPdf.path))} })`);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', enPdf.path))} })`);

  // Ensure at least one named scholar author exists & generate a Person deck (migration 036)
  const books = await evaluate('window.electronAPI.getAllBooks()');
  const arBook = books.find(b => b.filePath === path.resolve('tests/real-files', arPdf.path));
  assert.ok(arBook);
  await evaluate(`window.electronAPI.updateBook(${JSON.stringify(arBook.id)}, { author: 'الإمام البخاري' })`);
  await evaluate(`window.electronAPI.personDecks.authorDeck({ deckName: 'Scholars Test', language: 'ar' })`);

  const allPeople = await evaluate(`window.electronAPI.peopleSearch('', 20)`);
  assert.ok(allPeople.ok && allPeople.data.length > 0, 'peopleSearch returns seeded scholars');
  const seededScholar = allPeople.data.find(p => p.role === 'scholar');
  assert.ok(seededScholar, 'at least one scholar exists');

  const ms = await evaluate(`window.electronAPI.manuscripts.create('KEY-432 Manuscript', 'research')`);
  const doc = await evaluate(`window.electronAPI.manuscripts.createDocument(${JSON.stringify(ms.id)}, 'Chapter 1')`);
  assert.ok(ms?.id && doc?.id);

  // Helper to test study-note slash scopes via CodeMirror DOM
  async function testNoteEditor(lang) {
    await evaluate(`document.querySelector("[data-nav-item=notes]").click()`);
    await until(`!!document.querySelector("[data-study-note-editor] .cm-content") || (window.dispatchEvent(new CustomEvent('baglib:new-note')), false)`);
    // Type '/' to verify all 3 new scopes appear in the menu
    await evaluate(`document.querySelector("[data-study-note-editor] .cm-content").focus()`);
    await win.webContents.insertText('/');
    await until(`!!document.querySelector("[data-slash-search] [data-slash-scope=dictionary]")`);
    const hasScopes = await evaluate(`({
      dict: !!document.querySelector("[data-slash-search] [data-slash-scope=dictionary]"),
      people: !!document.querySelector("[data-slash-search] [data-slash-scope=people]"),
      wiki: !!document.querySelector("[data-slash-search] [data-slash-scope=wikipedia]"),
    })`);
    assert.deepEqual(hasScopes, { dict: true, people: true, wiki: true }, `All 3 scopes in note editor (${lang})`);

    // Test /people insertion with a scholar
    await win.webContents.insertText((lang === 'ar' ? 'أعلام ' : 'people ') + seededScholar.name);
    await until(`!!document.querySelector("[data-slash-search] [data-slash-scope=people] .cm-slash-role-badge")`);
    const badges = await evaluate(`[...document.querySelectorAll("[data-slash-search] [data-slash-scope=people] .cm-slash-role-badge")].map(el => el.textContent?.trim())`);
    assert.ok(badges.includes(lang === 'ar' ? 'عالم' : 'Scholar'), `Scholar badge shown (${lang}): ${JSON.stringify(badges)}`);
    await shot(`note-people-${lang}`);
    await evaluate(`document.querySelector("[data-slash-search] [data-slash-scope=people]")?.click()`);
    await until(`(document.querySelector("[data-study-note-editor] .cm-content")?.textContent || "").includes("[[person:")`);
    const noteText = await evaluate(`document.querySelector("[data-study-note-editor] .cm-content")?.textContent || ""`);
    assert.ok(noteText.includes('[[person:'), `Inserted person link in note (${lang})`);

    // Test /narrators scope
    await evaluate(`document.querySelector("[data-study-note-editor] .cm-content").focus()`);
    await win.webContents.insertText(lang === 'ar' ? '\n/رواة البخاري' : '\n/narrators البخاري');
    await until(`!!document.querySelector("[data-slash-search] [data-slash-scope=people] .cm-slash-role-badge")`);
    const narratorBadges = await evaluate(`[...document.querySelectorAll("[data-slash-search] [data-slash-scope=people] .cm-slash-role-badge")].map(el => el.textContent?.trim())`);
    assert.ok(narratorBadges.includes(lang === 'ar' ? 'راوٍ' : 'Narrator'), `Narrator badge shown (${lang}): ${JSON.stringify(narratorBadges)}`);

    // Test /wikipedia scope & language switch
    await evaluate(`document.querySelector("[data-study-note-editor] .cm-content").focus()`);
    await win.webContents.insertText(lang === 'ar' ? '\n/ويكيبيديا البخاري' : '\n/wikipedia Bukhari');
    await until(`!!document.querySelector("[data-slash-search] .cm-slash-wiki-lang-bar")`);
    const activeWikiBtn = await evaluate(`document.querySelector("[data-slash-search] .cm-slash-wiki-lang-bar .active")?.getAttribute("data-wiki-lang")`);
    assert.equal(activeWikiBtn, lang);
    // Wait for either results or offline/empty status
    await until(`document.querySelector("[data-slash-search]")?.getAttribute("aria-busy") === "false"`);
    await shot(`note-wiki-${lang}`);
  }

  // Helper to test research editor slash scopes
  if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
  async function testResearchEditor(lang) {
    await evaluate(`document.querySelector("[data-nav-item=notes-editor]").click()`);
    await until(`!!document.querySelector('.research-sidebar-manuscript-row')`);
    const findChapter = `([...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent?.trim() === 'Chapter 1'))`;
    if (!(await evaluate(`!!${findChapter}`))) {
      await evaluate(`document.querySelector('.research-sidebar-manuscript-row').click()`);
      await until(`!!${findChapter}`);
    }
    await evaluate(`${findChapter}.click()`);
    await until('!!document.querySelector(".research-editor-frame.ready")');
    await until(`(() => {
      const e = window.__baglibResearchEditor?.editor;
      const nodes = e?.querySelectorAll("affine-paragraph rich-text");
      const rt = nodes?.[nodes.length - 1];
      return !e?.doc?.readonly && !!rt?.inlineEditor && rt.inlineEditor.yText.doc?.guid === e.doc.spaceDoc.guid;
    })()`, true);
    await evaluate(`document.querySelector(".research-editor-frame").focus()`);
    await edit(`(() => {
      const e = window.__baglibResearchEditor.editor;
      const nodes = e.querySelectorAll('affine-paragraph rich-text');
      const rt = nodes[nodes.length - 1];
      const el = rt.querySelector('[contenteditable=true]') || rt;
      el.focus();
      rt.inlineEditor?.setInlineRange({ index: rt.inlineEditor.yText.length, length: 0 });
      el.scrollIntoView({ block: 'center' });
    })()`);
    await pause(200);
    const outer = await evaluate('document.querySelector(".research-editor-frame").getBoundingClientRect().toJSON()');
    const inner = await edit('(() => { const nodes = document.querySelectorAll("affine-paragraph rich-text"); return nodes[nodes.length - 1].getBoundingClientRect().toJSON(); })()');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: outer.x + inner.x + Math.max(2, inner.width / 2), y: outer.y + inner.y + Math.max(2, inner.height / 2), button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: outer.x + inner.x + Math.max(2, inner.width / 2), y: outer.y + inner.y + Math.max(2, inner.height / 2), button: 'left', clickCount: 1 });
    await pause(150);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', text: '/' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash' });
    await until(`!!document.querySelector('baglib-slash-menu')?.shadowRoot?.querySelector('li')`, true);
    const menuText = await edit(`document.querySelector('baglib-slash-menu')?.shadowRoot?.textContent || ''`);
    if (lang === 'ar') {
      assert.ok(menuText.includes('المعجم') && menuText.includes('الأعلام والرواة') && menuText.includes('ويكيبيديا'), 'Arabic scopes in research slash menu');
    } else {
      assert.ok(menuText.includes('Dictionary') && menuText.includes('People') && menuText.includes('Wikipedia'), 'English scopes in research slash menu');
    }
    await shot(`research-slash-${lang}`);
    // Close slash menu
    await edit(`document.querySelector('baglib-slash-menu')?.remove()`);
  }

  // === PART 1: ARABIC (RTL) ===
  await evaluate(`localStorage.setItem('baglib-lang', 'ar');`);
  await evaluate('location.reload()');
  await until('!!document.querySelector("[data-nav-item=notes]")');
  await testNoteEditor('ar');
  await testResearchEditor('ar');

  // === PART 2: ENGLISH (LTR) ===
  await evaluate(`(async () => {
    await window.electronAPI.settings.set("workspace.tabs.v1", null);
    await window.electronAPI.settings.set("workspace.closed.v1", null);
    localStorage.setItem('baglib-lang', 'en');
  })()`);
  await evaluate('location.reload()');
  await until('!!document.querySelector("[data-nav-item=notes]")');
  await testNoteEditor('en');
  await testResearchEditor('en');

  assert.deepEqual(errors, [], 'Unexpected renderer errors: ' + JSON.stringify(errors));
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ passed: true, errors }, null, 2));
  console.log('KEY-432 live verification PASSED');
  app.exit(0);
}

require('../../dist/main/index.js');
