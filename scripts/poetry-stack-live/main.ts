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

const directory = process.env.BAGLIB_POETRY_STACK_LIVE!;
const evidence = process.env.BAGLIB_POETRY_STACK_EVIDENCE!;
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
  // Every hemistich row must be either side by side with each half on one line, or stacked (the second half under the
  // first). Two columns with a half broken over two lines is the layout the user reported (KEY-351).
  const layout = () => evaluate(`(()=>{const out=[];for(const row of document.querySelectorAll('[data-poetry-kind=hemistichs]')){const [a,b]=row.querySelectorAll('[data-poetry-hemistich]');const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();const st=getComputedStyle(a);const lh=parseFloat(st.lineHeight);const pad=parseFloat(st.paddingTop)+parseFloat(st.paddingBottom);const lines=r=>Math.round((r.height-pad)/lh);out.push({side:Math.abs(ra.top-rb.top)<2,la:lines(ra),lb:lines(rb),below:rb.top>=ra.bottom-1});}return {rows:out,overflow:document.documentElement.scrollWidth>window.innerWidth+1,stacked:document.querySelectorAll('[data-poetry-stacked]').length}})()`) as Promise<{ rows: { side: boolean; la: number; lb: number; below: boolean }[]; overflow: boolean; stacked: number }>;
  const check = async (tag: string) => {
    await sleep(350);
    const state = await layout();
    assert.ok(state.rows.length > 4, `${tag}: rows rendered`);
    assert.equal(state.overflow, false, `${tag}: no horizontal overflow`);
    const broken = state.rows.filter(row => row.side ? row.la > 1 || row.lb > 1 : !row.below);
    assert.equal(broken.length, 0, `${tag}: ${broken.length} rows have a hemistich broken inside a column`);
    const side = state.rows.filter(row => row.side).length;
    assert.ok(side === 0 || side === state.rows.length, `${tag}: one layout for the whole poem (${side}/${state.rows.length} side by side)`);
    return { side: side === state.rows.length, stackedRows: state.stacked, maxLines: Math.max(...state.rows.map(row => Math.max(row.la, row.lb))) };
  };
  try {
    const searched = await worker.query('search', { language: 'ar', query: 'من أرتجي وإلى ما ينتهي أربي', limit: 30 }) as { items: PoetrySummary[] };
    const poem = searched.items.find(item => item.title.includes('أرتجي') && item.layoutType === 'bayt') ?? searched.items.find(item => item.layoutType === 'bayt');
    assert.ok(poem, 'the poem from the report (or another bayt poem) exists in the corpus copy');
    results.poem = { id: poem.id, title: poem.title, verses: poem.verseCount };
    await window.loadFile(path.join(directory, 'index.html'));
    const open = async (lang: 'ar' | 'en', width: number, size: number) => {
      window.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib-theme','light');localStorage.setItem('baglib.poetry.size','${size}')`);
      window.webContents.reload();
      await until('document.querySelectorAll("article").length>0');
      await until(`document.documentElement.dir==='${lang === 'ar' ? 'rtl' : 'ltr'}'`);
      await evaluate(`window.poetryOpen({poemId:${poem.id},from:0,to:1})`);
      await until('document.querySelectorAll("[data-poetry-kind=hemistichs]").length>0');
      await until('document.fonts.status==="loaded"');
    };
    const matrix: Record<string, unknown> = {};
    for (const lang of ['ar', 'en'] as const) for (const width of [1280, 980, 760, 560]) for (const size of [24, 32, 40]) {
      const tag = `${lang}-${width}-${size}`;
      await open(lang, width, size);
      matrix[tag] = await check(tag);
      if ((width === 980 && size === 40) || (width === 1280 && size === 24) || (width === 560 && size === 32)) await shot(`stack-${tag}`);
    }
    results.matrix = matrix;
    assert.equal((matrix['ar-1280-24'] as { side: boolean }).side, true, 'a wide window at the default size keeps the two columns');
    assert.equal((matrix['ar-980-40'] as { side: boolean }).side, false, 'the reported case (large text, medium window) stacks');
    // Live changes without reload: Ctrl+wheel grows the text, then dragging the window narrower and wider again.
    await open('ar', 1280, 24);
    const sequence: unknown[] = [await check('live-start')];
    const scroller = await evaluate(`(()=>{const r=document.querySelector('[data-poetry-poem]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+120)}})()`) as { x: number; y: number };
    for (let step = 0; step < 8; step++) { window.webContents.sendInputEvent({ type: 'mouseWheel', x: scroller.x, y: scroller.y, deltaX: 0, deltaY: 120, wheelTicksY: 1, modifiers: ['control'] } as Electron.MouseWheelInputEvent); await sleep(80); }
    const grown = await evaluate(`parseFloat(document.querySelector('[data-poetry-poem]').style.fontSize)`) as number;
    assert.ok(grown > 24, `Ctrl+wheel changed the size (now ${grown}px)`);
    sequence.push({ size: grown, ...(await check('live-ctrl-wheel')) });
    await shot('live-ctrl-wheel-ar-1280');
    for (const width of [1100, 900, 700, 560, 900, 1280]) { window.setContentSize(width, 900); sequence.push({ width, ...(await check(`live-resize-${width}`)) }); }
    await shot('live-resize-back-ar-1280');
    results.live = sequence;
    results.rendererErrors = errors;
    assert.deepEqual(errors, [], 'no renderer errors');
    await fs.writeFile(path.join(evidence, 'poetry-stack-live-result.json'), JSON.stringify(results, null, 2));
    console.log('Poetry stack live checks passed:', JSON.stringify(results.poem), Object.keys(matrix).length, 'layouts');
  } catch (error) {
    await fs.writeFile(path.join(evidence, 'poetry-stack-live-failure.json'), JSON.stringify({ error: String(error), results, errors }, null, 2));
    console.error(error); process.exitCode = 1;
  } finally { window.destroy(); worker.close(); database.close(); english.close(); notesDatabase.close(); app.exit(process.exitCode || 0); }
});
