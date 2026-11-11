// KEY-319 live check: "Make a memorization deck from here" in the Quran reader's ayah menu, in ar and en, on a
// throwaway profile with a disposable Quran pack copy. Al-Baqarah 255-257 must give the same 3 cards as the
// deck panel's API (a second deck with the same range reuses the same 3 cards; no duplicates).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_QURAN_DECK_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch { /* retry */ } await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const setValue = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };
  (async () => {
    const results = {};
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await evaluate("document.querySelector('[data-nav-item=\"quran\"]').click()");
      const pageInput = `input[aria-label=${JSON.stringify(language === 'ar' ? 'انتقال إلى صفحة...' : 'Jump to page...')}]`;
      await until(`!!document.querySelector('[data-quran-mushaf]') && !!document.querySelector(${JSON.stringify(pageInput)})`, 200);
      await setValue(pageInput, 42);
      await until(`document.querySelector(${JSON.stringify(pageInput)})?.value==='42' && !!document.querySelector('[data-quran-ayah-actions]')`, 100);
      await pause(800);
      await evaluate("document.querySelector('[data-quran-ayah-actions]').click()");
      await until("!!document.querySelector('[data-menu-action=\"memorize-deck\"]')", 50);
      result.menuLabel = await evaluate("document.querySelector('[data-menu-action=\"memorize-deck\"]').textContent.trim()");
      await evaluate("document.querySelector('[data-menu-action=\"memorize-deck\"]').click()");
      await until("!!document.querySelector('[data-quran-deck-dialog]')", 50);
      result.prefilledFrom = Number(await evaluate("document.querySelector('[data-quran-deck-from]')?.value"));
      await setValue('[data-quran-deck-from]', 255);
      await setValue('[data-quran-deck-to]', 257);
      await setValue('[data-quran-deck-name]', `آية الكرسي ${language}`);
      await pause(300);
      result.dialogDir = await evaluate("document.querySelector('[data-quran-deck-dialog]').closest('[dir]')?.getAttribute('dir') || document.documentElement.dir");
      await shot(`dialog-${language}-1280`);
      await evaluate("document.querySelector('[data-quran-deck-create]').click()");
      await until("!document.querySelector('[data-quran-deck-dialog]')", 100);
      await until("[...document.querySelectorAll('[data-feedback-toast]')].some(t=>/3/.test(t.textContent))", 50);
      result.toast = await evaluate("[...document.querySelectorAll('[data-feedback-toast]')].map(t=>t.textContent).join(' | ')");
      const cards = await evaluate("window.electronAPI.knowledgeCards.list({}).then(c=>c.filter(x=>x.sourceKind==='quran').map(x=>({id:x.id,ref:x.sourceRef,back:x.back})))");
      result.refs = cards.map(card => card.ref).sort();
      // The deck panel's API with the same range adds nothing: the same cards, same text.
      const again = await evaluate(`window.electronAPI.knowledgeCards.generateAyahDeck({name:'panel ${language}',surah:2,from:255,to:257,memorize:true})`);
      result.panelCards = again.deck.cards;
      // `added` counts cards linked into that deck; the cards themselves must not be duplicated.
      result.quranCardsAfterPanel = await evaluate("window.electronAPI.knowledgeCards.list({}).then(c=>c.filter(x=>x.sourceKind==='quran').length)");
      result.backsNonEmpty = cards.every(card => card.back && card.back.length > 10);
      for (const card of await evaluate("window.electronAPI.knowledgeCards.list({}).then(c=>c.map(x=>x.id))")) await evaluate(`window.electronAPI.knowledgeCards.remove(${JSON.stringify(card)})`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.menuLabel, language === 'ar' ? 'إنشاء مجموعة حفظ من هذه الآية' : 'Make a memorization deck from here');
      assert.ok(result.prefilledFrom >= 1);
      assert.deepEqual(result.refs, ['quran:hafs:2:255', 'quran:hafs:2:256', 'quran:hafs:2:257']);
      assert.equal(result.panelCards, 3); assert.equal(result.quranCardsAfterPanel, 3, 'the panel reuses the same three cards');
      assert.equal(result.backsNonEmpty, true);
      assert.equal(result.dialogDir, language === 'ar' ? 'rtl' : 'ltr');
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
