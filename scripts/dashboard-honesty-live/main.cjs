const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const profile = path.resolve(process.env.BAGLIB_KEY238_PROFILE);
const evidence = process.env.BAGLIB_KEY238_EVIDENCE;
assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
assert.ok(path.basename(profile).startsWith('KEY-238-live-'));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 200; attempt++) {
      try { if (await evaluate(code)) return; } catch { /* mounting */ }
      await pause(150);
    }
    throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText.slice(-2000)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => {
    await until("!document.querySelector('[data-splash-brand]')");
    await pause(500);
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  win.webContents.on('did-finish-load', () => evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}));
  (async () => {
    win.setMinimumSize(320, 400);
    win.setContentSize(1280, 1000);
    win.show();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    const first = await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ title: '\u062a\u064e\u0623\u064e\u0645\u0651\u064f\u0644 Faith 2026', content: 'Mixed-script note body', aliases: [], tags: [] })})`);
    const second = await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ title: 'Reading journal \u0642\u0631\u0627\u0621\u0629', content: 'Another note body', aliases: [], tags: [] })})`);
    const db = new Database(path.join(profile, 'data', 'baglib.db'));
    try {
      db.prepare("INSERT INTO reading_book_stat(id,title,subject) VALUES ('old-reading','Past reading','Study')").run();
      db.prepare("INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES ('old-reading',1,?,3600)").run(Math.floor(Date.now() / 1000) - 30 * 86400);
    } finally { db.close(); }
    const matrix = [];
    for (const lang of ['ar', 'en']) {
      await evaluate(`localStorage.setItem('baglib-lang','${lang}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}' && !!document.querySelector('[data-dashboard-customize-btn]')`);
      await until("!document.querySelector('[data-splash-brand]')");
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      await click('[data-dashboard-customize-btn]');
      for (const id of ['readingGoals', 'studyInsights']) {
        const selector = `[data-customize-module-row="${id}"] [role=switch]`;
        await until(`!!document.querySelector(${JSON.stringify(selector)})`);
        if (await evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-checked')==='false'`)) await click(selector);
      }
      await click('[data-customize-close-btn]');
      await until("!!document.querySelector('[data-study-recent-edit] bdi') && !!document.querySelector('[data-dashboard-item=readingGoals] h2')");
      const weekly = await evaluate(`(async () => ({heatmap:await window.electronAPI.statistics.getDailyHeatmap(7),streak:await window.electronAPI.statistics.getStreakStats()}))()`);
      assert.deepEqual(weekly.heatmap, []);
      assert.ok(weekly.streak.totalReadTimeSeconds > 0 && weekly.streak.totalReadPages > 0);
      const minutes = lang === 'ar' ? '\u062f\u0642\u064a\u0642\u0629' : 'min';
      const analytics = await evaluate("document.querySelector('[data-dashboard-item=readingGoals]').innerText");
      assert.ok(!analytics.includes('60 ' + minutes));
      const weeklyValues = await evaluate(`(() => {
        const el=document.querySelector('[data-dashboard-item=readingGoals]');
        const time=el.querySelector('.grid.grid-cols-2').lastElementChild.lastElementChild.textContent.trim();
        const pages=el.querySelector('.grid.grid-cols-3').firstElementChild.querySelector('.font-mono').textContent.trim();
        return {time,pages};
      })()`);
      assert.equal(weeklyValues.pages, '0');
      assert.match(weeklyValues.time, /^0 /);
      const edits = await evaluate("[...document.querySelectorAll('[data-study-recent-edit]')].map(el=>({id:el.dataset.studyRecentEdit,title:el.querySelector('bdi').textContent,type:el.querySelector('span').textContent,date:el.querySelector('time').dateTime,tag:el.tagName}))");
      assert.ok(edits.some(item => item.id === first.id && item.title === first.title && item.tag === 'BUTTON'));
      assert.ok(edits.some(item => item.id === second.id && item.title === second.title));
      await evaluate("document.querySelector('[data-dashboard-item=readingGoals]').scrollIntoView({block:'center'})");
      await shot('weekly-zero-' + lang + '-1280');
      await evaluate("document.querySelector('[data-study-recent-edit]').scrollIntoView({block:'center'})");
      await shot('named-edits-' + lang + '-1280');
      await click('[data-dashboard-item=readingGoals] header button');
      const estimate = lang === 'ar' ? '\u062a\u0642\u062f\u064a\u0631\u064a\u0629' : 'Estimated speed';
      await until(`!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').textContent.includes(${JSON.stringify(estimate)})`);
      await shot('estimated-speed-' + lang + '-1280');
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await until("!document.querySelector('[role=dialog]')");
      await click(`[data-study-recent-edit="${first.id}"]`);
      await until(`!!document.querySelector('[data-note-editor-pane]') && document.querySelector('[data-study-note-editor]')?.value.includes('Mixed-script note body')`);
      await shot('opened-note-' + lang + '-1280');
      await click('[data-nav-item=dashboard]');
      await until("!!document.querySelector('[data-dashboard-view]')");
      matrix.push({ lang, width: 1280, weeklyValues, edits, passed: true });
    }
    assert.deepEqual(errors, [], 'zero renderer errors');
    const result = { matrix, passed: matrix.length, rendererErrors: errors.length };
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.quit();
  })().catch(async error => { console.error(error); console.error(JSON.stringify({ errors })); try { await shot('failure'); } finally { app.exit(1); } });
});
require('../../dist/main/index.js');
