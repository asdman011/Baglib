import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { registerQuranIpc } from '../../src/main/ipc/quran';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
const root = process.cwd(), directory = process.env.BAGLIB_QURAN_LAYOUT_DIRECTORY!, profile = process.env.BAGLIB_QURAN_LAYOUT_PROFILE!;
assert.ok(path.resolve(profile).startsWith(path.join(root, '.baglib-data', 'quran-reader-live') + path.sep) || (path.dirname(path.resolve(profile)) === path.join(root, '.baglib-data') && path.basename(profile).startsWith('layout-live-')));
app.setPath('userData', profile); app.setAppPath(root);
protocol.registerSchemesAsPrivileged([{ scheme: 'baglib-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.whenReady().then(async () => {
  runMigrations(getDatabase(), migrations); app.once('before-quit', closeDatabase);
  await protocol.handle('baglib-asset', async request => {
    const raw = decodeURIComponent(request.url.replace(/^baglib-asset:\/\//u, ''));
    const filename = /^[a-z][\\/]/iu.test(raw) ? `${raw[0]}:${raw.slice(1)}` : raw;
    assert.ok(path.resolve(filename).toLowerCase().startsWith((profile + path.sep).toLowerCase()));
    const bytes = await fs.readFile(filename); return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': /\.svg$/iu.test(filename) ? 'image/svg+xml' : 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });
  });
  registerQuranIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const window = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/preload/index.js') } }); window.webContents.setAudioMuted(true);
  const errors: string[] = []; window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  const until = async (code: string) => { for (let i = 0; i < 250; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw new Error(`Timed out: ${code}`); };
  const page = () => evaluate('Number(document.querySelector("[data-quran-mushaf] input[type=number]")?.value)');
  const key = (keyCode: string, modifiers: ('shift')[] = []) => evaluate(`(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(keyCode === 'Space' ? ' ' : keyCode === 'Left' ? 'ArrowLeft' : 'ArrowRight')},shiftKey:${modifiers.includes('shift')},bubbles:true,cancelable:true}))`);
  const unfocus = () => evaluate('document.activeElement?.blur()');
  try {
    await window.loadFile(path.join(directory, 'index.html'));
    await until('Boolean(window.quranLayout && document.querySelector(".mushaf-svg-surface [data-surah]"))');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.quranLayout.lang!==${JSON.stringify(language)})window.quranLayout.toggleLanguage()`);
      await evaluate(`if(window.quranLayout.theme!==${JSON.stringify(language === 'ar' ? 'dark' : 'light')})window.quranLayout.toggleTheme()`);
      await unfocus(); const initial = await page(); await key('Space'); await until(`Number(document.querySelector('[data-quran-mushaf] input[type=number]')?.value)===${initial + 1}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      await unfocus(); await key('Space', ['shift']); await until(`Number(document.querySelector('[data-quran-mushaf] input[type=number]')?.value)===${initial}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      await unfocus(); await key(language === 'ar' ? 'Left' : 'Right'); await until(`Number(document.querySelector('[data-quran-mushaf] input[type=number]')?.value)===${initial + 1}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      await evaluate('document.querySelector("[data-quran-mushaf] input[type=number]").focus()'); const inputPage = await page(); await key('Space'); await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(await page(), inputPage);
      await evaluate(`document.querySelector('button[aria-label='+JSON.stringify(window.quranLayout.t('quranCatTheme'))+']').click()`);
      await until('document.querySelectorAll("[data-quran-theme-marker]").length > 0');
      const markerGeometry = await evaluate(`Array.from(document.querySelectorAll('[data-quran-theme-marker]')).map(marker=>{
        const surface=document.querySelector('.mushaf-svg-surface').getBoundingClientRect();
        const boxes=Array.from(document.querySelectorAll('.mushaf-svg-surface [data-surah][data-aya]')).filter(element=>Number(element.dataset.surah)===Number(marker.dataset.surah)&&Number(element.dataset.aya)>=Number(marker.dataset.ayahFrom)&&Number(element.dataset.aya)<=Number(marker.dataset.ayahTo)).map(element=>element.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0&&box.bottom>surface.top&&box.top<surface.bottom);
        const actual=marker.getBoundingClientRect();
        return {count:boxes.length,topError:Math.abs(actual.top-Math.max(surface.top,Math.min(...boxes.map(box=>box.top)))),bottomError:Math.abs(actual.bottom-Math.min(surface.bottom,Math.max(...boxes.map(box=>box.bottom))))};
      })`);
      for (const geometry of markerGeometry) { assert.ok(geometry.count > 0); assert.ok(geometry.topError < 2 && geometry.bottomError < 2, JSON.stringify(geometry)); }
      await evaluate(`document.querySelector('button[aria-label='+JSON.stringify(window.quranLayout.t('quranCatTheme'))+']').click()`);
      for (const width of [480, 1280]) {
        window.setContentSize(width, 1000); await new Promise(resolve => setTimeout(resolve, 150));
        const centered = await evaluate(`(()=>{const button=document.querySelector('[data-quran-play-button]');const root=document.querySelector('[data-quran-workspace]');if(!button)return null;const a=button.getBoundingClientRect(),b=root.getBoundingClientRect();return Math.abs((a.left+a.right-b.left-b.right)/2)})()`);
        assert.notEqual(centered, null); assert.ok(centered < 1, String(centered));
        await evaluate(`(()=>{const button=document.querySelector('button[aria-label='+JSON.stringify(window.quranLayout.t('quranCatTafsir'))+']');button.focus();button.click()})()`);
        await until(`Boolean(document.querySelector('[data-quran-study-panel] section section'))`);
        assert.equal(await evaluate('document.querySelectorAll("[data-quran-study-panel]").length'), 1);
        assert.equal(await evaluate('document.activeElement===document.querySelector("[data-quran-study-panel] button")'), true);
        assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-quran-study-panel]'),b=p.querySelector('[tabindex="0"]');return p.scrollHeight<=p.clientHeight+1&&b.scrollHeight>b.clientHeight})()`));
        await evaluate(`(()=>{const body=document.querySelector('[data-quran-study-panel] [tabindex="0"]');body.focus();body.scrollTop=150})()`);
        const before = await page(); await key('Space'); await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(await page(), before);
        assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-quran-study-panel]').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.bottom<=innerHeight})()`));
        assert.ok(await evaluate(`(()=>{const panel=document.querySelector('[data-quran-study-panel]');if(getComputedStyle(panel).resize!=='both')return false;const old=panel.style.cssText;panel.style.width='210px';panel.style.height='250px';const box=panel.getBoundingClientRect();const fits=box.width<=211&&box.height<=251&&box.left>=0&&box.right<=innerWidth;panel.style.cssText=old;return fits;})()`));
        await fs.writeFile(path.join(directory, `tafsir-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
        await until(`!document.querySelector('[data-quran-study-panel]')`);
        assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')===window.quranLayout.t('quranCatTafsir')`), true);
      }
    }
    assert.deepEqual(errors, []); await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, realInstalledPacks: true, languages: ['ar', 'en'], widths: [480, 1280], nativeKeys: true, centeredAudio: true, singleScrollBody: true, errors }, null, 2));
    console.log(`Quran layout checks passed: ${directory}`);
  } catch (error) { await fs.writeFile(path.join(directory, 'failure.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); await fs.writeFile(path.join(directory, 'failure.txt'), String(await evaluate('document.body.innerText')) + '\n' + JSON.stringify(errors)); console.error(error); app.exit(1); return; }
  finally { window.destroy(); }
  app.quit();
});
