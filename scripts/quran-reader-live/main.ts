import { app, BrowserWindow, clipboard, dialog, ipcMain, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { registerQuranIpc } from '../../src/main/ipc/quran';
import { readerPresets } from '../../src/main/services/quran/reader-resources';
import type { QuranResult, QuranReaderCatalog, QuranPassage, QuranCommentary, QuranSearchHit, QuranMushafPage, QuranAyahAudio } from '../../src/shared/types/quran';

const directory = process.env.BAGLIB_QURAN_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
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
  await qul.protocol.handle('https', request => {
    const url = new URL(request.url);
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
  registerQuranIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const owner = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = async <Value = unknown>(code: string): Promise<Value> => {
    try { return await owner.webContents.executeJavaScript(code, true); }
    catch (error) { throw new Error(`Evaluation failed: ${code.slice(0, 180)}; ${String(error)}`); }
  };
  const until = async (code: string) => {
    for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${code}`);
  };
  const unwrap = <Value>(result: QuranResult<Value>): Value => { assert.ok(result.ok, JSON.stringify(result)); return result.data; };
  try {
    await owner.loadFile(path.join(directory, 'index.html'));
    await until(`Boolean(window.quranWorkspace) && document.querySelectorAll("input[type=checkbox]").length===${readerPresets.length}`);
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
    await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
    await evaluate("(() => { const word=document.querySelector('.mushaf-svg-surface [data-surah][data-aya] path');word.dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); })()");
    assert.ok(await evaluate("document.querySelectorAll('[data-baglib-hover-ayah]').length > 1"));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-baglib-hover-word] path')).fill"), 'rgb(52, 211, 153)');
    await evaluate("document.querySelector('[data-baglib-hover-word] path').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    await until("document.querySelector('[role=dialog]')?.textContent.includes('بسم')");
    assert.ok(await evaluate("document.querySelector('[role=dialog]').textContent.includes('1:1')"));
    await evaluate("document.querySelector('[data-quran-study-jump]').click()");
    await evaluate("document.querySelector('[data-quran-mode=study]').click()");
    await until('document.querySelectorAll("section:first-child article[aria-label]").length===7 && !document.querySelector("section [role=alert]")');
    await evaluate("document.querySelector('[data-quran-options]').click()");
    await evaluate(`(() => { const select=document.querySelectorAll('[data-quran-reader] select')[1];select.value=${JSON.stringify(find('translation'))};select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await until("Boolean(document.querySelector('article [data-quran-translation]'))");
    await evaluate("document.querySelector('[data-quran-options]').click()");
    assert.equal(await evaluate("document.querySelector('article [data-quran-translation]').querySelectorAll('sup a').length"), 2);
    await evaluate("document.querySelector('article [data-quran-translation] sup a').click()");
    assert.ok(await evaluate("document.querySelector('article details').open && document.activeElement.tagName==='LI'"));
    await evaluate("document.querySelector('article ol a').click()");
    assert.equal(await evaluate("document.activeElement.closest('sup')?.textContent"), '[1]');
    const clickCopy = "([...document.querySelectorAll('article button')].find(b => b.querySelector('.lucide-copy')) || document.querySelectorAll('article button')[1]).click()";
    await evaluate(clickCopy);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(copied.endsWith('1:1'));
    const wordPoint = await evaluate<{ x: number; y: number }>("(() => {const rect=document.querySelector('[data-quran-word]').getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};})()");
    owner.webContents.sendInputEvent({ type: 'mouseMove', ...wordPoint });
    await evaluate("document.querySelector('[data-quran-word]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-quran-word]')).color"), 'oklch(0.765 0.177 163.223)');
    await evaluate("document.querySelector('[data-quran-word]').click()");
    await until("document.querySelector('[role=dialog]')?.textContent.includes('بسم')");
    await evaluate("document.querySelector('[data-quran-study-jump]').click()");
    await evaluate("document.querySelector('[data-quran-options]').click()");
    const selectMeaning = `(() => { const select=document.querySelectorAll('section select')[2];select.value=${JSON.stringify(find('word-translation'))};select.dispatchEvent(new Event('change',{bubbles:true})); })()`;
    await evaluate(selectMeaning);
    await until("document.querySelector('article')?.textContent.includes('In (the) name')");
    await evaluate("document.querySelector('[data-quran-options]').click()");
    assert.equal(unwrap(await evaluate<QuranResult<QuranPassage>>(`window.electronAPI.quran.read(${JSON.stringify({ ...query, surah: 1, from: 1 })})`)).ayahs.length, 7);
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
    await evaluate("document.querySelector('[data-quran-mode=mushaf]').click()");
    await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
    assert.ok(await evaluate("document.querySelector('.mushaf-svg-surface').innerHTML.includes('md-page')"));
    await evaluate("document.querySelector('[data-quran-mode=study]').click()");
    await until("Boolean(document.querySelector('article[aria-label]'))");
    await evaluate("document.querySelector('header button[aria-label=' + JSON.stringify(window.quranWorkspace.t('quranGlobalSearch')) + ']').click()");
    await until("Boolean(document.querySelector('dialog[open] input[type=search]'))");
    await evaluate("(() => { const input=document.querySelector('dialog input[type=search]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'بسم الله');input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await until("document.querySelectorAll('dialog button bdi').length>0");
    await evaluate("document.querySelector('dialog button bdi').closest('button').click()");
    await until("!document.querySelector('dialog[open]') && Boolean(document.querySelector('article[aria-label=\"1:1\"]'))");
    await evaluate("window.quranWorkspace.setViewMode('library')");
    await until("!document.querySelector('[data-quran-reader]')");
    await evaluate("document.querySelector('header button[aria-label=' + JSON.stringify(window.quranWorkspace.t('quranGlobalSearch')) + ']').click()");
    await until("Boolean(document.querySelector('dialog[open] input[type=search]'))");
    await evaluate("(() => { const input=document.querySelector('dialog input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'لا تأخذه سنة');input.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await until("document.querySelectorAll('dialog button bdi').length>0");
    await evaluate("document.querySelector('dialog button bdi').closest('button').click()");
    await until("Boolean(document.querySelector('article[aria-label=\"2:255\"]'))");
    for (const theme of ['dark', 'light']) {
    await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`);
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.quranWorkspace.lang!==${JSON.stringify(language)})window.quranWorkspace.toggleLanguage()`);
      for (const width of [480, 768, 1280]) {
        owner.setContentSize(width, 1000);
        await evaluate(`if(window.quranWorkspace.isSidebarCollapsed!==${width < 1000})window.quranWorkspace.toggleSidebar()`);
        await new Promise(resolve => setTimeout(resolve, 500));
        const geometry = await evaluate<{ overflow: boolean; direction: string; overlaps: number }>(`(() => { const region=document.querySelector('section');const controls=[...region.querySelectorAll('button,input,select')].map(node=>node.getBoundingClientRect());let overlaps=0;for(let first=0;first<controls.length;first++)for(let next=first+1;next<controls.length;next++){const firstRect=controls[first],nextRect=controls[next];if(Math.min(firstRect.right,nextRect.right)-Math.max(firstRect.left,nextRect.left)>1 && Math.min(firstRect.bottom,nextRect.bottom)-Math.max(firstRect.top,nextRect.top)>1)overlaps++;}return {overflow:region.scrollWidth>region.clientWidth+1,direction:region.getAttribute('dir'),overlaps}; })()`);
        assert.equal(geometry.overflow, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.overlaps, 0, JSON.stringify({ width, geometry }));
        assert.equal(geometry.direction, language === 'ar' ? 'rtl' : 'ltr');
        assert.ok(await evaluate("(() => {const header=document.querySelector('header');return header.scrollWidth<=header.clientWidth+1;})()"));
        if (width === 480 && theme === 'dark') {
          await evaluate("document.querySelector('header button[aria-label=' + JSON.stringify(window.quranWorkspace.t('quranGlobalSearch')) + ']').click()");
          await until("Boolean(document.querySelector('dialog[open] input[type=search]'))");
          await evaluate("(() => { const input=document.querySelector('dialog input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'الحمد');input.dispatchEvent(new Event('input',{bubbles:true})); })()");
          await until("document.querySelectorAll('dialog button bdi').length>0");
          assert.equal(await evaluate("document.querySelector('dialog[open]').getAttribute('dir')"), language === 'ar' ? 'rtl' : 'ltr');
          let searchPng = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG();
          for (let retry = 0; !searchPng.length && retry < 6; retry++) { await new Promise(resolve => setTimeout(resolve, 400)); searchPng = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG(); }
          assert.ok(searchPng.length > 0, 'Empty search screenshot');
          await fs.writeFile(path.join(directory, `search-${language}-480.png`), searchPng);
          await evaluate("document.querySelector('dialog header button').click()");
        }
        await evaluate("document.querySelector('[data-quran-mode=mushaf]').click()");
        await until("Boolean(document.querySelector('.mushaf-svg-surface svg'))");
        await evaluate("document.querySelector('[data-quran-fullscreen=enter]').click()");
        await until("Boolean(document.querySelector('[data-immersive]'))");
        await new Promise(resolve => setTimeout(resolve, 700));
        if (owner.isFullScreen() || await evaluate('Boolean(document.fullscreenElement)')) nativeFullscreenChecks++;
        assert.ok(await evaluate("(() => {const node=document.querySelector('[data-immersive]'),rect=node.getBoundingClientRect();return rect.x===0 && rect.y===0 && Math.abs(rect.width-innerWidth)<2 && Math.abs(rect.height-innerHeight)<2;})()"));
        await evaluate("document.querySelector('.mushaf-svg-surface [data-surah][data-aya] path').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
        await until("document.querySelector('[role=dialog]')?.textContent.includes('بسم')");
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.ok(await evaluate(`(() => {const rect=document.querySelector('[role=dialog]').getBoundingClientRect();return ${language === 'ar' ? 'Math.abs(innerWidth-rect.right)<2' : 'Math.abs(rect.left)<2'};})()`));
        if ((width === 480 && language === 'ar') || (width === 1280 && language === 'en')) {
          if (theme === 'light') assert.equal(await evaluate("getComputedStyle(document.querySelector('.mushaf-svg-surface').parentElement).backgroundColor"), 'rgb(255, 255, 255)');
          let png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG();
          for (let retry = 0; !png.length && retry < 6; retry++) { await new Promise(resolve => setTimeout(resolve, 400)); png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG(); }
          assert.ok(png.length > 0, 'Empty inspector screenshot');
          await fs.writeFile(path.join(directory, `inspector-${language}-${theme}-${width}.png`), png);
        }
        await evaluate("document.querySelector('[data-quran-study-jump]').click()");
        await until("!document.querySelector('[data-immersive]') && Boolean(document.querySelector('article[aria-label]'))");
        await until('!document.fullscreenElement');
        for (let attempt = 0; owner.isFullScreen() && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(owner.isFullScreen(), false);
        await new Promise(resolve => setTimeout(resolve, 300));
        if ((width === 480 && language === 'ar') || (width === 1280 && language === 'en')) {
          let png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG();
          for (let retry = 0; !png.length && retry < 6; retry++) { await new Promise(resolve => setTimeout(resolve, 400)); png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG(); }
          assert.ok(png.length > 0, 'Empty reader screenshot');
          await fs.writeFile(path.join(directory, `${language}-${theme}-${width}.png`), png);
        }
      }
    }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ directory, realSourcePacks: catalog.sources.length, controlledNativeDownload: 1, controlledBulkDownload: downloaded - 1, semanticResourceDownloads: 3, globalSearchFromLibrary: '2:255', linkedFootnotes: 2, audioFixtureFiles: audioFiles, wholeQuranCancellation: true, nativeFullscreenChecks, offlineReader: true, groupedTafsir: commentary.from, conservativeArabicSearch: search.length, widths: [480, 768, 1280], languages: ['ar', 'en'], themes: ['dark', 'light'], errors }));
  } finally { if (errors.length) console.error(JSON.stringify({ rendererErrors: errors })); dialog.showOpenDialog = originalDialog; clipboard.writeText = originalCopy; owner.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
