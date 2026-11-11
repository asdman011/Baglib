import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { searchPoetry, poetryDetail, poetryFacets, searchPoets } from '../../src/main/services/poetry/queries';
import { openPoetryPartition } from '../../src/main/services/poetry/partition';
import { PoetryQueryProcess } from '../../src/main/services/poetry/process';
import { PoetryKnowledgeService, validatePoetrySave } from '../../src/main/services/poetry/knowledge';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import type { PoetryDetail, PoetrySummary } from '../../src/shared/types/poetry';

const directory = process.env.BAGLIB_POETRY_UI_LIVE!;
const evidence = process.env.BAGLIB_POETRY_UI_EVIDENCE!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const shared: string[] = [];
  const partitionPath = process.env.BAGLIB_POETRY_PARTITION!;
  const database = new Database(partitionPath, { readonly: true });
  const worker = new PoetryQueryProcess(path.join(directory, 'poetry-worker.cjs'), partitionPath);
  const english = openPoetryPartition(path.join(directory, 'english-fixture'));
  const notesDatabase = new Database(path.join(directory, 'notes.sqlite'));
  runMigrations(notesDatabase, migrations);
  const knowledge = new PoetryKnowledgeService(notesDatabase);
  english.prepare("INSERT INTO poets(id,name,name_normalized,language) VALUES(1,'Fixture Poet','fixture poet','en')").run();
  english.prepare("INSERT INTO poems(id,poet_id,title,title_normalized,language,layout_type,verses_json,search_text_normalized,verse_count) VALUES(9000001,1,'English layout fixture','english layout fixture','en','stanza',?,'fixture',6)").run(JSON.stringify(['The pale light folds across the water,', 'and every reed leans toward the morning;', '', 'what the river carried, it kept,', 'what it kept, it gave back slowly,', 'as one gives back a borrowed name.']));
  ipcMain.handle('sunnah:share', (_, text) => { shared.push(text); return { ok: true, data: null }; });
  ipcMain.handle('poetry:status', () => ({ ok: true, data: { phase: 'ready', downloaded: 0, total: null, imported: 254630 } }));
  ipcMain.handle('poetry:save-knowledge', async (_, input) => {
    validatePoetrySave(input);
    const poem = input.poemId === 9000001 ? poetryDetail(english, input.poemId) : await worker.query('detail', input.poemId);
    return { ok: true, data: knowledge.save(input, poem as PoetryDetail) };
  });
  ipcMain.handle('poetry:saved', (_, offset) => ({ ok: true, data: knowledge.list(offset) }));
  ipcMain.handle('poetry:narrations', () => ({ ok: true, data: [] }));
  ipcMain.handle('poetry:variants', () => ({ ok: true, data: [] }));
  ipcMain.handle('poetry:search', async (_, query) => ({ ok: true, data: query.language === 'en' ? searchPoetry(english, query) : await worker.query('search', query) }));
  ipcMain.handle('poetry:poets', async (_, query) => ({ ok: true, data: query.language === 'en' ? searchPoets(english, query) : await worker.query('poets', query) }));
  ipcMain.handle('poetry:facets', () => ({ ok: true, data: { ...poetryFacets(database), languages: [{ language: 'ar', count: 254630 }, { language: 'en', count: 1 }] } }));
  ipcMain.handle('poetry:detail', async (_, id) => ({ ok: true, data: id === 9000001 ? poetryDetail(english, id) : await worker.query('detail', id) }));
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'plugins:list', 'tags:get-all']) ipcMain.handle(channel, () => []);
  for (const channel of ['ai:get-settings', 'settings:get']) ipcMain.handle(channel, () => null);
  ipcMain.handle('tts:get-voices', () => []);
  ipcMain.handle('tts:get-status', () => ({ providerId: 'pocket-tts', available: false, running: false, supportedLanguages: [], activeLanguages: [] }));
  const window = new BrowserWindow({ width: 1280, height: 900, show: false, backgroundColor: '#101820', webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(directory, 'preload.cjs') } });
  window.webContents.setAudioMuted(true);
  const errors: string[] = [];
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, callback) => callback({ cancel: true }));
  window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (script: string) => window.webContents.executeJavaScript(script);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  window.webContents.on('did-finish-load', () => { window.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (script: string) => { for (let index = 0; index < 200; index++) { if (await evaluate(script)) return; await sleep(50); } throw new Error(`Timed out: ${script}`); };
  const shot = async (name: string) => fs.writeFile(path.join(evidence, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  const clickText = (text: string, scope = 'button') => evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(scope)})).find(node=>node.textContent.trim()===${JSON.stringify(text)}).click()`);
  const rect = (selector: string) => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`) as Promise<{ x: number; y: number; w: number; h: number; cx: number; cy: number }>;
  const visibleActions = () => evaluate(`Array.from(document.querySelectorAll('[data-poetry-line-actions]')).filter(node=>parseFloat(getComputedStyle(node).opacity)>0.05).length`) as Promise<number>;
  const results: Record<string, unknown> = {};
  // Opens a poem the way a reader does: search for it in the list and click its card (no verse reference, so nothing is pre-selected).
  const openFromList = async (title: string, id: number) => {
    await evaluate(`(()=>{const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(title)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(700);
    await until(`Array.from(document.querySelectorAll('article h2 button')).some(b=>b.textContent===${JSON.stringify(title)})`);
    await evaluate(`Array.from(document.querySelectorAll('article h2 button')).find(b=>b.textContent===${JSON.stringify(title)}).click()`);
    await until(`document.querySelector('[data-poetry-id="${id}"]')!==null&&document.querySelector('[data-poetry-poem]')!==null`);
  };
  try {
    // Pick real poems from the copy: a classical bayt poem and (if found) a single-line form.
    const searched = await worker.query('search', { language: 'ar', query: 'قفا نبك من ذكرى حبيب ومنزل', limit: 40 }) as { items: PoetrySummary[] };
    const bayt = searched.items.find(item => item.layoutType === 'bayt' && item.verseCount >= 10 && item.verseCount <= 60) ?? searched.items.find(item => item.layoutType === 'bayt');
    assert.ok(bayt, 'a classical bayt poem exists in the corpus copy');
    let single: PoetrySummary | undefined;
    for (let after = 0, page = 0; page < 6 && !single; page++) {
      const found = await worker.query('search', { language: 'ar', query: '', limit: 40, after }) as { items: PoetrySummary[]; next: number | null };
      single = found.items.find(item => item.layoutType === 'free_verse' && item.verseCount >= 4 && item.verseCount <= 40);
      if (found.next === null) break; after = found.next;
    }
    results.poems = { bayt: { id: bayt.id, title: bayt.title, verses: bayt.verseCount }, single: single ? { id: single.id, title: single.title, verses: single.verseCount } : null };
    await window.loadFile(path.join(directory, 'index.html'));
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.poetryClipboard=text}}})`);
    for (const lang of ['ar', 'en'] as const) for (const theme of ['dark', 'light'] as const) for (const width of [1280, 480]) {
      const tag = `${lang}-${theme}-${width}`;
      window.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib-theme','${theme}')`);
      window.webContents.reload();
      await until('document.querySelectorAll("article").length>0');
      await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.poetryClipboard=text}}})`);
      await until(`window.poetryLive?.theme==='${theme}' && document.documentElement.classList.contains('dark')===${theme === 'dark'}`);
      await until(`document.documentElement.dir==='${lang === 'ar' ? 'rtl' : 'ltr'}'`);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), `${tag}: list overflows`);
      await sleep(500);
      await shot(`01-list-${tag}`);
      // Classical poem.
      await openFromList(bayt.title, bayt.id);
      await until('document.fonts.status==="loaded"');
      await sleep(250);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), `${tag}: poem overflows`);
      const rows = await evaluate('document.querySelectorAll("[data-poetry-kind=hemistichs]").length') as number;
      assert.ok(rows > 4, `${tag}: hemistich rows rendered`);
      const metrics = await evaluate(`(()=>{const row=document.querySelector('[data-poetry-kind=hemistichs]');const [a,b]=row.querySelectorAll('[data-poetry-hemistich]');const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();const poem=document.querySelector('[data-poetry-poem]').getBoundingClientRect();const scroller=poem.parentElement?document.querySelector('[data-poetry-poem]').parentElement.getBoundingClientRect():poem;return {aw:ra.width,bw:rb.width,sameTop:Math.abs(ra.top-rb.top)<2,stackedBelow:rb.top-ra.bottom,alignA:getComputedStyle(a).textAlign,alignB:getComputedStyle(b).textAlign,font:getComputedStyle(a).fontFamily,poemCenter:poem.x+poem.width/2,scrollerCenter:scroller.x+scroller.width/2,maxW:poem.width,sadrText:a.textContent,ajuzText:b.textContent}})()`) as Record<string, unknown>;
      assert.match(String(metrics.font), /Amiri/);
      assert.equal(metrics.alignA, 'center'); assert.equal(metrics.alignB, 'center');
      assert.ok(Math.abs(Number(metrics.poemCenter) - Number(metrics.scrollerCenter)) <= 2, `${tag}: poem block centred`);
      assert.ok(Number(metrics.maxW) <= 896 + 1, `${tag}: comfortable max width`);
      if (width === 1280) { assert.ok(metrics.sameTop, `${tag}: halves side by side`); assert.ok(Math.abs(Number(metrics.aw) - Number(metrics.bw)) <= 1, `${tag}: equal columns`); }
      else { assert.ok(Number(metrics.stackedBelow) >= -1 && !metrics.sameTop, `${tag}: halves stack at 480`); }
      assert.equal(await visibleActions(), 0, `${tag}: no per-line actions visible at rest`);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-poetry-row] > button, [data-poetry-row] > div > button')).filter(b=>{const g=b.closest('[data-poetry-line-actions]');return !g}).length`), 0, `${tag}: no loose per-line buttons`);
      assert.ok(await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-poetry-kind=hemistichs]')].slice(0,6);return rows.every(r=>{const [a,b]=r.querySelectorAll('[data-poetry-hemistich]');return getComputedStyle(a).lineHeight!=='normal'&&parseFloat(getComputedStyle(a).lineHeight)>=parseFloat(getComputedStyle(a).fontSize)*2})})()`), `${tag}: generous line height`);
      await shot(`02-poem-${tag}`);
      if (lang === 'ar' && theme === 'dark') {
        // Hover (mouse) reveals the floating icon group on that line only.
        const second = await rect('[data-poetry-row-index="1"]');
        window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(second.cx), y: Math.round(second.cy) });
        await sleep(400);
        assert.equal(await visibleActions(), 1, `${tag}: exactly one line shows actions on hover`);
        await shot(`03-hover-${tag}`);
        window.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
        await sleep(300);
        assert.equal(await visibleActions(), 0, `${tag}: actions hide again`);
        // Copy from the hover icon group, with the citation.
        const poem = await worker.query('detail', bayt.id) as PoetryDetail;
        const verses = JSON.parse(poem.verses_json) as string[];
        const copyLabel = await evaluate('window.poetryLive.t("bayanCopyVerse")') as string;
        await evaluate(`document.querySelector('[data-poetry-row-index="1"] [data-poetry-line-actions] button[aria-label=${JSON.stringify(copyLabel)}]').click()`);
        await until('window.poetryClipboard');
        const citation = [poem.poet_name, poem.title, poem.meter].filter(Boolean).join(' — ');
        assert.equal(await evaluate('window.poetryClipboard'), `${verses[2]} *** ${verses[3]}\n${citation}`);
        // Keyboard: focus the row, press the copy key.
        await evaluate('window.poetryClipboard=null;document.querySelector(\'[data-poetry-row-index="2"]\').focus()');
        await sleep(300);
        assert.equal(await visibleActions(), 1, `${tag}: focus reveals the line actions`);
        await shot(`04-focus-${tag}`);
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'c' }); window.webContents.sendInputEvent({ type: 'char', keyCode: 'c' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'c' });
        await until('window.poetryClipboard');
        assert.equal(await evaluate('window.poetryClipboard'), `${verses[4]} *** ${verses[5]}\n${citation}`);
        // The share payload uses the same text and citation as Copy.
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 's' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 's' });
        await sleep(200);
        assert.equal(shared.at(-1), `${verses[4]} *** ${verses[5]}\n${citation}`);
        // Keyboard: Enter selects the line, ArrowDown moves focus.
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
        await until('document.querySelector(\'[data-poetry-row-index="2"]\').getAttribute("aria-selected")==="true"');
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
        await until('document.activeElement?.getAttribute("data-poetry-row-index")==="3"');
        // Header: copy the selection, then the whole poem.
        await evaluate('window.poetryClipboard=null');
        await clickText(await evaluate('window.poetryLive.t("bayanCopySelection")') as string, 'header button');
        await until('window.poetryClipboard');
        assert.equal(await evaluate('window.poetryClipboard'), `${verses[4]} *** ${verses[5]}\n${citation}`);
        await shot(`05-selection-${tag}`);
        await evaluate('window.poetryClipboard=null');
        await clickText(await evaluate('window.poetryLive.t("bayanCopyPoem")') as string, 'header button');
        await until('window.poetryClipboard');
        assert.equal((await evaluate('window.poetryClipboard') as string).split('\n').length, Math.ceil(verses.length / 2) + 1);
        // Save a note from the hover group.
        const saveLabel = await evaluate('window.poetryLive.t("bayanSaveNote")') as string;
        await evaluate(`document.querySelector('[data-poetry-row-index="0"] [data-poetry-line-actions] button[aria-label=${JSON.stringify(saveLabel)}]').click()`);
        await until('document.querySelector(\'[role=status]\')!==null');
        // Header chrome.
        const chrome = await evaluate(`(()=>{const h=document.querySelector('[data-poetry-header]');return {title:h.querySelector('h1').textContent,chips:[...h.querySelectorAll('dt')].map(n=>n.textContent)}})()`) as { title: string; chips: string[] };
        const chipLabels = await Promise.all(['bayanEra', 'bayanMeter', 'bayanRhyme'].map(key => evaluate(`window.poetryLive.t(${JSON.stringify(key)})`) as Promise<string>));
        assert.ok(chrome.title && chipLabels.filter(label => chrome.chips.includes(label)).length >= 2, 'poem header shows title, metre, era/rhyme chips');
        results.chrome = chrome;
        // Long-press on touch opens the actions group.
        await evaluate(`(()=>{const row=document.querySelector('[data-poetry-row-index="4"]');const r=row.getBoundingClientRect();row.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:r.x+20,clientY:r.y+10}))})()`);
        await sleep(700);
        // Since KEY-316 a touch long-press opens the shared line context menu with the same actions.
        assert.equal(await evaluate('!!document.querySelector("[data-baglib-menu]")'), true, 'long-press opens the line action menu');
        assert.ok((await evaluate('document.querySelectorAll("[data-baglib-menu] [role=menuitem]").length') as number) >= 4, 'menu lists the line actions');
        await shot(`06-longpress-${tag}`);
        await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      }
      if (width === 480 && lang === 'ar') await shot(`07-stacked-${tag}`);
      // Single-line form is centred.
      if (single && lang === 'ar' && theme === 'light') {
        await clickText(await evaluate('window.poetryLive.t("bayanBack")') as string, 'header button');
        await until('document.querySelectorAll("article").length>0');
        await evaluate(`window.poetryOpen({poemId:${single.id},from:0,to:0})`);
        await until('document.querySelector("[data-poetry-kind=single]")!==null');
        await sleep(250);
        assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-poetry-kind=single] [data-poetry-line]")).textAlign'), 'center');
        await shot(`08-single-${tag}`);
      }
      // English stanza poem.
      if (lang === 'en' && theme === 'light') {
        await clickText(await evaluate('window.poetryLive.t("bayanBack")') as string, 'header button');
        await until('document.querySelectorAll("article").length>0');
        await evaluate(`window.poetryOpen({poemId:9000001,from:0,to:0})`);
        await until('document.querySelector("[data-poetry-poem]")?.dir==="ltr"');
        await sleep(250);
        assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'));
        await shot(`09-english-${tag}`);
      }
    }
    results.rendererErrors = errors;
    assert.deepEqual(errors, [], 'no renderer errors');
    await fs.writeFile(path.join(evidence, 'poetry-ui-live-result.json'), JSON.stringify(results, null, 2));
    console.log('Poetry UI live checks passed:', JSON.stringify(results.poems));
  } catch (error) {
    await fs.writeFile(path.join(evidence, 'poetry-ui-live-failure.json'), JSON.stringify({ error: String(error), results, text: await evaluate('document.body.innerText.slice(0,2000)').catch(() => ''), errors }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { window.destroy(); worker.close(); database.close(); english.close(); notesDatabase.close(); app.exit(process.exitCode || 0); }
});
