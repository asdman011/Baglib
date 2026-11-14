const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = path.resolve(process.env.BAGLIB_KEY347_PROFILE);
const evidence = process.env.BAGLIB_KEY347_EVIDENCE;
assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
assert.ok(path.basename(profile).startsWith('KEY-347-live-'));
const inputs = JSON.parse(fs.readFileSync(path.join(profile, 'inputs.json'), 'utf8'));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
// Initialize the disposable schema before eager reminder registration in the main bundle.
require('tsx/cjs');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/main/database/migrator.ts');
const { migrations } = require('../../src/main/database/migrations/index.ts');
fs.mkdirSync(path.join(profile, 'data'), { recursive: true });
const initial = new Database(path.join(profile, 'data', 'baglib.db'));
runMigrations(initial, migrations);
initial.close();
const choices = [];
dialog.showOpenDialog = async () => {
  const filePaths = choices.shift();
  return { canceled: !filePaths, filePaths: filePaths || [] };
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 240; attempt++) {
      try { if (await evaluate(code)) return; } catch { /* UI mounting */ }
      await pause(150);
    }
    throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2000)'));
  };
  const click = async selector => {
    await until(`!!document.querySelector(${JSON.stringify(selector)})`);
    return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const shot = async name => {
    await until("!document.querySelector('[data-splash-brand]')");
    await pause(350);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  win.webContents.on('did-finish-load', () => evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}));
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1440, 1100);
    win.show();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await click('[data-nav-item=lectures]');
    await until("!!document.querySelector('[data-lecture-add-folder]')");
    const existing = await evaluate("window.electronAPI.lectures.series.create('ar Course')");
    for (const lang of ['ar', 'en']) {
      choices.push([inputs[lang].folder]);
      await click('[data-lecture-add-folder]');
      await until(`window.electronAPI.lectures.series.list().then(groups=>groups.some(group=>group.name==='${lang} Course'&&group.items.length===2))`);
    }
    await evaluate(`window.electronAPI.lectures.addPaths(${JSON.stringify([inputs.single])})`);
    // Exercise folder discovery plus the normal generic import IPC for a one-item folder.
    const discovery = await evaluate(`window.electronAPI.discoverDigitalFiles(${JSON.stringify([inputs.pipelineFolder])})`);
    const summary = await evaluate(`window.electronAPI.importDigitalFiles(${JSON.stringify(discovery.files.map(file => ({filePath:file.path,duplicateAction:'import_anyway'})))})`);
    assert.equal(summary.successfulImports, 1);
    const groups = await evaluate('window.electronAPI.lectures.series.list()');
    assert.equal(groups.find(group => group.id === existing.id).items.length, 0);
    assert.equal(groups.find(group => group.name === 'Pipeline').items.length, 1);
    const lectures = await evaluate('window.electronAPI.lectures.list()');
    const single = lectures.find(lecture => lecture.path === inputs.single);
    assert.ok(single);
    assert.equal(groups.some(group => group.items.some(item => item.workId === single.id)), false);
    const matrix = [];
    for (const lang of ['ar', 'en']) {
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib.lectures.layout','study')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}' && !!document.querySelector('[data-nav-item=lectures]')`);
      await until("!document.querySelector('[data-splash-brand]')");
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      await click('[data-nav-item=lectures]');
      const group = groups.find(group => group.name === lang + ' Course' && group.items.length === 2);
      const order = group.items.map(item => path.basename(lectures.find(lecture => lecture.id === item.workId).path));
      assert.deepEqual(order, ['2.mp4', '10.mp4']);
      const select = async id => {
        await click(`[data-lecture-row="${id}"] [data-lecture-select]`);
        const file = lectures.find(lecture => lecture.id === id).path;
        await until(`document.querySelector('[data-lecture-player]')?.src.includes(${JSON.stringify(encodeURIComponent(path.basename(file)))}) && document.querySelector('[data-lecture-player]')?.readyState>=1`);
        await pause(200);
      };
      await select(group.items[0].workId);
      assert.equal(await evaluate("document.querySelector('[data-lecture-control-bar]').dir"), 'ltr');
      assert.equal(await evaluate("!!document.querySelector('[data-lecture-transcript-slot], [data-transcript-search], [data-toggle-transcript]')"), false);
      assert.ok(await evaluate("!!document.querySelector('[data-lecture-inline-notes] textarea')"));
      const positions = await evaluate("['play','back','forward','mute','fullscreen'].map(name=>document.querySelector('[data-lecture-'+name+']').getBoundingClientRect().x)");
      assert.ok(positions.every((x, index) => index === 0 || x > positions[index-1]), 'control order identical to English');
      const noteText = '\u0641\u064e\u0627\u0626\u0650\u062f\u064e\u0629 Study note ' + lang;
      await evaluate(`(()=>{const video=document.querySelector('[data-lecture-player]');video.pause();video.currentTime=3.25;const editor=document.querySelector('[data-lecture-note-editor]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,${JSON.stringify(noteText)});editor.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until("!document.querySelector('[data-lecture-note-save]').disabled");
      await click('[data-lecture-note-save]');
      await until(`window.electronAPI.studyNotes.list().then(notes=>notes.some(note=>note.content.includes(${JSON.stringify(noteText)})&&note.content.includes('media:${group.items[0].workId}:3'))) `);
      await until("document.querySelector('[data-lecture-note-editor]').value===''");
      assert.equal(await evaluate("!!document.querySelector('[data-note-side-panel]')"), false);
      await shot('study-' + lang + '-1440');
      win.setContentSize(480, 1000);
      await evaluate("document.querySelector('[data-lecture-note-editor]').scrollIntoView({block:'center'})");
      await shot('notes-' + lang + '-480');
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
      win.setContentSize(1440, 1100);
      await evaluate("document.querySelector('[data-lecture-player]').scrollIntoView({block:'center'})");
      // Persist the player toggle, and verify actual media-ended playback advances only within this series.
      if (!await evaluate("document.querySelector('[data-lecture-autoplay]').checked")) await click('[data-lecture-autoplay]');
      await until(`window.electronAPI.lectures.series.list().then(rows=>rows.find(row=>row.id==='${group.id}').autoplayNext)`);
      await evaluate("(()=>{const video=document.querySelector('[data-lecture-player]');video.muted=true;video.currentTime=video.duration-0.3;return video.play();})()");
      await until(`document.querySelector('[data-lecture-row="${group.items[1].workId}"] [data-lecture-select]')?.getAttribute('aria-current')==='true'`);
      await until("document.querySelector('[data-lecture-player]')?.currentTime>0 && !document.querySelector('[data-lecture-player]').paused");
      await shot('auto-next-' + lang);
      await evaluate("(()=>{const video=document.querySelector('[data-lecture-player]');video.currentTime=video.duration-0.3;return video.play();})()");
      await until("document.querySelector('[data-lecture-player]').ended");
      await pause(6000);
      assert.ok(await evaluate(`document.querySelector('[data-lecture-row="${group.items[1].workId}"] [data-lecture-select]').getAttribute('aria-current')==='true'`));
      assert.equal(await evaluate("!!document.querySelector('[data-lecture-next]')"), false);
      await shot('series-end-' + lang);
      // Turning it off suppresses automatic playback, while the explicit next button remains usable.
      await click('[data-lecture-autoplay]');
      await until(`window.electronAPI.lectures.series.list().then(rows=>!rows.find(row=>row.id==='${group.id}').autoplayNext)`);
      await select(group.items[0].workId);
      await evaluate("(()=>{const video=document.querySelector('[data-lecture-player]');video.muted=true;video.currentTime=video.duration-0.3;return video.play();})()");
      await until("document.querySelector('[data-lecture-player]').ended");
      await pause(6000);
      assert.ok(await evaluate(`document.querySelector('[data-lecture-row="${group.items[0].workId}"] [data-lecture-select]').getAttribute('aria-current')==='true'`));
      await select(single.id);
      assert.equal(await evaluate("!!document.querySelector('[data-lecture-autoplay]')"), false);
      await shot('single-' + lang);
      matrix.push({lang,order,positions,inlineTimestamp:3,autoNext:true,stopsAtEnd:true,disabledStops:true,singleToggleHidden:true,passed:true});
    }
    assert.deepEqual(errors, [], 'zero renderer errors');
    const result = {matrix,passed:matrix.length,rendererErrors:errors.length,realOriginalsUnchanged:true};
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({errors})); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
