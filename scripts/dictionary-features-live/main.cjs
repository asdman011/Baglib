// KEY-414 live check (one language per launch, window off-screen per KEY-408), with the REAL
// repos/arabic_lexicons-main.zip imported through KEY-413's path and real verses from a copy of the
// poetry corpus:
//   order      Lisān al-ʿArab moved first with the panel's arrows; results follow that order
//   multi-word كتب رحمة استغفر → three tabs; arrow keys move between them (mirrored in RTL); a
//              dictionary chip narrows the results
//   suggest    typing استغ offers headwords; picking one looks it up
//   roots      a root family opens and a word from it opens in a new tab
//   history    an empty search shows the lookups; one re-opens
//   pad        two real verses pasted into the Reading pad show as a two-column qasidah; a word is
//              looked up, added to revision and highlighted everywhere
//   no renderer errors.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_DICT_PROFILE;
const evidence = process.env.BAGLIB_DICT_EVIDENCE;
const language = process.env.BAGLIB_DICT_LANG || 'ar';
const packZipPath = process.env.BAGLIB_DICT_ZIP;

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
    throw new Error(`${error.message}: ${code.slice(0, 240)}`);
  });
  const until = async (code, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${language}.png`), (await owner.webContents.capturePage()).toPNG());
  };
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };
  const click = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing '+${JSON.stringify(selector)});e.click();})()`);
  const setText = (selector, value) =>
    evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});const proto=i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(i,${JSON.stringify(String(value))});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const submitSearch = () => evaluate(`document.querySelector('[data-dictionary-search-input]').form.requestSubmit()`);
  const h2 = () => evaluate(`document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim()`);

  (async () => {
    const results = { language };
    owner.setContentSize(1280, 920);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await evaluate("window.electronAPI.settings.set('onboarding.v1',{seen:true})");
    await loadApp();
    await until('!!window.electronAPI?.dictionaryFeatures && !!document.querySelector("footer")');

    // 1. Import the real pack (KEY-413 path), then order: Lisān first with the panel's arrows.
    const imported = await evaluate(`window.electronAPI.dictionaryImportArabicLexicons({ sourcePath: ${JSON.stringify(packZipPath)}, lang: ${JSON.stringify(language)} })`);
    assert.ok(Array.isArray(imported) && imported.length === 11, '11 dictionaries imported');
    await click('[data-nav-item="notes"]');
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-dictionaries]')`);
    await evaluate(`document.querySelector('[data-dictionaries]').open = true`);
    await until(`document.querySelectorAll('[data-dictionary^="arlex-"]').length === 11`);
    for (let i = 0; i < 12; i++) {
      const first = await evaluate(`document.querySelector('[data-dictionary-order] [data-dictionary]').getAttribute('data-dictionary')`);
      if (first === 'arlex-lisan') break;
      await click('[data-dictionary-move-up="arlex-lisan"]');
      await pause(300);
    }
    await until(`document.querySelector('[data-dictionary-order] [data-dictionary]').getAttribute('data-dictionary')==='arlex-lisan'`);
    results.order = (await evaluate(`window.electronAPI.dictionaryList(${JSON.stringify(language)})`)).map(d => d.id).slice(0, 3);
    assert.equal(results.order[0], 'arlex-lisan');
    await evaluate(`document.querySelector('[data-dictionary-order]').scrollIntoView({block:'center'})`);
    await shot('01-dictionary-order');

    // 2. The lookup window from the command palette's event; empty history at first.
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:open-dictionary', { detail: '' }))`);
    await until(`!!document.querySelector('[data-dictionary-lookup-modal] [data-dictionary-history]')`);

    // 3. Multi-word search → three tabs, results in the user's order, arrows move, chips narrow.
    await setText('[data-dictionary-search-input]', 'كتب رحمة استغفر');
    await submitSearch();
    await until(`document.querySelectorAll('[data-dictionary-tab]').length===3`);
    await until(`document.querySelectorAll('[data-dictionary-entry]').length >= 5`, 200);
    results.firstEntryDict = await evaluate(`document.querySelector('[data-dictionary-entry]').getAttribute('data-dictionary-entry')`);
    assert.equal(results.firstEntryDict, 'arlex-lisan', 'results follow the order');
    await evaluate(`document.querySelector('[data-dictionary-tab][aria-selected="true"]').focus()`);
    const forwardKey = language === 'ar' ? 'ArrowLeft' : 'ArrowRight';
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(forwardKey)},bubbles:true}))`);
    await until(`(document.querySelector('[data-dictionary-tab][aria-selected="true"]')?.getAttribute('data-dictionary-tab'))==='رحمة'`);
    await until(`(await Promise.resolve(document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim()))==='رحمة' && document.querySelectorAll('[data-dictionary-entry]').length >= 3`, 200);
    await until(`document.querySelectorAll('[data-dictionary-chip]').length > 2`);
    const chip = await evaluate(`document.querySelectorAll('[data-dictionary-chip]')[2].getAttribute('data-dictionary-chip')`);
    await click(`[data-dictionary-chip="${chip}"]`);
    await until(`[...document.querySelectorAll('[data-dictionary-entry]')].every(e=>e.getAttribute('data-dictionary-entry')===${JSON.stringify(chip)})`);
    results.chip = chip;
    await shot('02-multi-word-tabs-chip');

    // 4. Suggestions while typing.
    await evaluate(`document.querySelector('[data-dictionary-search-input]').focus()`);
    await setText('[data-dictionary-search-input]', 'استغ');
    await until(`document.querySelectorAll('[data-dictionary-suggestion]').length > 0`);
    results.suggestions = await evaluate(`[...document.querySelectorAll('[data-dictionary-suggestion]')].map(e=>e.textContent)`);
    assert.ok(results.suggestions.length <= 10 && results.suggestions.every(s => s.replace(/[ً-ٰٟ]/gu, '').replace(/[أإآ]/gu, 'ا').startsWith('استغ')));
    await shot('03-suggestions');
    const picked = results.suggestions[0];
    await evaluate(`document.querySelector('[data-dictionary-suggestion]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`);
    await until(`document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim()===${JSON.stringify(picked)}`);
    results.picked = picked;

    // 5. Root family: look up كتب, open a family, click a word → new tab.
    await setText('[data-dictionary-search-input]', 'كتب');
    await submitSearch();
    await until(`!!document.querySelector('[data-entry-root-family]')`, 200);
    await evaluate(`document.querySelector('[data-entry-root-family]').open = true`);
    const member = await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-entry-root-family] [data-root-family-word]')].find(e=>e.textContent.trim()!=='كتب');return b?b.getAttribute('data-root-family-word'):null;})()`);
    assert.ok(member, 'a root family word');
    await click(`[data-entry-root-family] [data-root-family-word="${member}"]`);
    await until(`document.querySelectorAll('[data-dictionary-tab]').length===2 && document.querySelector('[data-dictionary-tab][aria-selected="true"]').getAttribute('data-dictionary-tab')===${JSON.stringify(member.split(/\s+/u)[0])}`);
    results.rootMember = member;
    await shot('04-root-family-tab');

    // 6. History: an empty search shows the lookups; re-open one.
    await setText('[data-dictionary-search-input]', '');
    await submitSearch();
    await until(`!!document.querySelector('[data-dictionary-history-open="رحمة"]')`);
    results.history = await evaluate(`[...document.querySelectorAll('[data-dictionary-history-item]')].map(e=>e.getAttribute('data-dictionary-history-item')).slice(0,6)`);
    await shot('05-history');
    await click('[data-dictionary-history-open="رحمة"]');
    await until(`document.querySelector('[data-dictionary-lookup-modal] h2')?.textContent?.trim()==='رحمة'`);
    results.reopened = await h2();

    // 7. Reading pad with two real verses (copy of the poetry corpus).
    const verses = await evaluate(`(async()=>{
      const r = await window.electronAPI.poetry.search({ query: '', after: 0, limit: 20, language: 'ar' });
      const items = (r && r.ok ? (r.data.items || r.data) : []) || [];
      for (const item of items) {
        const d = await window.electronAPI.poetry.detail(item.id);
        if (!d || !d.ok || d.data.layout_type !== 'bayt') continue;
        const v = JSON.parse(d.data.verses_json);
        if (v.length >= 4) return { id: item.id, title: d.data.title, lines: [v[0] + '\\t' + v[1], v[2] + '\\t' + v[3]] };
      }
      return null;
    })()`);
    assert.ok(verses, 'two real verses from the poetry corpus');
    results.poem = { id: verses.id, title: verses.title };
    await click('[data-open-reading-pad]');
    await until(`!!document.querySelector('[data-reading-pad] [data-reading-pad-text]')`);
    results.padDir = await evaluate(`getComputedStyle(document.querySelector('[data-reading-pad]')).direction`);
    assert.equal(results.padDir, language === 'ar' ? 'rtl' : 'ltr');
    await setText('[data-reading-pad-text]', verses.lines.join('\n'));
    await click('[data-reading-pad-mode]');
    await until(`document.querySelectorAll('[data-reading-pad-verse]').length===2`);
    results.qasidah = await evaluate(`(()=>{const v=document.querySelector('[data-reading-pad-verse]');const s=v.querySelector('[data-hemistich=sadr]').getBoundingClientRect();const a=v.querySelector('[data-hemistich=ajuz]').getBoundingClientRect();return {columns:getComputedStyle(v).gridTemplateColumns.split(' ').length, sadrRightOfAjuz:s.left>a.left, sameRow:Math.abs(s.top-a.top)<4};})()`);
    assert.deepEqual(results.qasidah, { columns: 2, sadrRightOfAjuz: true, sameRow: true }, 'two-column RTL qasidah');
    const word = await evaluate(`(()=>{const w=[...document.querySelectorAll('[data-pad-word]')].find(e=>e.textContent.length>=3);return w.getAttribute('data-pad-word');})()`);
    results.padWord = word;
    await click(`[data-pad-word="${word}"]`);
    await until(`!!document.querySelector('[data-reading-pad-popover] [data-reading-pad-result], [data-reading-pad-popover] [data-reading-pad-add]') || /${language === 'ar' ? 'لا' : 'No'}/.test(document.querySelector('[data-reading-pad-popover]')?.textContent||'')`, 200);
    results.padResults = await evaluate(`document.querySelectorAll('[data-reading-pad-result]').length`);
    if (results.padResults === 0) {
      // A rare inflected form: look up a plain word from the verse instead.
      const fallback = await evaluate(`(()=>{const ws=[...document.querySelectorAll('[data-pad-word]')].map(e=>e.getAttribute('data-pad-word'));return ws.find(w=>w.length>=3&&w!==${JSON.stringify(word)});})()`);
      await click(`[data-pad-word="${fallback}"]`);
      await until(`document.querySelectorAll('[data-reading-pad-result]').length>0`, 200);
      results.padWord = fallback;
      results.padResults = await evaluate(`document.querySelectorAll('[data-reading-pad-result]').length`);
    }
    await click('[data-reading-pad-add]');
    await until(`!!document.querySelector('[data-reading-pad-status]')`);
    results.addStatus = await evaluate(`document.querySelector('[data-reading-pad-status]').textContent`);
    assert.equal(await evaluate(`document.querySelector('[data-reading-pad-status]').getAttribute('role')`), 'status', `added to revision: ${results.addStatus}`);
    await click('[data-reading-pad-highlight]');
    await until(`document.querySelectorAll('[data-pad-highlighted]').length>=1`);
    results.highlighted = await evaluate(`document.querySelectorAll('[data-pad-highlighted]').length`);
    await shot('06-reading-pad-qasidah');
    // The pad keeps its text and highlight.
    await pause(800);
    const saved = await evaluate(`window.electronAPI.dictionaryFeatures.pad().then(r=>r.data)`);
    assert.equal(saved.text, verses.lines.join('\n'));
    assert.equal(saved.highlights.length, 1);

    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon|reminder check failed/iu.test(line));
    assert.deepEqual(results.rendererErrors, [], 'no renderer errors');
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[dictionary-features-live-${language}] passed`, JSON.stringify(results));
    app.exit(0);
  })().catch(error => {
    console.error(`[dictionary-features-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error) + '\n' + JSON.stringify(errors, null, 2));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      img => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
