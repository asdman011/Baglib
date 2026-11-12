import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { registerQuranIpc } from '../../src/main/ipc/quran';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
const root = process.cwd(), directory = process.env.BAGLIB_QURAN_LAYOUT_DIRECTORY!, profile = process.env.BAGLIB_QURAN_LAYOUT_PROFILE!;
assert.ok(path.resolve(profile).startsWith(path.join(root, '.baglib-data', 'quran-reader-live') + path.sep) || (path.dirname(path.resolve(profile)) === path.join(root, '.baglib-data') && path.basename(profile).startsWith('layout-live-'))
  // KEY-317: or the runner's own throwaway profile with copied packs.
  || (path.basename(path.resolve(profile)) === 'profile' && path.dirname(path.dirname(path.resolve(profile))) === path.join(root, '.baglib-data', 'quran-layout-live')));
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
  // KEY-309: a saved Continue-reading position (Ayat al-Kursi) is restored on open; restoring must not open the study panel.
  ipcMain.handle('settings:get', (_event, key: string, fallback?: unknown) => key === 'islamic.continue.v1.quran' ? { target: 'quran:hafs:2:255', label: 'Al-Baqarah 255' } : fallback);
  ipcMain.handle('settings:set', () => true);
  const window = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/preload/index.js') } }); window.webContents.setAudioMuted(true);
  const errors: string[] = []; window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (code: string) => window.webContents.executeJavaScript(code).catch((error: Error) => { throw new Error(`${error.message}: ${code.slice(0, 220)}`); });
  const until = async (code: string) => { for (let i = 0; i < 250; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 60)); } throw new Error(`Timed out: ${code}`); };
  const page = () => evaluate(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)`);
  const key = (keyCode: string, modifiers: ('shift')[] = []) => evaluate(`(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(keyCode === 'Space' ? ' ' : keyCode === 'Left' ? 'ArrowLeft' : 'ArrowRight')},shiftKey:${modifiers.includes('shift')},bubbles:true,cancelable:true}))`);
  const unfocus = () => evaluate('document.activeElement?.blur()');
  try {
    await window.loadFile(path.join(directory, 'index.html'));
    await until('Boolean(window.quranLayout && document.querySelector(".mushaf-svg-surface [data-surah]"))');
    await until(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)===42`);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(await evaluate('document.querySelectorAll("[data-islamic-reader-panel]").length'), 0, 'restored position opened the study panel');
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.quranLayout.lang!==${JSON.stringify(language)})window.quranLayout.toggleLanguage()`);
      await evaluate(`if(window.quranLayout.theme!==${JSON.stringify(language === 'ar' ? 'dark' : 'light')})window.quranLayout.toggleTheme()`);
      await unfocus(); const initial = await page(); await key('Space'); await until(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)===${initial + 1}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      await unfocus(); await key('Space', ['shift']); await until(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)===${initial}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      await unfocus(); await key(language === 'ar' ? 'Left' : 'Right'); await until(`Number(document.querySelector('input[aria-label="انتقال إلى صفحة..."],input[aria-label="Jump to page..."]')?.value)===${initial + 1}`);
      await until('Boolean(document.querySelector(".mushaf-svg-surface [data-surah]"))');
      // The page input is hidden in this layout; a temporary text field inside the reader exercises the same guard
      // (reading keys never act while focus is in an input).
      await until(`(()=>{let input=document.querySelector('[data-quran-reader] input[data-key317-probe]');if(!input){input=document.createElement('input');input.setAttribute('data-key317-probe','');document.querySelector('[data-quran-reader]').prepend(input);}input.focus();return document.activeElement===input;})()`); const inputPage = await page(); await key('Space'); await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(await page(), inputPage);
      await evaluate("document.querySelector('[data-key317-probe]')?.remove()");
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
        // Since KEY-305 recitation starts from the study panel's Recitation tab; the floating play button exists only without the panel.
        if (centered !== null) assert.ok(centered < 1, String(centered));
        // Since KEY-305 tafsir opens in the shared study panel (from the ayah menu), not a floating study window.
        await evaluate(`document.querySelector('[data-quran-ayah-actions]').click()`);
        await until(`Boolean(document.querySelector('[data-menu-action="tafsir"]'))`);
        await evaluate(`document.querySelector('[data-menu-action="tafsir"]').click()`);
        await until(`Boolean(document.querySelector('[data-islamic-reader-panel] [role=tabpanel]'))`);
        assert.equal(await evaluate('document.querySelectorAll("[data-islamic-reader-panel]").length'), 1);
        // Space inside the panel scrolls its text and never turns the mushaf page.
        await evaluate(`(()=>{const body=document.querySelector('[data-islamic-reader-panel] [role=tabpanel]');body.focus();body.scrollTop=150})()`);
        const before = await page(); await key('Space'); await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(await page(), before);
        assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-islamic-reader-panel]').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth+1&&p.bottom<=innerHeight+1})()`));
        // KEY-309: phones get a bottom sheet across the reader; wide screens keep the side panel.
        const sheet = await evaluate(`(()=>{const p=document.querySelector('[data-islamic-reader-panel]').getBoundingClientRect();return {wide:p.width>=innerWidth-40,lower:p.top>=innerHeight*0.3,side:p.width<=420}})()`);
        if (width === 480) assert.ok(sheet.wide && sheet.lower, 'bottom sheet at 480: ' + JSON.stringify(sheet));
        else assert.ok(sheet.side, 'side panel at 1280: ' + JSON.stringify(sheet));
        await fs.writeFile(path.join(directory, `tafsir-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
        await until(`!document.querySelector('[data-islamic-reader-panel]')`);
      }
    }
    assert.deepEqual(errors, []); await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, realInstalledPacks: true, languages: ['ar', 'en'], widths: [480, 1280], nativeKeys: true, centeredAudio: true, singleScrollBody: true, errors }, null, 2));
    console.log(`Quran layout checks passed: ${directory}`);
  } catch (error) { await fs.writeFile(path.join(directory, 'failure.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); await fs.writeFile(path.join(directory, 'failure.txt'), String(await evaluate('document.body.innerText')) + '\n' + JSON.stringify(errors)); console.error(error); app.exit(1); return; }
  finally { window.destroy(); }
  app.quit();
});
