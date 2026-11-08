import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { searchPoetry, poetryDetail, poetryFacets, searchPoets } from '../../src/main/services/poetry/queries';
import { openPoetryPartition } from '../../src/main/services/poetry/partition';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { PoetryQueryProcess } from '../../src/main/services/poetry/process';
import { PoetryKnowledgeService, validatePoetrySave } from '../../src/main/services/poetry/knowledge';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import type { PoetryDetail } from '../../src/shared/types/poetry';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { PocketTTSProvider } from '../../src/main/services/audio/pocket-tts.provider';
import type { TTSProviderSynthesisRequest, TTSProviderVoiceOptions } from '../../src/shared/types/tts-provider';
const directory = process.env.BAGLIB_POETRY_LIVE!;
const realTTS = process.env.BAGLIB_POETRY_REAL_TTS === '1';
const provider = realTTS ? new PocketTTSProvider() : null;
const narrationRequests: TTSProviderSynthesisRequest[] = [];
const narrationStops: string[] = [];
let pcmChunks = 0;
let voiceInitializations = 0;
let narrationVerified = false;
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const database = new Database(path.join(process.env.APPDATA!, 'baglib/partitions/bayan_poetry.sqlite'), { readonly: true });
  const worker = new PoetryQueryProcess(path.join(directory, 'poetry-worker.cjs'), path.join(process.env.APPDATA!, 'baglib/partitions/bayan_poetry.sqlite'));
  const english = openPoetryPartition(path.join(directory, 'english-fixture'));
  const notesDatabase = new Database(path.join(directory, 'notes.sqlite'));
  runMigrations(notesDatabase, migrations);
  const notes = new StudyNotesService(new SqliteSettingsRepository(notesDatabase), notesDatabase);
  const knowledge = new PoetryKnowledgeService(notesDatabase);
  ipcMain.handle('poetry:status', () => ({ ok: true, data: { phase: 'ready', downloaded: 0, total: null, imported: 254630 } }));
  const knowledgeRepository = new SqliteKnowledgeRepository(notesDatabase);
  ipcMain.handle('knowledge:get-all', () => knowledgeRepository.getAllKnowledge());
  ipcMain.handle('knowledge:get-by-work', (_, id) => knowledgeRepository.getKnowledgeByWork(id));
  ipcMain.handle('knowledge:save', (_, input) => knowledgeRepository.saveKnowledge(input));
  ipcMain.handle('knowledge:delete', (_, id) => knowledgeRepository.deleteKnowledge(id));
  ipcMain.handle('study-notes:remove', (_, id) => notes.remove(id));
  ipcMain.handle('poetry:save-knowledge', async (_, input) => {
    validatePoetrySave(input);
    const poem = input.poemId === 9000001 ? poetryDetail(english, input.poemId) : await worker.query('detail', input.poemId);
    return { ok: true, data: knowledge.save(input, poem as PoetryDetail) };
  });
  ipcMain.handle('poetry:saved', (_, offset) => ({ ok: true, data: knowledge.list(offset) }));
  ipcMain.handle('study-notes:save', (_, input) => notes.save(input));
  ipcMain.handle('study-notes:list', () => notes.list());
  ipcMain.handle('ai:get-settings', () => null);
  ipcMain.handle('plugins:list', () => []);
  ipcMain.handle('audio:get-pairing', () => null);
  ipcMain.handle('enrichment:find-online-editions', () => ({ candidates: [] }));
  ipcMain.handle('tts:get-voices', () => provider ? PocketTTSProvider.getVoices() : []);
  ipcMain.handle('tts:get-status', () => provider?.getStatus() || ({ providerId: 'pocket-tts', available: false, running: false, supportedLanguages: [], activeLanguages: [] }));
  ipcMain.handle('tts:load-voice', (_, options: TTSProviderVoiceOptions) => { voiceInitializations++; return provider?.loadVoice(options); });
  ipcMain.handle('tts:stop', (_, jobId?: string) => { narrationStops.push(jobId || '*'); return provider?.stop(jobId); });
  ipcMain.handle('tts:synthesize', (event, request: TTSProviderSynthesisRequest) => {
    if (!provider) throw new Error('TTS unavailable in this fixture');
    narrationRequests.push(request);
    void provider.synthesize(request, chunk => { pcmChunks++; if (!event.sender.isDestroyed()) event.sender.send('tts:chunk', chunk); }).then(() => {
      if (!event.sender.isDestroyed()) event.sender.send('tts:complete', { jobId: request.jobId });
    }).catch(error => { if (!event.sender.isDestroyed()) event.sender.send('tts:error', { jobId: request.jobId, message: String(error) }); });
    return { jobId: request.jobId };
  });
  english.prepare("INSERT INTO poets(id,name,name_normalized,language) VALUES(1,'Fixture Poet','fixture poet','en')").run();
  english.prepare("INSERT INTO poems(id,poet_id,title,title_normalized,language,layout_type,verses_json,search_text_normalized,verse_count) VALUES(9000001,1,'English layout fixture','english layout fixture','en','stanza',?,'fixture',6)").run(JSON.stringify(['Fixture line one', 'Fixture line two', '', 'Fixture line four', 'Fixture line five', 'Fixture line six']));
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree']) ipcMain.handle(channel, () => []);
  ipcMain.handle('tags:get-all', () => ['العلم', 'Study', 'Study skills'].map((name, index) => ({ id: String(index), name, origin: 'manual', category: null, workCount: index })));
  ipcMain.handle('poetry:search', async (_, query) => ({ ok: true, data: query.language === 'en' ? searchPoetry(english, query) : await worker.query('search', query) }));
  ipcMain.handle('poetry:poets', async (_, query) => ({ ok: true, data: query.language === 'en' ? searchPoets(english, query) : await worker.query('poets', query) }));
  ipcMain.handle('poetry:facets', () => ({ ok: true, data: { ...poetryFacets(database), languages: [{ language: 'ar', count: 254630 }, { language: 'en', count: 1 }] } }));
  ipcMain.handle('poetry:detail', async (_, id) => ({ ok: true, data: id === 9000001 ? poetryDetail(english, id) : await worker.query('detail', id) }));
  const window = new BrowserWindow({ width: 1280, height: 1000, show: false, backgroundColor: '#101820', webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(directory, 'preload.cjs') } });
  window.webContents.setAudioMuted(true);
  const errors: string[] = [];
  const fontChecks: { family: string; loaded: boolean }[] = [];
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, callback) => callback({ cancel: true }));
  window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (script: string) => window.webContents.executeJavaScript(script);
  const until = async (script: string) => { for (let index = 0; index < 200; index++) { if (await evaluate(script)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out: ${script}`); };
  try {
    await window.loadFile(path.join(directory, 'index.html'), { query: { tts: realTTS ? '1' : '0' } });
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.poetryClipboard=text}}})`);
    await until('document.querySelectorAll("article").length > 0');
    assert.equal(await evaluate('document.querySelectorAll("article").length'), 40);
    const firstPageTitle = await evaluate('document.querySelector("article h2").textContent');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanNext')).click()`);
    await until(`document.querySelector('article h2')?.textContent!==${JSON.stringify(firstPageTitle)}`);
    assert.equal(await evaluate('document.querySelectorAll("article").length'), 40);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanPrevious')).click()`);
    await until(`document.querySelector('article h2')?.textContent===${JSON.stringify(firstPageTitle)}`);
    assert.equal(await evaluate('document.querySelectorAll("article").length'), 40);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanFilters')).click()`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanPoets')).click()`);
    await until('document.querySelectorAll("aside button").length===40');
    assert.equal(await evaluate('document.querySelectorAll("aside").length'), 1);
    await evaluate(`(()=>{const list=document.querySelector('aside > div');list.scrollTop=25600;list.dispatchEvent(new Event('scroll',{bubbles:true}));})()`);
    await until('parseFloat(document.querySelector("aside button").style.top)>20000');
    assert.equal(await evaluate('document.querySelectorAll("aside button").length'), 40);
    await evaluate(`(()=>{const input=document.querySelector('aside input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'المُتَنَبِّي');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const matchingPoets = searchPoets(database, { language: 'ar', query: 'المُتَنَبِّي' }) as { items: { name: string }[] };
    assert.ok(matchingPoets.items.length);
    await until(`document.querySelector('aside button span')?.textContent===${JSON.stringify(matchingPoets.items[0].name)}`);
    await evaluate('document.querySelector("aside button").click()');
    await until(`Array.from(document.querySelectorAll('article > p:first-of-type')).every(node=>node.textContent===${JSON.stringify(matchingPoets.items[0].name)})&&document.querySelectorAll('article').length>0`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes(window.poetryLive.t('bayanEnglish'))).click()`);
    await until('document.querySelectorAll("article").length===1');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes(window.poetryLive.t('bayanArabic'))).click()`);
    await until('document.querySelectorAll("article").length===40');
    const query = 'الخيل والليل والبيداء';
    const expected = await worker.query('search', { query, language: 'ar' }) as { items: { id: number; match: { from: number; lines: string[] } | null }[] };
    assert.ok(expected.items[0].match);
    await evaluate(`(()=>{const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until('document.querySelectorAll("article mark").length > 0');
    assert.equal(await evaluate('Array.from(document.querySelectorAll("article > button span")).slice(0,2).map(node=>node.textContent).join("\\n")'), expected.items[0].match!.lines.join('\n'));
    for (const width of [480, 1280]) {
      window.setContentSize(width, 1000);
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'));
      await fs.writeFile(path.join(directory, `search-ar-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    }
    await evaluate('document.querySelector("article > button").click()');
    await until(`document.activeElement?.getAttribute('data-poetry-source-index')===${JSON.stringify(String(expected.items[0].match!.from))}`);
    assert.ok(await evaluate('(()=>{const bounds=document.activeElement.getBoundingClientRect();return bounds.top>=0&&bounds.bottom<=innerHeight})()'));
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanBack')).click()`);
    await until('document.querySelector("input[type=search]")!==null');
    await evaluate(`(()=>{const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until('document.querySelectorAll("article").length===40 && document.querySelectorAll("article mark").length===0');
    const longPoem = database.prepare('SELECT id,layout_type FROM poems WHERE verse_count > 500 LIMIT 1').get() as { id: number; layout_type: string };
    await evaluate(`window.poetryOpen({poemId:${longPoem.id},from:401,to:403})`);
    const expectedIndex = longPoem.layout_type === 'bayt' ? 400 : 401;
    await until(`document.activeElement?.getAttribute('data-poetry-source-index')==='${expectedIndex}'`);
    assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed=true]").length'), longPoem.layout_type === 'bayt' ? 2 : 3);
    await evaluate(`window.poetryOpen({poemId:${longPoem.id},from:99999,to:100000})`);
    const longCount = database.prepare('SELECT verse_count FROM poems WHERE id=?').get(longPoem.id) as { verse_count: number };
    const lastIndex = longPoem.layout_type === 'bayt' ? Math.floor((longCount.verse_count - 1) / 2) * 2 : longCount.verse_count - 1;
    await until(`document.activeElement?.getAttribute('data-poetry-source-index')==='${lastIndex}'`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanBack')).click()`);
    await until('document.querySelectorAll("article").length > 0');
    await evaluate('document.querySelector("article h2 button").click()');
    await until('document.querySelectorAll("input[type=checkbox]").length > 0');
    for (const family of ['Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'EB Garamond', 'Lora']) {
      const loaded = await evaluate(`document.fonts.load(${JSON.stringify(`24px "Baglib Poetry ${family}"`)}, ${JSON.stringify(family.includes('Garamond') || family === 'Lora' ? 'Poetry' : 'قَصِيدَةٌ')}).then(faces=>faces.length>0&&faces.every(face=>face.status==='loaded'))`);
      assert.equal(loaded, true, `Offline font ${family}`);
      fontChecks.push({ family, loaded });
    }
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanTypography')).click()`);
    assert.equal(await evaluate('document.querySelector("select").options.length'), 3);
    for (const family of ['Amiri', 'Scheherazade New', 'Noto Naskh Arabic']) {
      await evaluate(`(()=>{const selector=document.querySelector('select');selector.value=${JSON.stringify(family)};selector.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`Array.from(document.querySelectorAll('div[style]')).some(node=>node.style.fontFamily.includes(${JSON.stringify(`Baglib Poetry ${family}`)}))`);
    }
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanTypography')).click()`);
    assert.ok(await evaluate('document.body.innerText.length > 100'));
    const prolific = database.prepare("SELECT p.id,p.poet_id FROM poems p JOIN poets a ON a.id=p.poet_id WHERE a.poem_count>80 AND p.layout_type='bayt' LIMIT 1").get() as { id: number; poet_id: number };
    await evaluate(`window.poetryOpen({poemId:${prolific.id},from:0,to:0})`);
    await until(`document.querySelector('section[data-poetry-id]')?.dataset.poetryId==='${prolific.id}'&&document.querySelector('section[data-poetry-id]')?.dataset.poetryReference==='0:0'`);
    const classical = poetryDetail(database, prolific.id) as PoetryDetail;
    const originalVerses = JSON.parse(classical.verses_json) as string[];
    const displayedBayt = `(()=>{const grid=document.querySelector('[data-poetry-source-index="0"] > div');return [grid.firstElementChild.textContent,grid.lastElementChild.textContent]})()`;
    assert.deepEqual(await evaluate(displayedBayt), originalVerses.slice(0, 2));
    await evaluate(`document.querySelector('header input[type=checkbox]').click()`);
    assert.deepEqual(await evaluate(displayedBayt), originalVerses.slice(0, 2).map(text => text.replace(/[\u064B-\u065F\u0670]/gu, '')));
    await evaluate(`document.querySelectorAll('header input[type=checkbox]')[1].click()`);
    assert.equal(await evaluate(`document.querySelector('[data-poetry-source-index="0"] > div').style.textAlign`), 'justify');
    await evaluate(`Array.from(document.querySelectorAll('[data-poetry-source-index="0"] button')).find(button=>button.textContent===window.poetryLive.t('bayanCopyVerse')).click()`);
    await until('typeof window.poetryClipboard==="string"');
    assert.equal(await evaluate('window.poetryClipboard'), `${originalVerses[0]} *** ${originalVerses[1]}\n${[classical.poet_name, classical.title, classical.meter].filter(Boolean).join(' — ')}`);
    assert.equal((poetryDetail(database, prolific.id) as PoetryDetail).verses_json, classical.verses_json);
    await evaluate(`document.querySelector('header input[type=checkbox]').click()`);
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanBiography')).click()`);
    await until('document.querySelectorAll("aside[role=dialog] li button").length>0');
    assert.equal(await evaluate('document.activeElement.textContent'), await evaluate(`window.poetryLive.t('bayanClose')`));
    const firstBiographyPage = await evaluate('Array.from(document.querySelectorAll("aside li button")).map(button=>button.textContent)');
    const expectedBiography = searchPoetry(database, { language: 'ar', poetId: prolific.poet_id }).items.filter(item => item.id !== prolific.id);
    assert.deepEqual(firstBiographyPage, expectedBiography.map(item => `${item.title || item.poetName}${[item.meter, item.theme].filter(Boolean).join(' · ')}`));
    assert.ok(firstBiographyPage.length <= 40);
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(button=>button.textContent===window.poetryLive.t('bayanNext')).click()`);
    await until(`JSON.stringify(Array.from(document.querySelectorAll('aside li button')).map(button=>button.textContent))!==${JSON.stringify(JSON.stringify(firstBiographyPage))} && document.querySelector('aside ul')?.getAttribute('aria-busy')==='false'`);
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(button=>button.textContent===window.poetryLive.t('bayanPrevious')).click()`);
    await until(`JSON.stringify(Array.from(document.querySelectorAll('aside li button')).map(button=>button.textContent))===${JSON.stringify(JSON.stringify(firstBiographyPage))}`);
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanTypography')).click()`);
    assert.equal(await evaluate('document.querySelector("aside[role=dialog]")===null'), true);
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanBiography')).click()`);
    await until('document.querySelectorAll("aside[role=dialog] li button").length>0');
    await evaluate(`document.querySelector('aside[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await until('document.querySelector("aside[role=dialog]")===null');
    assert.equal(await evaluate('document.activeElement.textContent'), await evaluate(`window.poetryLive.t('bayanBiography')`));
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanBiography')).click()`);
    await until('document.querySelectorAll("aside[role=dialog] li button").length>0');
    window.setContentSize(480, 1000);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'));
    await fs.writeFile(path.join(directory, 'biography-ar-480.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    window.setContentSize(1280, 1000);
    await evaluate('document.querySelector("aside li button").click()');
    await until(`document.querySelector('section[data-poetry-id]')?.dataset.poetryId==='${expectedBiography[0].id}'`);
    const described = database.prepare('SELECT id FROM poems WHERE description_json IS NOT NULL LIMIT 1').get() as { id: number };
    await evaluate(`window.poetryOpen({poemId:${described.id},from:0,to:0})`);
    await until(`document.body.innerText.includes(window.poetryLive.t('bayanDescription'))`);
    assert.ok(await evaluate(`document.body.innerText.includes(window.poetryLive.t('bayanVerseCount'))`));
    await evaluate(`(()=>{const buttons=Array.from(document.querySelectorAll('button')).filter(button=>button.getAttribute('aria-label')===window.poetryLive.t('bayanSelectVerse'));buttons[0].click();buttons[1].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));})()`);
    await until(`Array.from(document.querySelectorAll('button[aria-pressed=true]')).length===2`);
    assert.equal(await evaluate('document.querySelector("[data-poetry-narration]")'), null);
    assert.equal(voiceInitializations, 0, 'Arabic poems must not initialize TTS voices');
    assert.equal(narrationRequests.length, 0);
    await evaluate(`(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'تأمل شخصي — Personal reflection');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await evaluate(`Array.from(document.querySelectorAll('[role=toolbar] button')).find(button=>button.textContent===window.poetryLive.t('bayanSaveNote')).click()`);
    await until(`document.body.innerText.includes(window.poetryLive.t('bayanSaved'))`);
    assert.equal(knowledge.list().items.length, 1);
    assert.ok(knowledge.list().items[0].note?.includes('تأمل شخصي — Personal reflection'));
    const describedLayout = database.prepare('SELECT layout_type FROM poems WHERE id=?').get(described.id) as { layout_type: string };
    assert.equal(knowledge.list().items[0].reference, `poetry:ashaar:${described.id}:0:${describedLayout.layout_type === 'bayt' ? 3 : 1}`);
    for (const key of ['bayanSaveQuote', 'bayanSaveBookmark']) {
      await evaluate(`Array.from(document.querySelectorAll('[role=toolbar] button')).find(button=>button.textContent===window.poetryLive.t('${key}')).click()`);
      await until(`window.electronAPI.poetry.saved().then(result=>result.ok&&result.data.items.length===${key === 'bayanSaveQuote' ? 2 : 3})`);
    }
    const noteFilename = path.join(directory, 'notes.sqlite');
    const reopened = new Database(noteFilename, { readonly: true });
    assert.deepEqual(new PoetryKnowledgeService(reopened).list(), knowledge.list());
    assert.equal((reopened.prepare('SELECT COUNT(*) AS n FROM work').get() as { n: number }).n, 0);
    reopened.close();
    notes.save({ title: 'Legacy poetry fixture', content: `[[poetry:ashaar:${described.id}:0:0|Legacy poetry fixture]]`, aliases: [], tags: ['poetry'] });
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanSavedVerses')).click()`);
    await until(`document.querySelector('aside')?.textContent.includes('Legacy poetry fixture')`);
    const savedPanelButtons = await evaluate('Array.from(document.querySelectorAll("aside:not([hidden]) button")).map(button=>({text:button.textContent,aside:button.closest("aside")?.getAttribute("aria-label")}))');
    await fs.writeFile(path.join(directory, 'saved-panel-buttons.json'), JSON.stringify(savedPanelButtons, null, 2));
    assert.equal(savedPanelButtons.length, 4);
    await evaluate('document.querySelector("aside:not([hidden]) button").click()');
    await until('document.activeElement?.hasAttribute("data-poetry-source-index")');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.poetryLive.lang!==${JSON.stringify(language)})window.poetryLive.toggleLanguage()`);
      await until(`document.querySelector('section').dir===${JSON.stringify(language === 'ar' ? 'rtl' : 'ltr')}`);
      for (const width of [480, 1280]) {
      window.setContentSize(width, 1000);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'));
      await fs.writeFile(path.join(directory, `reader-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanBiography')).click()`);
      await until(`document.querySelector('aside[role=dialog] ul')?.getAttribute('aria-busy')==='false'`);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'));
      await fs.writeFile(path.join(directory, `biography-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      await evaluate(`document.querySelector('aside[role=dialog]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      await until('document.querySelector("aside[role=dialog]")===null');
      }
    }
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===window.poetryLive.t('bayanBack')).click()`);
    await until('document.querySelectorAll("article").length > 0');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes(window.poetryLive.t('bayanEnglish'))).click()`);
    await until('document.querySelectorAll("article").length === 1');
    await evaluate('document.querySelector("article h2 button").click()');
    await until(`document.body.innerText.includes('Fixture line five')`);
    assert.equal(await evaluate('document.querySelector("div[dir=ltr][style]")!==null'), true);
    await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanTypography')).click()`);
    assert.equal(await evaluate('document.querySelector("select").options.length'), 2);
    for (const family of ['EB Garamond', 'Lora']) {
      await evaluate(`(()=>{const selector=document.querySelector('select');selector.value=${JSON.stringify(family)};selector.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`Array.from(document.querySelectorAll('div[style]')).some(node=>node.style.fontFamily.includes(${JSON.stringify(`Baglib Poetry ${family}`)}))`);
    }
    if (realTTS) {
      const click = (key: string) => evaluate(`Array.from(document.querySelectorAll('[role=toolbar] button')).find(button=>button.textContent===window.poetryLive.t('${key}')).click()`);
      const waitFor = async (predicate: () => boolean) => {
        for (let index = 0; index < 1200; index++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
        assert.fail('Real Poetry narration did not progress within60seconds');
      };
      await evaluate(`(()=>{const buttons=Array.from(document.querySelectorAll('button')).filter(button=>button.getAttribute('aria-label')===window.poetryLive.t('bayanSelectVerse'));buttons[0].click();buttons[1].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));})()`);
      await until('document.querySelectorAll("button[aria-pressed=true]").length===2');
      await click('bayanReadSelection');
      await waitFor(() => pcmChunks > 0);
      await until('window.poetryAudioProbe.starts>0');
      assert.ok(narrationRequests.every(request => ['Fixture line one', 'Fixture line two'].includes(request.text)));
      await until(`document.querySelector('[data-poetry-narration]')?.dataset.sentenceIndex==='1'&&document.querySelector('[data-poetry-narration]')?.dataset.playbackState==='idle'`);
      assert.ok(narrationRequests.some(request => request.text === 'Fixture line two'));
      const stopsBeforePlayback = narrationStops.length;
      const sourcesBeforePlayback = await evaluate('window.poetryAudioProbe.starts');
      await click('bayanReadSelection');
      await until(`window.poetryAudioProbe.starts>${sourcesBeforePlayback}`);
      await click('bayanPause');
      await until(`document.querySelector('[data-poetry-narration]')?.dataset.playbackState==='paused'`);
      await click('bayanResume');
      await until(`document.querySelector('[data-poetry-narration]')?.dataset.playbackState==='playing'`);
      await click('bayanStop');
      await until(`document.querySelector('[data-poetry-narration]')?.dataset.playbackState==='stopped'&&window.poetryAudioProbe.sources.size===0`);
      await waitFor(() => narrationStops.length > stopsBeforePlayback);
      assert.ok(narrationStops.slice(stopsBeforePlayback).some(jobId => narrationRequests.some(request => request.jobId === jobId)));
      const priorRequests = narrationRequests.length;
      const priorStarts = await evaluate('window.poetryAudioProbe.starts');
      await click('bayanReadSelection');
      await waitFor(() => narrationRequests.length > priorRequests);
      await until(`window.poetryAudioProbe.starts>${priorStarts}`);
      const priorStops = narrationStops.length;
      await evaluate(`Array.from(document.querySelectorAll('header button')).find(button=>button.textContent===window.poetryLive.t('bayanBack')).click()`);
      await until('document.querySelectorAll("article").length>0&&window.poetryAudioProbe.sources.size===0');
      await waitFor(() => narrationStops.length > priorStops);
      assert.ok(narrationRequests.every(request => ['Fixture line one', 'Fixture line two'].includes(request.text)));
      narrationVerified = true;
    }
    const nativeNote = knowledge.list().items.find(item => item.type === 'note')!;
    await evaluate('window.poetryShowNotes(true)');
    await until(`document.querySelector('[data-study-note="${nativeNote.id}"]')!==null`);
    await evaluate(`document.querySelector('[data-study-note="${nativeNote.id}"] button[aria-label="'+window.poetryLive.t('studyEdit')+'"]').click()`);
    await until('document.querySelector("[data-scratchpad-textarea]")!==null');
    await evaluate(`document.querySelector('[data-scratchpad-textarea] .cm-content,textarea[data-scratchpad-textarea]').focus()`);
    await window.webContents.insertText('\nEdited native reflection');
    await evaluate('document.querySelector("[data-scratchpad-save]").click()');
    await until('document.querySelector("[data-scratchpad-textarea]")===null');
    assert.ok(notes.list(nativeNote.id)[0]?.content.includes('Edited native reflection'));
    assert.equal((notesDatabase.prepare('SELECT location FROM knowledge WHERE id=?').get(nativeNote.id) as { location: string }).location, nativeNote.reference);
    await evaluate(`document.querySelector('[data-study-note="${nativeNote.id}"] button[aria-label="'+window.poetryLive.t('deleteNote')+'"]').click()`);
    await until(`document.querySelector('[data-study-note="${nativeNote.id}"]')===null`);
    assert.equal(knowledge.list().items.length, 2);
    assert.ok(notes.list().some(item => item.title === 'Legacy poetry fixture'));
    await evaluate('window.poetryShowNavigation(true)');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.poetryLive.lang!==${JSON.stringify(language)})window.poetryLive.toggleLanguage()`);
      await until(`document.querySelector('aside button[title="'+window.poetryLive.t('navBayanTooltip')+'"]')!==null`);
      assert.ok(await evaluate(`(()=>{const labels=Array.from(document.querySelectorAll('aside button')).map(button=>button.getAttribute('aria-label'));const quran=labels.indexOf(window.poetryLive.t('navQuran'));return quran>=0&&labels[quran+1]===window.poetryLive.t('navSunnah')&&labels[quran+2]===window.poetryLive.t('navBayan')})()`));
      await evaluate(`document.querySelector('aside button[title="'+window.poetryLive.t('navBayanTooltip')+'"]').click()`);
      await until(`document.querySelector('main h1')?.textContent===window.poetryLive.t('navBayan')&&document.querySelectorAll('main article').length>0`);
      assert.equal(await evaluate('window.poetryLive.viewMode'), 'bayan');
      assert.equal(await evaluate('document.querySelector("main section").dir'), language === 'ar' ? 'rtl' : 'ltr');
    }
    await evaluate('window.poetryShowNavigation(false);window.poetryShowTags(true)');
    await until('document.querySelector("[role=combobox]")!==null');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.poetryLive.lang!==${JSON.stringify(language)})window.poetryLive.toggleLanguage()`);
      await evaluate("document.querySelector('[role=combobox]').focus()");
      window.webContents.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      await window.webContents.insertText(language === 'ar' ? 'العلم' : 'Study');
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.writeFile(path.join(directory, `tag-focus-${language}.json`), JSON.stringify(await evaluate("(()=>{const input=document.querySelector('[role=combobox]');return {value:input.value,focused:document.activeElement===input,expanded:input.getAttribute('aria-expanded'),options:document.querySelectorAll('[role=option]').length,html:input.outerHTML}})()"), null, 2));
      await until("document.querySelectorAll('[role=option]').length>0");
      await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
      await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
      await until("!!document.querySelector('[role=combobox]').getAttribute('aria-activedescendant')");
      await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await until(`document.querySelector('section')?.textContent.includes(${JSON.stringify(language === 'ar' ? 'العلم' : 'Study')})`);
      await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      assert.equal(await evaluate("document.querySelector('[role=combobox]').getAttribute('aria-expanded')"), 'false');
    }
    await evaluate('window.poetryShowPlayer(true)');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.poetryLive.lang!==${JSON.stringify(language)})window.poetryLive.toggleLanguage()`);
      for (const width of [320, 480, 1280]) {
        window.setContentSize(width, 600);
        await new Promise(resolve => setTimeout(resolve, 200));
        const box = await evaluate("(() => {const box=document.querySelector('section > .fixed').getBoundingClientRect();return {left:box.left,right:box.right,center:(box.left+box.right)/2,width:innerWidth};})()");
        assert.ok(box.left >= 0 && box.right <= box.width && Math.abs(box.center - box.width / 2) < 1);
        await evaluate(`document.querySelector('button[title='+JSON.stringify(window.poetryLive.t('ttsSleepTimer'))+']').click()`);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(await evaluate("(() => {const box=document.querySelector('section > .fixed form').parentElement.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;})()"));
        fs.writeFile(path.join(directory, `audio-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        await evaluate(`document.querySelector('button[title='+JSON.stringify(window.poetryLive.t('ttsSleepTimer'))+']').click()`);
      }
    }
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.poetryLive.lang!==${JSON.stringify(language)})window.poetryLive.toggleLanguage()`);
      window.setContentSize(480, 600);
      for (const dialog of ['ai', 'plugins', 'pairing', 'providers', 'diff', 'candidates', 'lend', 'return', 'edition']) {
        await evaluate(`window.poetryShowDialog(${JSON.stringify(dialog)})`);
        await until('!!document.querySelector("[data-fixture-dialog] .fixed")');
        await new Promise(resolve => setTimeout(resolve, 300));
        if (dialog === 'lend' || dialog === 'return') {
          assert.ok(await evaluate("(() => {const overlay=document.querySelector('[data-fixture-dialog] .fixed');overlay.scrollTop=0;const header=overlay.querySelector('h3').getBoundingClientRect();const top=header.top>=0;overlay.scrollTop=overlay.scrollHeight;const box=[...overlay.querySelectorAll('form button')].at(-1).getBoundingClientRect();const reachable=box.top>=0&&box.bottom<=innerHeight;overlay.scrollTop=0;return top&&reachable;})()"));
        } else assert.ok(await evaluate("(() => {const box=document.querySelector('[data-fixture-dialog] .fixed > div').getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth;})()"));
        await fs.writeFile(path.join(directory, `dialog-${dialog}-${language}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        await evaluate("(() => {const root=document.querySelector('[data-fixture-dialog]');const close=root.querySelector('button svg.lucide-x')?.closest('button')||[...root.querySelectorAll('button')].find(button=>button.textContent.trim()===window.poetryLive.t('cancel'));if(!close)throw new Error('missing close action');close.click();})()");
        await until('!document.querySelector("[data-fixture-dialog]")');
      }
    }
    await provider?.release();
    assert.equal(provider?.getStatus().running || false, false);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, realCorpus: true, widths: [480, 1280], biographyPaging: true, virtualPoetBrowser: true, bilingualNavigationRail: true, realNarration: { enabled: realTTS, verified: narrationVerified, pcmChunks, requests: narrationRequests.map(request => ({ text: request.text, language: request.language })), stopCalls: narrationStops.length, released: provider ? !provider.getStatus().running : null }, offlineFonts: fontChecks, nativeKnowledge: { types: ['note', 'quote', 'bookmark'], persisted: true, fakeWorks: 0, legacyNotesVisible: true, noteEditDeleteVerified: true }, rendererErrors: errors }, null, 2));
    console.log(`Poetry native checks passed: ${directory}`);
  } catch (error) {
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ error: String(error), text: await evaluate('document.body.innerText').catch(() => ''), audio: await evaluate('window.poetryAudioProbe?{starts:window.poetryAudioProbe.starts,live:window.poetryAudioProbe.sources.size}:null').catch(() => null), pcmChunks, requestCount: narrationRequests.length, rendererErrors: errors }, null, 2));
    console.error(error); process.exitCode = 1;
  }
  finally { await provider?.release(); window.destroy(); worker.close(); database.close(); english.close(); notesDatabase.close(); app.exit(process.exitCode || 0); }
});
