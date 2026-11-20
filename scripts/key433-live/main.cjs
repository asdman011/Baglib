// KEY-433 live verification script in Electron (ar & en, real files).
const { app, shell } = require('electron');
const externalCalls = [];
shell.openExternal = async url => { externalCalls.push(url); };
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY433_PROFILE;
const evidence = process.env.BAGLIB_KEY433_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-433 hard timeout'); app.exit(1); }, 200_000).unref();

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
  // live-harness-window.ts keeps this window off-screen and unfocused.
  const bounded = (promise, label) => new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('Evaluation timeout: '+label)),10000); promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)}); });
  const evaluate = code => bounded(win.webContents.executeJavaScript(code, true),code);
  const frame = () => win.webContents.mainFrame.frames.find(f => f.url.includes('/research-editor/'));
  const edit = code => {
    const f = frame();
    assert.ok(f, 'editor iframe');
    return bounded(f.executeJavaScript(code, true),code);
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

  // Import real ar and en PDFs
  const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
  const arPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes');
  const enPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === 'en' && f.textLayer === 'yes');
  assert.ok(arPdf && enPdf);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', arPdf.path))} })`);
  await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(path.resolve('tests/real-files', enPdf.path))} })`);
  const books = await evaluate('window.electronAPI.getAllBooks()');
  const arBook = books.find(b => b.filePath === path.resolve('tests/real-files', arPdf.path));
  const enBook = books.find(b => b.filePath === path.resolve('tests/real-files', enPdf.path));
  assert.ok(arBook && enBook);

  // Create a study note to link/embed
  const noteRes = await evaluate(`window.electronAPI.studyNotes.save({ title: 'ملاحظة فقهية للاختبار', content: 'نص الملاحظة السريعة للربط على اللوحة', aliases: [], tags: [] })`);
  const noteId = noteRes?.id || noteRes?.note?.id;
  assert.ok(noteId, 'note created');


  const results = [];
  for (const lang of ['ar', 'en']) {
    await evaluate(`window.electronAPI.settings.set('workspace.tabs.v1', null)`);
    await evaluate(`localStorage.setItem('baglib-lang', ${JSON.stringify(lang)})`);
    await evaluate('location.reload()');
    await until('!!document.querySelector("[data-nav-item=notes-editor]")');
    const ms = await evaluate(`window.electronAPI.manuscripts.create('KEY-433 Canvas ${lang}', 'research')`);
    const chapter = await evaluate(`window.electronAPI.manuscripts.createDocument(${JSON.stringify(ms.id)}, 'KEY-433 ${lang}')`);
    await evaluate('document.querySelector("[data-nav-item=notes-editor]").click()');
    await until('window.__baglibResearchEditor?.ready', true);
    await until(`!![...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-433 Canvas ${lang}'))`);
    await evaluate(`[...document.querySelectorAll('.research-sidebar-manuscript-row')].find(el => el.textContent.includes('KEY-433 Canvas ${lang}')).click()`);
    await until(`!![...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('KEY-433 ${lang}'))`);
    await evaluate(`[...document.querySelectorAll('.research-sidebar-tree-row')].find(el => el.textContent.includes('KEY-433 ${lang}')).click()`);
    await until(`window.__baglibResearchEditor.editor.doc.id === ${JSON.stringify(chapter.id)}`, true);
    await evaluate(`document.querySelectorAll('.research-mode-btn')[1].click()`);
    await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
    const urls = [`https://example.com/${lang}?q=BagLib`, `http://example.com/${lang}/card`, `mailto:reader@example.com?subject=${lang}`];
    await edit(`(() => {
      const e = window.__baglibResearchEditor.editor, d = e.doc;
      const n = d.getModelsByFlavour('affine:note')[0];
      const T = n.children[0].props.text.constructor;
      const text = new T(${JSON.stringify(lang === 'ar' ? '\u0631\u064e\u0627\u0628\u0650\u0637 \u0639\u0631\u0628\u064a BagLib' : 'English link \u0639\u0631\u0628\u064a')});
      d.addBlock('affine:paragraph', {text}, n.id); text.format(0, text.length, {link: ${JSON.stringify(urls[0])}});
      d.addBlock('affine:bookmark', {url: ${JSON.stringify(urls[1])}, title: 'BagLib card', description: '', style: 'horizontal'}, n.id);
      const mail = new T('Mail BagLib');
      d.addBlock('affine:paragraph', {text: mail}, n.id); mail.format(0, mail.length, {link: ${JSON.stringify(urls[2])}});
      d.addBlock('baglib:book-quote', {url: 'book:' + ${JSON.stringify(lang === 'ar' ? arBook.id : enBook.id)} + '#p=1',label:'Real PDF \u0639\u0631\u0628\u064a English', text:'KEY-433', grade:'', verses:[]}, n.id);
      d.updateBlock(n, {xywh:'[0,0,650,500]'});
      d.captureSync();
      window.__k433Deep = function deep(root, selector) {
        const out = [...root.querySelectorAll(selector)];
        for (const el of root.querySelectorAll('*')) if(el.shadowRoot) out.push(...deep(el.shadowRoot,selector));
        return out;
      };
      window.__k433State = () => {
        const root = window.__k433Deep(document,'affine-edgeless-root')[0];
        return JSON.stringify({selection:root?.gfx?.selection?.selectedIds, text:document.getSelection()?.toString(), notes:d.getModelsByFlavour('affine:note').map(n=>n.props.xywh)});
      };
    })()`);
    await edit('window.__baglibResearchEditor.fitToScreen()');
    await pause(600);
    const point = async selector => {
      const r = await edit(`(() => {const el = window.__k433Deep(document,${JSON.stringify(selector)})[0]; const r=el?.getBoundingClientRect(); return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null})()`);
      assert.ok(r, selector);
      const f = await evaluate(`document.querySelector('iframe.research-editor-frame').getBoundingClientRect().toJSON()`);
      return { x: Math.round(f.left+r.x), y: Math.round(f.top+r.y) };
    };
    const click = async (selector, modifiers = [], count = 1) => {
      const pos = await point(selector);
      win.webContents.sendInputEvent({type:'mouseDown',...pos,button:'left',clickCount:count,modifiers});
      win.webContents.sendInputEvent({type:'mouseUp',...pos,button:'left',clickCount:count,modifiers});
      await pause(650);
    };
    for (const url of urls) {
      const before = await edit('window.__k433State()');
      const count = externalCalls.length;
      const selector = url === urls[1] ? 'affine-bookmark' : `a[href="${url}"]`;
      await click(selector);
      assert.deepEqual(externalCalls.slice(count), [url], 'exact shell URL on '+lang);
      assert.equal(await edit('window.__k433State()'), before, 'plain click preserves canvas selection and note positions');
    }
    // Standalone surface card and embed exercise pointer-disabled canvas views.
    const surfaceUrls = [`https://example.com/${lang}/surface`, `https://github.com/BagLib/BagLib/issues/433?lang=${lang}`];
    console.log('KEY-433 adding surface blocks',lang);
    await edit(`(() => {
      const d=window.__baglibResearchEditor.editor.doc, surface=d.getModelsByFlavour('affine:surface')[0];
      d.addBlock('affine:bookmark',{url:${JSON.stringify(surfaceUrls[0])},title:'Surface link',description:'',style:'horizontal',xywh:'[800,0,364,180]'},surface.id);
      // Metadata lookup is unrelated to click behavior; keep this fixture offline.
      const originalFetch = window.fetch.bind(window);
      window.fetch = (url, options) => String(url).startsWith('https://api.github.com/')
        ? Promise.resolve(new Response(JSON.stringify({state:'open',state_reason:null,draft:false,merged:false,created_at:null,assignees:[]})))
        : originalFetch(url,options);
      d.addBlock('affine:embed-github',{url:${JSON.stringify(surfaceUrls[1])},owner:'BagLib',repo:'BagLib',githubId:'433',githubType:'issue',title:'Embed link',description:'Offline fixture',style:'horizontal',xywh:'[800,240,364,180]'},surface.id);
      d.captureSync();
      window.__baglibResearchEditor.fitToScreen();
    })()`);
    await pause(700);
    for (const [index, selector] of ['affine-edgeless-bookmark','affine-embed-edgeless-github-block'].entries()) {
      const before=await edit('window.__k433State()'), count=externalCalls.length;
      console.log('KEY-433 surface click',lang,selector);
      await click(selector);
      assert.deepEqual(externalCalls.slice(count),[surfaceUrls[index]], 'surface block opens exact URL');
      assert.equal(await edit('window.__k433State()'),before);
    }
    const count = externalCalls.length;
    await click(`a[href="${urls[0]}"]`, ['control']);
    assert.equal(externalCalls.length, count, 'modifier selects without opening');
    console.log('KEY-433 modifier selection',lang);
    const modifierSelection = JSON.parse(await edit('window.__k433State()'));
    assert.ok(modifierSelection.selection.length > 0, 'modifier still selects canvas note');
    // Native double-click sequence: no deferred shell launch, canvas can select/edit.
    const pos = await point(`a[href="${urls[0]}"]`);
    for(const clickCount of [1,2]) {
      win.webContents.sendInputEvent({type:'mouseDown',...pos,button:'left',clickCount});
      win.webContents.sendInputEvent({type:'mouseUp',...pos,button:'left',clickCount});
      await pause(70);
    }
    await pause(650);
    assert.equal(externalCalls.length, count, 'double-click edits without opening');
    assert.equal(await edit(`window.__k433Deep(document,'affine-edgeless-root')[0].gfx.selection.editing`), true, 'double click enters editing');
    // Page-view link routing remains as before.
    await evaluate(`document.querySelectorAll('.research-mode-btn')[0].click()`);
    await until(`window.__baglibResearchEditor.mode === 'page'`, true);
    await pause(400);
    await click(`a[href="${urls[0]}"]`);
    assert.deepEqual(externalCalls.slice(count),[urls[0]], 'page link behavior unchanged');
    await evaluate(`document.querySelectorAll('.research-mode-btn')[1].click()`);
    await until(`window.__baglibResearchEditor.mode === 'edgeless'`, true);
    await edit('window.__baglibResearchEditor.fitToScreen()');
    await pause(500);
    // Main boundary rejects dangerous schemes even when the renderer calls IPC directly.
    for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'data:text/html,x']) assert.equal(await evaluate(`window.electronAPI.openExternal(${JSON.stringify(url)})`), false);
    await shot('canvas-'+lang);
    await click('baglib-book-quote .source-card');
    await until(`document.querySelector('[data-workspace-tab-row] [aria-selected="true"]')?.textContent.includes(${JSON.stringify(lang === 'ar' ? arBook.title : enBook.title)})`);
    results.push({lang, externalUrls:[...urls,...surfaceUrls], pageUnchanged:true, baglibBookOpened:true, selectionPreserved:true, modifierAndDoubleClick:true});
  }
  fs.writeFileSync(path.join(evidence,'result.json'), JSON.stringify({results,externalCalls,errors},null,2));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('KEY-433 LIVE PASS', JSON.stringify(results));
  app.exit(0);
}
require(path.resolve('dist/main/index.js'));
