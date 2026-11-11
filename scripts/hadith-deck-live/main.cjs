// KEY-319 live check: a memorization deck from a range of hadiths, in ar and en, on a throwaway profile
// with a disposable copy of the hadith corpus. The back of each card must equal the installed text.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_HADITH_DECK_DIR;
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
  const setValue = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
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
      await evaluate("document.querySelector('[data-nav-item=\"notes\"]').click()");
      await until("!!document.querySelector('[data-notes-tab=\"cards\"]')");
      await evaluate("document.querySelector('[data-notes-tab=\"cards\"]').click()");
      await until("!!document.querySelector('[data-card-decks]')");
      await evaluate("(()=>{const d=document.querySelector('[data-card-decks]');d.open=true;d.scrollIntoView({block:'start'});})()");
      await setValue('[data-card-decks] input[dir="auto"]', language === 'ar' ? 'بدء الوحي' : 'Revelation');
      await evaluate("(()=>{const d=document.querySelector('[data-hadith-deck]');d.open=true;d.dispatchEvent(new Event('toggle'));})()");
      await until("!!document.querySelector('[data-hadith-deck-collection]') && !!document.querySelector('[data-hadith-deck-generate]')", 200);
      await setValue('[data-hadith-deck-collection]', 'Bukhari');
      await until("(document.querySelector('[data-hadith-deck]').textContent||'').match(/\\d+\\s*[–-]\\s*\\d+/)", 100);
      const chapter = Number(await evaluate("document.querySelector('[data-hadith-deck-chapter]').value"));
      const first = Number(await evaluate("document.querySelector('[data-hadith-deck-from]').value"));
      await setValue('[data-hadith-deck-to]', first + 2);
      await pause(300);
      result.collections = await evaluate("[...document.querySelectorAll('[data-hadith-deck-collection] option')].map(o=>o.value)");
      await evaluate("document.querySelector('[data-hadith-deck-generate]').click()");
      await until("!!document.querySelector('[data-card-decks] [role=status]')", 100);
      result.status = await evaluate("document.querySelector('[data-card-decks] [role=status]').textContent");
      await shot(`hadith-deck-${language}-1280`);
      const cards = await evaluate("window.electronAPI.knowledgeCards.list({}).then(c=>c.filter(x=>x.sourceKind==='hadith').map(x=>({front:x.front,back:x.back,ref:x.sourceRef})))");
      const stored = await evaluate(`window.electronAPI.sunnah.chapter('Bukhari',${chapter}).then(r=>r.data.hadiths.map(h=>({id:h.id,number:String(h.number),text:h.text.ar.matn||h.text.ar.full})))`);
      const expected = stored.filter(hadith => { const n = Number.parseInt(hadith.number, 10); return n >= first && n <= first + 2; });
      result.cards = cards.length; result.expected = expected.length; result.chapter = chapter; result.first = first;
      result.exact = expected.every(hadith => cards.some(card => card.ref === `sunnah:Bukhari:${chapter}:${hadith.id}` && card.back === hadith.text));
      // A range with no hadiths says so instead of failing silently.
      await setValue('[data-hadith-deck-from]', 99990); await setValue('[data-hadith-deck-to]', 99991); await pause(300);
      await setValue('[data-card-decks] input[dir="auto"]', 'empty');
      await evaluate("document.querySelector('[data-hadith-deck-generate]').click()");
      await until("!!document.querySelector('[data-hadith-deck] [role=alert]')", 50);
      result.emptyAlert = await evaluate("document.querySelector('[data-hadith-deck] [role=alert]').textContent");
      result.overflow = await evaluate('document.documentElement.scrollWidth>innerWidth');
      for (const card of await evaluate("window.electronAPI.knowledgeCards.list({}).then(c=>c.map(x=>x.id))")) await evaluate(`window.electronAPI.knowledgeCards.remove(${JSON.stringify(card)})`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.ok(result.collections.includes('Bukhari'));
      assert.ok(result.expected >= 1, 'the chosen range has hadiths');
      assert.equal(result.cards, result.expected);
      assert.equal(result.exact, true, 'card backs equal the installed text');
      assert.match(result.emptyAlert, language === 'ar' ? /لا توجد أحاديث/u : /No hadiths/u);
      assert.equal(result.overflow, false);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
