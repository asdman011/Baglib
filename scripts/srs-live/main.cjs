const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_SRS_LIVE_DIR;
app.setPath('userData', directory);
let started = false;
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const evaluate = code => owner.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(400);
    }
    throw new Error(`Timed out: ${code}`);
  };
  (async () => {
    if (process.env.BAGLIB_SRS_RESTART === '1') {
      await until('!!window.electronAPI?.knowledgeCards?.reviewQueue && !!document.querySelector("footer")');
      const saved = await evaluate('window.electronAPI.knowledgeCards.reviewQueue()');
      assert.equal(saved.reviewedToday, 2);
      assert.equal(saved.due, 1);
      assert.equal(saved.cards[0].back, 'Exact source — العِلْمُ');
      fs.writeFileSync(path.join(directory, 'restart.json'), JSON.stringify({ processRestart: true, reviewedToday: saved.reviewedToday, due: saved.due }));
      app.quit();
      return;
    }
    const results = [];
    for (const language of ['ar', 'en']) {
      await until('!!window.electronAPI?.knowledgeCards?.reviewQueue && !!document.querySelector("footer")');
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await pause(1500);
      await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
      await owner.loadURL('http://localhost:3000');
      await until('!!window.electronAPI?.knowledgeCards?.reviewQueue && !!document.querySelector("footer")');
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      await pause(1500);
      const front = `نَصٌّ محفوظ — Review ${language}`;
      const card = await evaluate(`window.electronAPI.knowledgeCards.save({front:${JSON.stringify(front)},back:'إجابة — Answer',sourceKind:'note',sourceRef:'note:srs-live-${language}'})`);
      await evaluate(`window.electronAPI.knowledgeCards.setMemorizing(${JSON.stringify(card.id)},true)`);
      await evaluate(`Array.from(document.querySelectorAll('aside button')).find(button=>button.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'سجل الملاحظات' : 'Notes Log')})?.click()`);
      await until('!!document.querySelector("[data-srs-card]")');
      assert.equal(await evaluate('document.querySelector("[data-srs-review]").dir'), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await evaluate('!!document.querySelector("[data-srs-answer]")'), false);
      await evaluate('document.querySelector("[data-srs-reveal]").click()');
      await until('!!document.querySelector("[data-srs-answer]")');
      assert.ok((await evaluate('document.querySelector("[data-srs-review]").textContent')).includes('إجابة — Answer'));
      await fs.promises.writeFile(path.join(directory, `review-${language}.png`), (await owner.webContents.capturePage()).toPNG());
      await evaluate('document.querySelector(\'[data-srs-rating="3"]\').click()');
      await until('!document.querySelector("[data-srs-card]")');
      const queue = await evaluate('window.electronAPI.knowledgeCards.reviewQueue()');
      assert.equal(queue.reviewedToday, results.length + 1);
      assert.equal(queue.due, 0);
      assert.equal((await evaluate(`window.electronAPI.knowledgeCards.list({search:${JSON.stringify(front)}})`))[0].front, front);
      await owner.loadURL('http://localhost:3000');
      await until('!!window.electronAPI?.knowledgeCards?.reviewQueue && !!document.querySelector("footer")');
      assert.equal((await evaluate('window.electronAPI.knowledgeCards.reviewQueue()')).reviewedToday, results.length + 1);
      results.push({ language, reveal: true, grade: true, reload: true, canonicalText: true });
    }
    const note = await evaluate("window.electronAPI.studyNotes.save({title:'Note export — مُراجعة',content:'Exact source — العِلْمُ',aliases:[],tags:[]})");
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await pause(1500);
    await evaluate("Array.from(document.querySelectorAll('aside button')).find(button=>button.getAttribute('aria-label')==='Notes Log')?.click()");
    await until(`!!document.querySelector('[data-study-note="${note.id}"]')`);
    await evaluate(`Array.from(document.querySelector('[data-study-note="${note.id}"]').querySelectorAll('button')).find(button=>button.textContent==='Create review card from note').click()`);
    await until('!!document.querySelector("[data-srs-card]")');
    const exported = await evaluate('window.electronAPI.knowledgeCards.reviewQueue()');
    assert.equal(exported.cards[0].sourceRef, `note:${note.id}`);
    assert.equal(exported.cards[0].back, 'Exact source — العِلْمُ');
    assert.equal((await evaluate('window.electronAPI.studyNotes.list()')).find(item => item.id === note.id).content, 'Exact source — العِلْمُ');
    results.push({ noteExport: true, unchangedOriginal: true });
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ directory, passed: results }));
    app.quit();
  })().catch(error => { console.error(error); app.exit(1); });
});
require('../../dist/main/index.js');
