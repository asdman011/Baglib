// KEY-232 live check: smart Knowledge Cards on real installed data (disposable copies of the Quran packs and the
// merged Sunnah database). A resting pointer on a mushaf word must open a card with root/lemma and tafsir from the
// packs; a resting pointer on a Bukhari narrator must open a card with narrator details. ar and en.
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
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 220)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(`(async()=>(${code}))()`)) return; } catch { /* retry */ } await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };
  // A real resting pointer: move next to the element, then onto its centre, and wait for the card.
  const hover = async selector => {
    const box = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
    for (let attempt = 0; attempt < 4; attempt++) {
      owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x - 30, y: box.y - 30 }); await pause(120);
      owner.webContents.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y });
      try { await until("!!document.querySelector('[data-knowledge-card]')", 25); return; } catch { /* move again */ }
    }
    throw new Error(`No card opened on ${selector}`);
  };
  const cardText = async () => {
    // Sections load asynchronously; wait until the text stops growing.
    let previous = '';
    for (let i = 0; i < 20; i++) { const text = await evaluate("document.querySelector('[data-knowledge-card]')?.innerText||''"); if (text && text === previous) return text; previous = text; await pause(400); }
    return previous;
  };
  const closeCard = async () => { owner.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 }); await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); await until("!document.querySelector('[data-knowledge-card]')", 30).catch(() => {}); };
  (async () => {
    const results = {};
    for (const language of ['ar', 'en']) {
      const result = {};
      const t = key => evaluate(`window.__baglibT ? window.__baglibT(${JSON.stringify(key)}) : null`);
      await load(language);
      // Quran: a word on the mushaf page.
      await evaluate("document.querySelector('[data-nav-item=\"quran\"]').click()");
      await until("!!document.querySelector('[data-quran-mushaf] [data-surah][data-aya]')", 200);
      await pause(1200);
      result.quranWords = await evaluate("document.querySelectorAll('[data-quran-mushaf] [data-surah][data-aya]').length");
      result.cardSource = await evaluate("({script:document.querySelector('[data-card-script]')?.dataset.cardScript||null,tafsir:document.querySelector('[data-card-script]')?.dataset.cardTafsir||null})");
      await hover('[data-quran-mushaf] [data-surah][data-aya]:nth-of-type(2)');
      result.quranCard = await cardText();
      await shot(`quran-card-${language}`);
      await closeCard();
      // Sunnah: a narrator in a Bukhari isnad.
      await evaluate("document.querySelector('[data-nav-item=\"sunnah\"]').click()");
      await until("!!document.querySelector('[data-card-hover]')", 250).catch(async () => {
        result.sunnahDom = await evaluate("[...document.querySelectorAll('button')].slice(0,40).map(b=>b.textContent.trim().slice(0,30)).join(' | ')");
        throw new Error('No narrator tokens: ' + result.sunnahDom);
      });
      await pause(800);
      result.narrators = await evaluate("document.querySelectorAll('[data-card-hover]').length");
      // al-Humaydi (first in Bukhari 1) has no resolved narrator record in the merged database: the card says so.
      await hover('[data-card-hover]');
      result.unresolvedCard = await cardText();
      await closeCard();
      // Yahya ibn Sa'id al-Ansari (third) resolves to rijal 104662: the card shows narrator details.
      await evaluate("(()=>{const el=[...document.querySelectorAll('[data-card-hover]')].find(e=>e.textContent.includes('يَحْيَى بْنُ سَعِيدٍ'));el.setAttribute('data-key232-resolved','');})()");
      await hover('[data-key232-resolved]');
      result.hadithCard = await cardText();
      await shot(`hadith-card-${language}`);
      await closeCard();
      results[language] = { ...result, quranCard: result.quranCard.slice(0, 600), hadithCard: result.hadithCard.slice(0, 600), unresolvedCard: result.unresolvedCard.slice(0, 200) };
      console.log(JSON.stringify({ language, result: results[language] }));
      assert.ok(result.quranWords > 10, 'mushaf words with data-surah/data-aya');
      assert.ok(result.cardSource.script, 'installed script attached to the page');
      const rootLabel = language === 'ar' ? /الجذر|جذر/u : /Root/u;
      assert.match(result.quranCard, rootLabel, 'root/lemma section from the installed morphology');
      if (result.cardSource.tafsir) assert.ok(result.quranCard.length > 120, 'tafsir text from the installed pack');
      assert.ok(result.narrators > 0, 'narrator tokens in the isnad');
      assert.match(result.unresolvedCard, language === 'ar' ? /لا توجد معلومات محلية/u : /No local information/u, 'honest empty state for an unresolved narrator');
      assert.match(result.hadithCard, language === 'ar' ? /الراوي|راو/u : /Narrator/u, 'narrator section for a resolved narrator');
      assert.ok(!/No local information|لا توجد معلومات محلية/u.test(result.hadithCard), 'the resolved narrator has local details');
      // KEY-325: the label names the collection in the interface language, and sources show their names, not keys.
      assert.ok(result.hadithCard.includes(language === 'ar' ? 'صحيح البخاري 1' : 'Sahih al-Bukhari 1'), 'localized collection label');
      assert.ok(!/[a-z]+_[a-z]+/u.test(result.hadithCard), 'no raw source keys');
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
