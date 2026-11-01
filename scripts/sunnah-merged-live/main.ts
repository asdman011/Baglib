import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { registerSunnahIpc } from '../../src/main/ipc/sunnah';
import { SunnahResearchCorpus } from '../../src/main/services/sunnah/research-corpus';

const root = process.cwd(), directory = process.env.BAGLIB_SUNNAH_LIVE!;
const output = path.join(root, 'tools/hadith-alignment/data/output');
app.setPath('userData', path.join(directory, 'profile')); app.setAppPath(root);

app.whenReady().then(async () => {
  registerSunnahIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const window = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/preload/index.js') } });
  const errors: string[] = []; window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  const until = async (code: string) => { for (let n = 0; n < 300; n++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 80)); } throw new Error('Timed out: ' + code); };
  const shot = async (name: string) => fs.writeFile(path.join(directory, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  const open = async (collection: string, chapter: number, hadith: string) => {
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:sunnah-open',{detail:${JSON.stringify({ collection, chapter, hadith })}}))`);
    await until(`Boolean(document.querySelector('[data-hadith-id="${hadith}"] .sunnah-research-tabs button'))`);
  };
  const selector = (hadith: string) => `[data-hadith-id="${hadith}"]`;
  const results: Record<string, unknown> = {};
  try {
    await window.loadFile(path.join(directory, 'index.html'));
    await until('Boolean(window.sunnahLive)');
    const catalog = await evaluate('window.electronAPI.sunnah.catalog()');
    assert.ok(catalog.data.hadithCount > 67611); assert.equal(catalog.data.collections.length, 15);
    assert.equal(catalog.data.merged.revision, '9e5d61d8cff3c3b95745e11f9d0fe2efccb6126d');

    const db = new Database(path.join(output, 'sunnah_merged_quranlab_v1.sqlite'), { readonly: true });
    const pick = (sql: string) => db.prepare(sql).get() as { id: number; chapter: number };
    const opposed = pick("SELECT h.id,CAST(h.Chapter_Number AS INTEGER) chapter FROM hadith_grading_summary s JOIN hadiths h ON h.id=s.hadith_id WHERE s.opposed=1 AND h.book_key='AbuDaud' ORDER BY h.id LIMIT 1");
    const muwatta = pick("SELECT h.id,CAST(h.Chapter_Number AS INTEGER) chapter FROM variant_translation_fts v JOIN hadiths h ON h.id=v.rowid JOIN hadith_crosswalk c ON c.hadith_id=h.id WHERE h.book_key='MuwattaMalik' AND c.relation='one_to_one' ORDER BY h.id LIMIT 1");
    const bukhari = pick("SELECT h.id,CAST(h.Chapter_Number AS INTEGER) chapter FROM hadith_crosswalk c JOIN hadiths h ON h.id=c.hadith_id WHERE c.collection='hadeethenc' AND h.book_key='Bukhari' ORDER BY h.id LIMIT 1");
    db.close();

    // Saved notes and references key on these ids, so they must match the old database.
    const legacy = new SunnahResearchCorpus(path.join(output, 'sunnah_kutub_tisah_itqan.sqlite'));
    let compared = 0;
    for (const collection of legacy.catalog.collections) {
      for (const chapter of collection.chapters.slice(0, 3)) {
        const next = await evaluate(`window.electronAPI.sunnah.chapter(${JSON.stringify(collection.id)},${chapter.number})`);
        const old = legacy.chapter(collection.id, chapter.number);
        assert.deepEqual(next.data.hadiths.map((item: { id: string; researchId: number }) => [item.id, item.researchId]), old.hadiths.map(item => [item.id, item.researchId]));
        compared += old.hadiths.length;
      }
    }
    legacy.close();
    results.identitiesCompared = compared;

    const find = async (collection: string, chapter: number, id: number) => { const data = await evaluate(`window.electronAPI.sunnah.chapter(${JSON.stringify(collection)},${chapter})`); return data.data.hadiths.find((item: { researchId: number }) => item.researchId === id); };
    const opposedRow = await find('AbuDaud', opposed.chapter, opposed.id);
    const muwattaRow = await find('MuwattaMalik', muwatta.chapter, muwatta.id);
    const bukhariRow = await find('Bukhari', bukhari.chapter, bukhari.id);
    assert.ok(opposedRow.gradingSummary.opposed); assert.ok(muwattaRow.translation); assert.equal(bukhariRow.gradingSummary, undefined);

    for (const language of ['ar', 'en']) {
      if (await evaluate('window.sunnahLive.lang') !== language) await evaluate('window.sunnahLive.toggleLanguage()');
      await until(`document.querySelector('.sunnah-workspace').dir===${JSON.stringify(language === 'ar' ? 'rtl' : 'ltr')}`);
      await open('AbuDaud', opposed.chapter, opposedRow.id);
      await evaluate(`document.querySelector('${selector(opposedRow.id)} .sunnah-grading-line button').click()`);
      await until(`document.querySelectorAll('${selector(opposedRow.id)} .sunnah-judgment').length>=2`);
      assert.ok(await evaluate(`Boolean(document.querySelector('${selector(opposedRow.id)} .sunnah-grading-flag.is-opposed'))`));
      assert.equal(await evaluate(`document.querySelector('${selector(opposedRow.id)} .sunnah-judgment strong').getAttribute('dir')`), 'rtl');
      for (const width of [480, 1280]) {
        window.setContentSize(width, 1000);
        await evaluate(`document.querySelector('${selector(opposedRow.id)} .sunnah-judgments').scrollIntoView({block:'start'})`);
        await new Promise(resolve => setTimeout(resolve, 150));
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), `overflow ${language} ${width}`);
        assert.ok(await evaluate(`document.querySelector('${selector(opposedRow.id)} .sunnah-judgments').scrollWidth<=document.querySelector('${selector(opposedRow.id)} .sunnah-judgments').clientWidth+1`));
        await shot(`grading-${language}-${width}`);
      }
      await open('MuwattaMalik', muwatta.chapter, muwattaRow.id);
      const translated = await evaluate(`document.querySelector('${selector(muwattaRow.id)} .sunnah-english .sunnah-passage')?.innerText ?? ''`);
      assert.ok(translated.length > 10, 'Muwatta English shown');
      assert.ok(await evaluate(`document.querySelector('${selector(muwattaRow.id)}').innerText.includes(window.sunnahLive.t('sunnahVariantEnglishUsed'))`));
      await evaluate(`[...document.querySelectorAll('${selector(muwattaRow.id)} .sunnah-research-tabs button')].at(-1).click()`);
      await until(`Boolean(document.querySelector('${selector(muwattaRow.id)} .sunnah-field-sources li'))`);
      await evaluate(`document.querySelector('${selector(muwattaRow.id)} .sunnah-field-sources').scrollIntoView({block:'start'})`);
      await new Promise(resolve => setTimeout(resolve, 150));
      await shot(`sources-${language}`);
      await open('Bukhari', bukhari.chapter, bukhariRow.id);
      assert.equal(await evaluate(`document.querySelector('${selector(bukhariRow.id)} .sunnah-grading-line')`), null);
      assert.equal(await evaluate(`document.querySelector('${selector(bukhariRow.id)} .sunnah-grade')`), null);
    }

    await evaluate(`[...document.querySelectorAll('${selector(bukhariRow.id)} .sunnah-research-tabs button')][0].click()`);
    await until(`document.querySelectorAll('${selector(bukhariRow.id)} .sunnah-judgment').length>0`);
    const origins = await evaluate(`[...document.querySelectorAll('${selector(bukhariRow.id)} .sunnah-judgment')].map(item=>item.dataset.origin)`);
    assert.ok(origins.every((origin: string) => origin === 'quranlab_hadeethenc'), 'no collection-wide grade in the Bukhari list');

    for (const book of ['Nawawi40', 'Qudsi40', 'Dehlawi40', 'HadeethEnc', 'SourceOnly', 'ReviewQueue']) {
      await evaluate(`(()=>{const s=document.querySelector('.sunnah-browser select');s.value=${JSON.stringify(book)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      await until(`Boolean(document.querySelector('[data-hadith-id^="${book}:"] .sunnah-passage'))`);
      await until('document.documentElement.scrollWidth<=innerWidth+1');
      await shot(`book-${book}`);
    }
    await until('Boolean(document.querySelector(\'[data-hadith-id^="ReviewQueue:"] .sunnah-grading-flag\'))');
    const nawawi = await evaluate(`window.electronAPI.sunnah.search({text:'الأعمال بالنيات',collection:'Nawawi40'})`);
    assert.ok(nawawi.ok && nawawi.data.length > 0, 'a new book is searchable');
    const opened = await evaluate(`window.electronAPI.sunnah.chapter('HadeethEnc',1)`);
    const encyclopedia = await evaluate(`window.electronAPI.sunnah.research(${opened.data.hadiths[0].researchId})`);
    assert.ok(encyclopedia.data.merged.explanations.length > 0 && encyclopedia.data.merged.judgments.length > 0);
    const queued = await evaluate(`window.electronAPI.sunnah.chapter('ReviewQueue',1)`);
    assert.equal(queued.data.hadiths[0].sourceBook.kind, 'review');
    results.newBooks = 6;
    const hits = await evaluate(`window.electronAPI.sunnah.search({text:'Yahya related to me',collection:'MuwattaMalik'})`);
    assert.ok(hits.ok && hits.data.length > 0, 'variant English is searchable');
    assert.ok(hits.data[0].hadith.translation);

    await open('Bukhari', bukhari.chapter, bukhariRow.id);
    // A hidden window has no focus for navigator.clipboard, so capture at that call.
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedText=text}}})`);
    await evaluate(`[...document.querySelectorAll('${selector(bukhariRow.id)} button')].find(item=>item.textContent.trim()===window.sunnahLive.t('sunnahCopy')).click()`);
    await until('typeof window.copiedText==="string"');
    results.copiedChars = await evaluate('window.copiedText.length');
    assert.ok(Number(results.copiedChars) > 20, 'copy still formats the hadith');
    await evaluate(`(()=>{const area=document.querySelector('${selector(bukhariRow.id)} textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'live reflection');area.dispatchEvent(new Event('input',{bubbles:true}));area.dispatchEvent(new Event('change',{bubbles:true}));area.dispatchEvent(new FocusEvent('blur',{bubbles:true}));area.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))})()`);
    await until(`localStorage.getItem('baglib:sunnah:reflection:${bukhariRow.id}')==='live reflection'`);
    results.reflectionSavedForStableId = bukhariRow.id;
    await open('AbuDaud', opposed.chapter, opposedRow.id);
    results.navigationAfterGrading = true;
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, records: 67611, languages: ['ar', 'en'], widths: [480, 1280], opposed: opposed.id, muwatta: muwatta.id, bukhari: bukhari.id, ...results }, null, 2));
    console.log('Merged Sunnah live checks passed: ' + directory);
  } catch (error) {
    await shot('failure').catch(() => {});
    await fs.writeFile(path.join(directory, 'failure.txt'), `${String(error)}\n${errors.join('\n')}\n${String(await evaluate('document.body.innerText').catch(() => '')).slice(0, 1500)}`);
    console.error(error); process.exitCode = 1;
  } finally { window.destroy(); }
  app.quit();
});
