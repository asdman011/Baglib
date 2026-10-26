import { app, BrowserWindow, clipboard, dialog, ipcMain, session, protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import publicCatalog from '../../src/shared/data/qul-public-catalog.json';
import { registerQuranIpc } from '../../src/main/ipc/quran';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { verifyKhatmah } from './khatmah';
import { readerPresets } from '../../src/main/services/quran/reader-resources';
import type { QuranResult, QuranReaderCatalog, QuranPassage, QuranCommentary, QuranSearchHit, QuranMushafPage, QuranAyahAudio } from '../../src/shared/types/quran';

const directory = process.env.BAGLIB_QURAN_TEST_DIRECTORY!;
const provisionOnly = process.env.BAGLIB_QURAN_PROVISION_ONLY === '1';
app.setPath('userData', path.join(directory, 'profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'baglib-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.whenReady().then(async () => {
  const originalAppPath = app.getAppPath;
  if (provisionOnly) app.getAppPath = () => path.resolve('.');
  const errors: string[] = [];
  let nativeFullscreenChecks = 0;
  const originalCopy = clipboard.writeText;
  let copied = '';
  clipboard.writeText = text => { copied = text; };
  const folder = path.join(directory, 'selected');
  await fs.mkdir(folder);
  const base = path.resolve('repos/Quran/QUL Developer Resources');
  for (const preset of readerPresets.filter(value => value.kind !== 'translation')) {
    const source = preset.kind === 'surahs' ? '.baglib-data/qul-phase1/surah-metadata-sqlite.zip' : path.join(base, preset.relative, preset.filename);
    await fs.copyFile(source, path.join(folder, preset.filename));
  }
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  const archive = await fs.readFile(path.join(base, '4-Translation & Transliteration/Translation/en-sahih-international-inline-footnotes.db.zip'));
  const qul = session.fromPartition('baglib-qul');
  const tokenPath = '/resources/translation/01234567890123456789012345678901/download';
  const semanticExports = new Map<string, { token: string; bytes: Buffer; file: string }>();
  for (const [index, preset] of readerPresets.filter(preset => ['surah-info', 'ayah-theme', 'ayah-topics'].includes(preset.kind)).entries()) {
    semanticExports.set(`/resources/${preset.id}`, { token: `/resources/${preset.id.split('/')[0]}/${String(index + 1).repeat(32)}/download`, bytes: await fs.readFile(path.join(base, preset.relative, preset.filename)), file: `/fixture/semantic-${index}.zip` });
  }
  let downloaded = 0;
  const gatedResource = publicCatalog.resources.find(resource=>resource.category==='translation' && resource.id!=='translation/193' && !resource.restricted)!;
  await qul.protocol.handle('https', request => {
    const url = new URL(request.url);
    if(url.pathname===gatedResource.sourcePath) return new Response('<html><body><a href="#_" data-url="/users/sign_in?modal=true">Download SQLite</a></body></html>',{headers:{'content-type':'text/html'}});
    for (const [source, artifact] of semanticExports) {
      if (url.pathname === source) return new Response(`<html><body><a href="${artifact.token}">Download SQLite</a></body></html>`, { headers: { 'content-type': 'text/html' } });
      if (url.pathname === artifact.token) return new Response(null, { status: 302, headers: { location: `https://s3.us-east-1.wasabisys.com${artifact.file}` } });
      if (url.origin === 'https://s3.us-east-1.wasabisys.com' && url.pathname === artifact.file) { downloaded++; return new Response(artifact.bytes, { headers: { 'content-type': 'application/zip' } }); }
    }
    if (url.origin === 'https://s3.us-east-1.wasabisys.com') { downloaded++; return new Response(archive, { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="translation.zip"' } }); }
    if (url.pathname === tokenPath) return new Response(null, { status: 302, headers: { location: 'https://s3.us-east-1.wasabisys.com/fixture/translation.zip' } });
    return new Response(`<html><body><a id="download" href="${tokenPath}">Download translation-with-inline-footnote.sqlite</a></body></html>`, { headers: { 'content-type': 'text/html' } });
  });
  app.on('browser-window-created', (_event, window) => {
    window.hide();
    window.webContents.once('did-finish-load', () => {
      if (window.webContents.getURL().startsWith('https://qul.tarteel.ai')) void window.webContents.executeJavaScript("document.getElementById('download').click()");
    });
  });
  await protocol.handle('baglib-asset', async request => {
    const raw = decodeURIComponent(request.url.replace(/^baglib-asset:\/\//, ''));
    const filename = /^[a-z][\\/]/i.test(raw) ? `${raw[0]}:${raw.slice(1)}` : raw;
    assert.ok(path.resolve(filename).toLowerCase().startsWith((path.resolve(directory) + path.sep).toLowerCase()), request.url);
    return new Response(await fs.readFile(filename), { headers: { 'content-type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  getDatabase().exec("CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  app.once('before-quit', closeDatabase);
  registerQuranIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const owner = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  owner.webContents.setAudioMuted(true);
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = async <Value = unknown>(code: string): Promise<Value> => {
    try { return await owner.webContents.executeJavaScript(code, true); }
    catch (error) { throw new Error(`Evaluation failed: ${code.slice(0, 180)}; ${String(error)}`); }
  };
  const until = async (code: string) => {
    for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    const audio = await evaluate("window.quranTestAudio ? {src:window.quranTestAudio.src,paused:window.quranTestAudio.paused,readyState:window.quranTestAudio.readyState,error:window.quranTestAudio.error?.code} : null");
    throw new Error(`Timed out: ${code}; audio=${JSON.stringify(audio)}`);
  };
  const unwrap = <Value>(result: QuranResult<Value>): Value => { assert.ok(result.ok, JSON.stringify(result)); return result.data; };
  try {
    await owner.loadFile(path.join(directory, 'index.html'));
    await until("Boolean(window.quranWorkspace) && Boolean(document.querySelector('[data-quran-reader]'))");
    if (provisionOnly) {
      await until(`window.electronAPI.quran.readerCatalog().then(result=>result.ok && result.data.sources.length===${readerPresets.length})`);
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_request, callback) => callback({ cancel: true }));
      const catalog = unwrap(await evaluate<QuranResult<QuranReaderCatalog>>('window.electronAPI.quran.readerCatalog()'));
      for (const reciter of catalog.sources.filter(source=>source.kind==='recitation')) {
        const audio = unwrap(await evaluate<QuranResult<QuranAyahAudio>>(`window.electronAPI.quran.recitationAudio({pack:${JSON.stringify(reciter.id)},surah:114,ayah:6})`));
        assert.equal(audio.cached,true);
        assert.ok(audio.localUrl?.startsWith('baglib-asset://'));
      }
      const before = downloaded;
      const metadataJobs = unwrap(await evaluate<QuranResult<string[]>>("window.electronAPI.quran.downloadBatch(['quran-metadata/69'])"));
      await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && ${JSON.stringify(metadataJobs)}.every(id=>result.data.jobs.some(job=>job.id===id && job.state==='complete')))`);
      const translation = catalog.sources.find(source=>source.kind==='translation')!;
      unwrap(await evaluate<QuranResult<null>>(`window.electronAPI.quran.remove(${JSON.stringify(translation.id)})`));
      const localJobs = unwrap(await evaluate<QuranResult<string[]>>("window.electronAPI.quran.downloadBatch(['translation/193'])"));
      await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && ${JSON.stringify(localJobs)}.every(id=>result.data.jobs.some(job=>job.id===id && job.state==='complete')))`);
      assert.equal(downloaded,before);
      const browserCount = BrowserWindow.getAllWindows().length;
      const gatedJobs = unwrap(await evaluate<QuranResult<string[]>>(`window.electronAPI.quran.downloadBatch([${JSON.stringify(gatedResource.id)}])`));
      await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && result.data.jobs.some(job=>job.id===${JSON.stringify(gatedJobs[0])} && job.state==='failed' && job.error==='authentication-required'))`);
      assert.equal(BrowserWindow.getAllWindows().length,browserCount);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ directory, automaticLocalProvisioning: readerPresets.length, manualFolderSelection: false, directOfflineAudioVoices: 2, registrationFreeLocalReinstall: true, registrationFreeExtraMetadata: true, gatedExportExplainedWithoutBrowser: true, errors }));
      return;
    }
    const ids = readerPresets.filter(value => value.kind !== 'translation').map(value => value.id);
    const setup = unwrap(await evaluate<QuranResult<{ installed: string[]; missing: string[]; failed: string[] }>>(`window.electronAPI.quran.setup(${JSON.stringify(ids)})`));
    assert.equal(setup.installed.length, ids.length); assert.equal(setup.missing.length, 0); assert.equal(setup.failed.length, 0);
    assert.equal((await evaluate<QuranResult<null>>("window.electronAPI.quran.setup(['../outside'])")).ok, false);
    const download = await evaluate<QuranResult<string>>("window.electronAPI.quran.download('translation/193')");
    unwrap(download);
    await until(`window.electronAPI.quran.library({view:'installed'}).then(result=>result.ok && result.data.installed.length===${readerPresets.length})`);
    assert.equal(downloaded, 1);
    let catalog = unwrap(await evaluate<QuranResult<QuranReaderCatalog>>('window.electronAPI.quran.readerCatalog()'));
    const originalTranslation = catalog.sources.find(source => source.kind === 'translation')!;
    unwrap(await evaluate<QuranResult<null>>(`window.electronAPI.quran.remove(${JSON.stringify(originalTranslation.id)})`));
    const queued = unwrap(await evaluate<QuranResult<string[]>>("window.electronAPI.quran.downloadBatch(['translation/193'])"));
    assert.equal(queued.length, 1);
    await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && result.data.jobs.some(job=>job.id===${JSON.stringify(queued[0])} && job.state==='complete'))`);
    assert.equal(downloaded, 2);
    for (const source of catalog.sources.filter(source => ['surah-info', 'ayah-theme', 'ayah-topics'].includes(source.kind))) unwrap(await evaluate<QuranResult<null>>(`window.electronAPI.quran.remove(${JSON.stringify(source.id)})`));
    const semanticJobs = unwrap(await evaluate<QuranResult<string[]>>("window.electronAPI.quran.downloadBatch(['surah-info/en','ayah-theme/default','ayah-topics/default'])"));
    assert.equal(semanticJobs.length, 3);
    await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && ${JSON.stringify(semanticJobs)}.every(id=>result.data.jobs.some(job=>job.id===id && job.state==='complete')))`);
    assert.equal(downloaded, 5);
    catalog = unwrap(await evaluate<QuranResult<QuranReaderCatalog>>('window.electronAPI.quran.readerCatalog()'));
    assert.ok(unwrap(await evaluate<QuranResult<{ text: string }>>("window.electronAPI.quran.surahIntro({surah:1})")).text.length > 0);
    assert.ok(unwrap(await evaluate<QuranResult<unknown[]>>("window.electronAPI.quran.ayahThemes({surah:1})")).length > 0);
    assert.ok(unwrap(await evaluate<QuranResult<unknown[]>>("window.electronAPI.quran.searchTopics({text:'Allah'})")).length > 0);
    const find = (kind: string, profile = 'hafs') => catalog.sources.find(source => source.kind === kind && source.profile === profile)!.id;
    const query = { script: find('script'), surah: 2, from: 181, translation: find('translation'), meanings: find('word-translation'), transliteration: find('word-transliteration') };
    const gap = unwrap(await evaluate<QuranResult<QuranPassage>>(`window.electronAPI.quran.read(${JSON.stringify(query)})`));
    assert.equal(gap.ayahs.length, 20); assert.equal(gap.ayahs[0].words.find(word => word.position === 4)?.meaning, undefined);
    assert.ok(gap.ayahs[0].words.every(word => !word.transliteration));
    assert.equal(gap.surahs.length, 114); assert.equal(gap.surahs[0].arabic, 'الفاتحة');
    for (const surah of [1, 2, 9]) {
      const opening = unwrap(await evaluate<QuranResult<QuranPassage>>(`window.electronAPI.quran.read(${JSON.stringify({ script: query.script, surah, from: 1 })})`));
      assert.equal(Boolean(opening.basmala), surah === 2);
    }
    const commentary = unwrap(await evaluate<QuranResult<QuranCommentary>>(`window.electronAPI.quran.commentary(${JSON.stringify({ script: query.script, pack: find('tafsir'), surah: 2, ayah: 9 })})`));
    assert.equal(commentary.from, '2:8'); assert.ok(commentary.nodes.length > 0);
    const search = unwrap(await evaluate<QuranResult<QuranSearchHit[]>>(`window.electronAPI.quran.searchAyahs(${JSON.stringify({ script: query.script, text: 'بسم الله' })})`));
    assert.ok(search.some(hit => hit.surah === 1 && hit.ayah === 1));
    const warsh = unwrap(await evaluate<QuranResult<QuranPassage>>(`window.electronAPI.quran.read(${JSON.stringify({ script: find('script', 'warsh'), surah: 1, from: 1 })})`));
    assert.equal(warsh.profile, 'warsh'); assert.ok(warsh.ayahs[0].words[0].text.includes('حَمْدُ'));
    const incompatible = await evaluate<QuranResult<QuranPassage>>(`window.electronAPI.quran.read(${JSON.stringify({ ...query, script: find('script', 'warsh') })})`);
    assert.equal(incompatible.ok, false);
    const mushafLayoutId = find('mushaf-layout');
    assert.ok(mushafLayoutId);
    const mushafP1 = unwrap(await evaluate<QuranResult<QuranMushafPage>>(`window.electronAPI.quran.mushafPage({ pack: ${JSON.stringify(mushafLayoutId)}, page: 1 })`));
    assert.equal(mushafP1.pageNumber, 1);
    assert.equal(mushafP1.surahStart, 1);
    assert.equal(mushafP1.ayahStart, 1);
    assert.ok(mushafP1.words.length > 0);
    assert.ok(mushafP1.svg.includes('<svg'));
    const mushafAyahLookup = unwrap(await evaluate<QuranResult<{ pageNumber: number }>>(`window.electronAPI.quran.mushafPageForAyah({ pack: ${JSON.stringify(mushafLayoutId)}, surah: 2, ayah: 282 })`));
    assert.equal(mushafAyahLookup.pageNumber, 48);
    const recitationPackId = find('recitation');
    assert.ok(recitationPackId);
    const audioRes = unwrap(await evaluate<QuranResult<QuranAyahAudio>>(`window.electronAPI.quran.recitationAudio({ pack: ${JSON.stringify(recitationPackId)}, surah: 1, ayah: 1 })`));
    assert.equal(audioRes.surah, 1);
    assert.equal(audioRes.ayah, 1);
    assert.ok(audioRes.audioUrl.startsWith('https://audio-cdn.tarteel.ai/'));
    assert.ok(audioRes.segments.length > 0);
    const surahAudioRes = unwrap(await evaluate<QuranResult<QuranAyahAudio[]>>(`window.electronAPI.quran.recitationSurah({ pack: ${JSON.stringify(recitationPackId)}, surah: 1 })`));
    assert.equal(surahAudioRes.length, 7);
    let audioFiles = 0;
    await session.defaultSession.protocol.handle('https', request => {
      assert.ok(request.url.startsWith('https://audio-cdn.tarteel.ai/'));
      audioFiles++;
      return new Response(new Uint8Array(2048), { headers: { 'content-type': 'audio/mpeg' } });
    });
    const audioJob = unwrap(await evaluate<QuranResult<string>>(`window.electronAPI.quran.downloadRecitation({pack:${JSON.stringify(recitationPackId)},surah:114})`));
    await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && result.data.jobs.some(job=>job.id===${JSON.stringify(audioJob)} && job.state==='complete'))`);
    assert.equal(audioFiles, 6);
    const entireQuranJob = unwrap(await evaluate<QuranResult<string>>(`window.electronAPI.quran.downloadRecitation({pack:${JSON.stringify(recitationPackId)}})`));
    unwrap(await evaluate<QuranResult<null>>(`window.electronAPI.quran.cancel(${JSON.stringify(entireQuranJob)})`));
    await until(`window.electronAPI.quran.library({view:'downloads'}).then(result=>result.ok && result.data.jobs.some(job=>job.id===${JSON.stringify(entireQuranJob)} && job.state==='cancelled'))`);
    await session.defaultSession.protocol.unhandle('https');
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_request, callback) => callback({ cancel: true }));
    await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
    assert.equal(await evaluate("document.querySelectorAll('[data-quran-mode]').length"), 0);
    for (const surah of [2, 112, 113, 114]) {
      const local = unwrap(await evaluate<QuranResult<QuranAyahAudio>>(`window.electronAPI.quran.recitationAudio({pack:${JSON.stringify(recitationPackId)},surah:${surah},ayah:1})`));
      assert.equal(local.ayah, 1);
      assert.equal(local.surah, surah);
    }
    const morphology = unwrap(await evaluate<QuranResult<unknown[]>>(`window.electronAPI.quran.morphology({script:${JSON.stringify(query.script)},surah:1,ayah:1})`));
    assert.ok(morphology.length > 0);
    const phrases = unwrap(await evaluate<QuranResult<unknown[]>>(`window.electronAPI.quran.mutashabihat({script:${JSON.stringify(query.script)},surah:2,ayah:23})`));
    assert.ok(phrases.length > 0);
    const glyphPage = unwrap(await evaluate<QuranResult<QuranMushafPage>>(`window.electronAPI.quran.mushafPage({pack:${JSON.stringify(find('glyph-layout'))},page:1})`));
    assert.ok(glyphPage.glyphLines?.length);
    assert.ok(glyphPage.fontUrl?.startsWith('baglib-asset://'));
    assert.equal(glyphPage.words[0].textHafs, 'بِسۡمِ');
    const lastGlyphPage = unwrap(await evaluate<QuranResult<QuranMushafPage>>(`window.electronAPI.quran.mushafPage({pack:${JSON.stringify(find('glyph-layout'))},page:604})`));
    assert.equal(lastGlyphPage.surahEnd, 114);
    assert.equal(lastGlyphPage.ayahEnd, 6);
    await evaluate("document.querySelector('[data-quran-options]').click()");
    await evaluate(`(() => { const select=[...document.querySelectorAll('aside select')].find(select=>[...select.options].some(option=>option.value===${JSON.stringify(find('glyph-layout'))}));select.value=${JSON.stringify(find('glyph-layout'))};select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await until("Boolean(document.querySelector('.mushaf-svg-surface span[data-surah]'))");
    assert.ok(await evaluate("document.fonts.check('16px QuranPage1')"));
    await evaluate(`(() => { const select=[...document.querySelectorAll('aside select')].find(select=>[...select.options].some(option=>option.value===${JSON.stringify(mushafLayoutId)}));select.value=${JSON.stringify(mushafLayoutId)};select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
    await evaluate("document.querySelector('[data-quran-options]').click()");
    await evaluate("document.querySelector('.mushaf-svg-surface [data-surah] path').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");
    assert.ok(await evaluate("document.querySelectorAll('[data-baglib-hover-ayah]').length>1"));
    assert.ok(await evaluate("document.querySelectorAll('[data-baglib-hitbox]').length>0"));
    await evaluate("document.querySelector('.mushaf-svg-surface [data-surah] path').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    await until("Boolean(document.querySelector('[role=dialog]'))");
    await until("document.querySelector('[role=dialog]').textContent.includes('بسم')");
    await evaluate("document.querySelector('[role=dialog] button svg.lucide-copy').closest('button').click()");
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.ok(copied.endsWith('[1:1]'));
    await evaluate("document.querySelector('[data-quran-study-jump]').click()");
    await until("document.querySelectorAll('[data-quran-workspace] aside[role=region]').length===1");
    await evaluate("document.querySelector('.mushaf-svg-surface [data-surah] path').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
    await until("document.querySelectorAll('[data-quran-workspace] aside[role=region]').length===2");
    await evaluate("document.querySelector('.mushaf-svg-surface [data-surah] path').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:450,clientY:350}))");
    await until("Boolean(document.querySelector('[role=menu]'))");
    assert.equal(await evaluate("document.querySelectorAll('[role=menuitem]').length"),7);
    await evaluate("[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent===window.quranWorkspace.t('quranCatTranslation')).click()");
    await until("document.querySelectorAll('[data-quran-workspace] aside[role=region]').length===3");
    await until("Boolean(document.querySelector('[data-quran-workspace] [data-quran-translation] sup a'))");
    assert.equal(await evaluate("document.querySelector('[data-quran-workspace] [data-quran-translation]').querySelectorAll('sup a').length"), 2);
    await evaluate("document.querySelector('[data-quran-workspace] [data-quran-translation] sup a').click()");
    assert.ok(await evaluate("document.querySelector('[data-quran-workspace] details').open"));
    await evaluate("document.querySelector('[data-quran-workspace] nav button[aria-label='+JSON.stringify(window.quranWorkspace.t('quranCatTheme'))+']').click()");
    await until("document.querySelectorAll('[data-quran-workspace] aside.pointer-events-none').length>0");
    await evaluate("[...document.querySelectorAll('[data-quran-workspace] aside[role=region] header button')].forEach(button=>button.click())");
    const warshScript = find('script','warsh');
    const sourceDatabase = new Database(path.join(directory,'profile','quran','packs',warshScript,'0.sqlite'),{readonly:true});
    const sourceRows = sourceDatabase.prepare('SELECT surah,ayah,word,text FROM words ORDER BY surah,ayah,word').all() as {surah:number;ayah:number;word:number;text:string}[];
    sourceDatabase.close();
    const expectedDigest = createHash('sha256').update(JSON.stringify(sourceRows.map(word=>[word.surah,word.ayah,word.word,word.text]))).digest('hex');
    const warshCoverage = await evaluate<{words:number;references:number;digest:string}>(`(async()=>{
      const words=[], references=new Set();
      for(let page=1;page<=604;page++){
        const result=await window.electronAPI.quran.mushafPage({pack:${JSON.stringify(mushafLayoutId)},script:${JSON.stringify(warshScript)},page});
        if(!result.ok||result.data.profile!=='warsh'||result.data.layoutMode!=='adapted'||result.data.svg)throw new Error('Warsh layout mismatch');
        for(const word of result.data.words.filter(word=>word.type!=='aya-mark')){
          if(word.textHafs!==undefined||!word.canonicalText)throw new Error('Warsh source mismatch');
          words.push([word.surah,word.ayah,word.wordIndex,word.canonicalText]);references.add(word.surah+':'+word.ayah);
        }
      }
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(words)));
      return {words:words.length,references:references.size,digest:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    })()`);
    assert.equal(warshCoverage.words,sourceRows.length);
    assert.equal(warshCoverage.references,6214);
    assert.equal(warshCoverage.digest,expectedDigest);
    const warshFirst = unwrap(await evaluate<QuranResult<QuranMushafPage>>(`window.electronAPI.quran.mushafPage({pack:${JSON.stringify(mushafLayoutId)},script:${JSON.stringify(warshScript)},page:1})`));
    assert.equal(warshFirst.words[0].canonicalText,'اِ۬لْحَمْدُ');
    assert.equal(warshFirst.words[0].ayah,1);
    for (const [surah,ayah] of [[1,7],[2,2],[114,6]]) {
      const location = unwrap(await evaluate<QuranResult<{pageNumber:number}>>(`window.electronAPI.quran.mushafPageForAyah({pack:${JSON.stringify(mushafLayoutId)},script:${JSON.stringify(warshScript)},surah:${surah},ayah:${ayah}})`));
      const page = unwrap(await evaluate<QuranResult<QuranMushafPage>>(`window.electronAPI.quran.mushafPage({pack:${JSON.stringify(mushafLayoutId)},script:${JSON.stringify(warshScript)},page:${location.pageNumber}})`));
      assert.ok(page.words.some(word=>word.surah===surah && word.ayah===ayah));
    }
    for(const language of ['ar','en']){
      await evaluate(`if(window.quranWorkspace.lang!==${JSON.stringify(language)})window.quranWorkspace.toggleLanguage()`);
      await evaluate("document.querySelector('[data-quran-options]').click()");
      await evaluate(`(()=>{const select=[...document.querySelectorAll('aside select')].find(select=>[...select.options].some(option=>option.value===${JSON.stringify(warshScript)}));select.value=${JSON.stringify(warshScript)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until("Boolean(document.querySelector('.mushaf-svg-surface span[data-canonical]')) && document.querySelector('.mushaf-svg-surface span[data-canonical]').textContent==='اِ۬لْحَمْدُ'");
      assert.ok(await evaluate("document.fonts.check('16px QuranWarshPage1')"));
      assert.equal(await evaluate("document.querySelectorAll('.mushaf-svg-surface svg path').length"),0);
      await evaluate("document.querySelector('[data-quran-options]').click()");
      await evaluate("document.querySelector('[data-quran-fullscreen=enter]').click()");
      await until("Boolean(document.querySelector('[data-immersive]'))");
      await new Promise(resolve=>setTimeout(resolve,700));
      assert.ok(owner.isFullScreen() || await evaluate('Boolean(document.fullscreenElement)'));
      nativeFullscreenChecks++;
      let warshPng = Buffer.alloc(0);
      for(let retry=0;!warshPng.length && retry<8;retry++){
        try { warshPng=(await owner.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG(); } catch {}
        if(!warshPng.length)await new Promise(resolve=>setTimeout(resolve,300));
      }
      assert.ok(warshPng.length);
      await fs.writeFile(path.join(directory,`warsh-${language}.png`),warshPng);
      await evaluate("document.querySelector('[data-quran-fullscreen=exit]').click()");
      await until('!document.fullscreenElement');
      for(let retry=0;owner.isFullScreen() && retry<30;retry++)await new Promise(resolve=>setTimeout(resolve,100));
      await new Promise(resolve=>setTimeout(resolve,300));
      await evaluate("document.querySelector('.mushaf-svg-surface span[data-canonical]').click()");
      await until("Boolean(document.querySelector('[role=dialog]')) && document.querySelector('[role=dialog]').textContent.includes('اِ۬لْحَمْدُ')");
      await evaluate("document.querySelector('[role=dialog] header button').click()");
      await evaluate("document.querySelector('[data-quran-options]').click()");
      await evaluate(`(()=>{const select=[...document.querySelectorAll('aside select')].find(select=>[...select.options].some(option=>option.value===${JSON.stringify(query.script)}));select.value=${JSON.stringify(query.script)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
      await evaluate("document.querySelector('[data-quran-options]').click()");
    }
    await until("document.querySelectorAll('[data-quran-workspace] aside[role=region]').length===0");
    for (const reciter of ['husary','minshawi']) {
      const audioFile = path.join(base,'3-Recitations and segments data','audio',reciter,'114','114001.mp3');
      const bytes = await fs.readFile(audioFile);
      const decoded = await evaluate<{duration:number;channels:number}>(`(async()=>{const context=new AudioContext();try {const buffer=await context.decodeAudioData(Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),value=>value.charCodeAt(0)).buffer);return {duration:buffer.duration,channels:buffer.numberOfChannels};}finally{await context.close();}})()`);
      assert.ok(decoded.duration>1 && decoded.channels>0);
    }
    const cache = path.join(directory,'profile','quran','audio',recitationPackId);
    await fs.mkdir(cache,{recursive:true});
    for (let ayah=1;ayah<=7;ayah++) await fs.copyFile(path.join(base,'3-Recitations and segments data','audio','husary','001',`001${String(ayah).padStart(3,'0')}.mp3`),path.join(cache,`001_${String(ayah).padStart(3,'0')}.mp3`));
    await fs.copyFile(path.join(base,'3-Recitations and segments data','audio','husary','002','002001.mp3'),path.join(cache,'002_001.mp3'));
    await evaluate("(()=>{const Original=window.Audio;window.Audio=function(...args){const audio=new Original(...args);window.quranTestAudio=audio;return audio;};window.Audio.prototype=Original.prototype;window.quranOriginalAudio=Original;})()");
    await evaluate("document.querySelector('[data-quran-workspace] button[aria-label='+JSON.stringify(window.quranWorkspace.t('quranAudioPlay'))+']').click()");
    await until("Boolean(window.quranTestAudio && !window.quranTestAudio.paused && window.quranTestAudio.duration>0)");
    for(let ayah=1;ayah<=7;ayah++) {
      await until(`window.quranTestAudio.src.includes('001_${String(ayah).padStart(3,'0')}.mp3') && !window.quranTestAudio.paused`);
      await evaluate("window.quranTestAudio.dispatchEvent(new Event('ended'))");
    }
    await until("window.quranTestAudio.src.includes('002_001.mp3') && !window.quranTestAudio.paused");
    await evaluate("document.querySelector('button[aria-label='+JSON.stringify(window.quranWorkspace.t('quranAudioPause'))+']').click()");
    await until('window.quranTestAudio.paused');
    await evaluate("document.querySelector('[role=region][aria-label='+JSON.stringify(window.quranWorkspace.t('quranAudioPlay'))+'] button[aria-label='+JSON.stringify(window.quranWorkspace.t('quranClosePanel'))+']').click()");
    assert.ok(await evaluate('window.quranTestAudio.paused'));
    await evaluate('(()=>{window.Audio=window.quranOriginalAudio;return true;})()');
    await evaluate("(()=>{const input=document.querySelector('[data-quran-mushaf] input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until("document.querySelector('[data-quran-mushaf] input[type=number]')?.value==='1'");
    await evaluate("window.quranWorkspace.setViewMode('library')");
    await until("!document.querySelector('[data-quran-reader]')");
    await evaluate("document.querySelector('header button[aria-label='+JSON.stringify(window.quranWorkspace.t('quranGlobalSearch'))+']').click()");
    await until("Boolean(document.querySelector('dialog[open] input[type=search]'))");
    await evaluate("(()=>{const input=document.querySelector('dialog input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'لا تأخذه سنة');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until("document.querySelectorAll('dialog button bdi').length>0");
    await evaluate("document.querySelector('dialog button bdi').closest('button').click()");
    const targetPage = unwrap(await evaluate<QuranResult<{pageNumber:number}>>(`window.electronAPI.quran.mushafPageForAyah({pack:${JSON.stringify(mushafLayoutId)},surah:2,ayah:255})`));
    await until(`document.querySelector('[data-quran-mushaf] input[type=number]')?.value===${JSON.stringify(String(targetPage.pageNumber))}`);
    await evaluate("[...document.querySelectorAll('[data-quran-workspace] aside[role=region] header button')].forEach(button=>button.click())");
    for (const theme of ['dark','light']) {
      await evaluate(`document.documentElement.classList.toggle('dark',${theme==='dark'})`);
      for (const language of ['ar','en']) {
        await evaluate(`if(window.quranWorkspace.lang!==${JSON.stringify(language)})window.quranWorkspace.toggleLanguage()`);
        for (const width of [480,768,1280]) {
          owner.setContentSize(width,1000);
          await evaluate(`if(window.quranWorkspace.isSidebarCollapsed!==${width < 1000})window.quranWorkspace.toggleSidebar()`);
          await new Promise(resolve=>setTimeout(resolve,300));
          assert.ok(await evaluate("(()=>{const reader=document.querySelector('[data-quran-reader]');return reader.scrollWidth<=reader.clientWidth+1;})()"));
          await evaluate("document.querySelector('[data-quran-fullscreen=enter]').click()");
          await until("Boolean(document.querySelector('[data-immersive]'))");
          await new Promise(resolve=>setTimeout(resolve,700));
          assert.ok(owner.isFullScreen() || await evaluate('Boolean(document.fullscreenElement)'));
          nativeFullscreenChecks++;
          assert.ok(await evaluate("(()=>{const rect=document.querySelector('[data-immersive]').getBoundingClientRect();return rect.x===0&&rect.y===0&&Math.abs(rect.width-innerWidth)<2&&Math.abs(rect.height-innerHeight)<2;})()"));
          await evaluate("document.querySelector('[data-quran-fullscreen=exit]').click()");
          await until("!document.fullscreenElement");
          for(let attempt=0;owner.isFullScreen()&&attempt<30;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
          await new Promise(resolve=>setTimeout(resolve,500));
          if(width===1280){
            let png=(await owner.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG();
            for(let retry=0;!png.length&&retry<6;retry++){await new Promise(resolve=>setTimeout(resolve,400));png=(await owner.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG();}
            assert.ok(png.length);
            await fs.writeFile(path.join(directory,`workspace-${language}-${theme}.png`),png);
          }
        }
      }
    }
    await verifyKhatmah(owner, directory, query.script, mushafLayoutId, evaluate, until);
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.quranWorkspace.t('quranResources')).click()");
    await until("Boolean(document.querySelector('section[aria-label='+JSON.stringify(window.quranWorkspace.t('quranRecommendationTitle'))+']'))");
    for(const language of ['ar','en']){
      await evaluate(`if(window.quranWorkspace.lang!==${JSON.stringify(language)})window.quranWorkspace.toggleLanguage()`);
      for(const width of [480,1280]){
        owner.setContentSize(width,1000);
        await evaluate(`if(window.quranWorkspace.isSidebarCollapsed!==${width<1000})window.quranWorkspace.toggleSidebar()`);
        await new Promise(resolve=>setTimeout(resolve,300));
        assert.equal(await evaluate("document.querySelector('section[aria-label='+JSON.stringify(window.quranWorkspace.t('quranRecommendationTitle'))+']').querySelectorAll('button').length"),4);
        assert.ok(await evaluate("(()=>{const view=document.querySelector('section[aria-label='+JSON.stringify(window.quranWorkspace.t('navQuran'))+']');return view.scrollWidth<=view.clientWidth+1;})()"));
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ directory, realSourcePacks: catalog.sources.length, controlledNativeDownload: 1, controlledBulkDownload: downloaded - 1, semanticResourceDownloads: 3, unifiedWorkspace: true, warshCoverage, globalSearchFromLibrary: '2:255', morphologyRows: morphology.length, phraseMatches: phrases.length, decodedRealReciters: 2, continuousSurahBoundaryPlayback: true, linkedFootnotes: 2, audioFixtureFiles: audioFiles, wholeQuranCancellation: true, nativeFullscreenChecks, offlineReader: true, groupedTafsir: commentary.from, conservativeArabicSearch: search.length, widths: [480, 768, 1280], languages: ['ar', 'en'], themes: ['dark', 'light'], errors }));
  } finally { if (errors.length) console.error(JSON.stringify({ rendererErrors: errors })); app.getAppPath = originalAppPath; dialog.showOpenDialog = originalDialog; clipboard.writeText = originalCopy; owner.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
