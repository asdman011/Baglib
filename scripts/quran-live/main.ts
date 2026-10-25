import { app, BrowserWindow, ipcMain, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { registerQuranIpc } from '../../src/main/ipc/quran';

const directory = process.env.BAGLIB_QURAN_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  let remoteSandbox = false;
  let servedDownloads = 0;
  const errors: string[] = [];
  const source = await fs.readFile('.baglib-data/qul-phase1/qpc-hafs-ayah-sqlite.zip');
  const tokenPath = '/resources/quran-script/01234567890123456789012345678901/download';
  const qul = session.fromPartition('baglib-qul');
  await qul.protocol.handle('https', request => {
    const url = new URL(request.url);
    if (url.origin === 'https://s3.us-east-1.wasabisys.com') { servedDownloads++; return new Response(source, { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="qpc.zip"' } }); }
    if (url.pathname === tokenPath) return new Response(null, { status: 302, headers: { location: 'https://s3.us-east-1.wasabisys.com/fixture/qpc.zip' } });
    if (url.pathname === '/resources/quran-script') return new Response('<html><body><h3><a href="/resources/quran-script/86">نص القرآن — QPC Hafs</a></h3></body></html>', { headers: { 'content-type': 'text/html' } });
    return new Response(`<html><body><h1>نص القرآن — QPC Hafs</h1><a id="download" target="_blank" href="${tokenPath}">Download sqlite</a></body></html>`, { headers: { 'content-type': 'text/html' } });
  });
  app.on('browser-window-created', (_event, window) => {
    window.hide();
    window.webContents.once('did-finish-load', () => {
      if (!window.webContents.getURL().startsWith('https://qul.tarteel.ai')) return;
      window.hide();
      const preferences = window.webContents.getLastWebPreferences();
      remoteSandbox = preferences.sandbox === true && preferences.contextIsolation === true && preferences.nodeIntegration === false && !preferences.preload;
      void window.webContents.executeJavaScript("if (window.electronAPI || typeof require !== 'undefined') throw new Error('Privileged remote renderer'); document.getElementById('download').click()").catch(error => errors.push(String(error)));
    });
  });
  registerQuranIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const owner = new BrowserWindow({ show: false, width: 1280, height: 960, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (code: string) => owner!.webContents.executeJavaScript(code);
  const until = async (expression: string) => {
    for (let iteration = 0; iteration < 150; iteration++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${expression}`);
  };
  try {
    await owner.loadFile(path.join(directory, 'index.html'));
    await until('Boolean(window.quranWorkspace) && !document.querySelector("section [role=status]")');
    const refresh = await evaluate("window.electronAPI.quran.refresh('quran-script')");
    assert.equal(refresh.ok, true, JSON.stringify(refresh));
    await until("document.querySelector('article')");
    const download = await evaluate("window.electronAPI.quran.download('quran-script/86')");
    assert.equal(download.ok, true, JSON.stringify(download));
    await until("window.electronAPI.quran.library().then(result => result.ok && result.data.jobs.some(job => job.state === 'complete'))").catch(async () => {
      console.log(JSON.stringify(await evaluate('window.electronAPI.quran.library()')));
      throw new Error('Native download did not finish');
    });
    const installed = await evaluate('window.electronAPI.quran.library()');
    assert.equal(installed.data.installed.length, 1);
    assert.equal(installed.data.installed[0].files[0].type, 'sqlite');
    assert.equal(remoteSandbox, true);
    assert.equal(servedDownloads, 1);
    for (const language of ['ar', 'en'] as const) {
      if (language === 'en') await evaluate('window.quranWorkspace.toggleLanguage()');
      for (const dark of [true, false]) for (const width of [480, 768, 1280]) {
        owner.setContentSize(width, 960);
        await evaluate(`document.documentElement.classList.toggle('dark', ${dark}); if (window.quranWorkspace.isSidebarCollapsed !== ${width < 1000}) window.quranWorkspace.toggleSidebar()`);
        await new Promise(resolve => setTimeout(resolve, 450));
        const geometry = await evaluate(`(() => { const region=document.querySelector('section'); const controls=[...region.querySelectorAll('button,input,select')].map(node=>node.getBoundingClientRect());let overlaps=0;for(let first=0;first<controls.length;first++)for(let next=first+1;next<controls.length;next++){const earlier=controls[first],later=controls[next];if(Math.min(earlier.right,later.right)-Math.max(earlier.left,later.left)>1&&Math.min(earlier.bottom,later.bottom)-Math.max(earlier.top,later.top)>1)overlaps++;}return {overlaps,overflow:region.scrollWidth>region.clientWidth+1,direction:region.getAttribute('dir')}; })()`);
        assert.equal(geometry.overlaps, 0, JSON.stringify({ width, geometry }));
        assert.equal(geometry.overflow, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.direction, language === 'ar' ? 'rtl' : 'ltr');
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
        if (width === 1280) {
          const rail = await evaluate("({className:document.querySelector('aside').className,width:document.querySelector('aside').getBoundingClientRect().width,collapsed:window.quranWorkspace.isSidebarCollapsed})");
          assert.ok(rail.width > 200, JSON.stringify(rail));
        }
        if ((language === 'ar' && dark && width === 480) || (language === 'en' && !dark && width === 1280)) {
          let png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG();
          for (let retry = 0; !png.length && retry < 5; retry++) { await new Promise(resolve => setTimeout(resolve, 300)); png = (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG(); }
          assert.ok(png.length > 0, 'Empty screenshot');
          await fs.writeFile(path.join(directory, `${language}-${width}.png`), png);
        }
      }
    }
    const removal = await evaluate(`window.electronAPI.quran.remove(${JSON.stringify(installed.data.installed[0].id)})`);
    assert.equal(removal.ok, true);
    assert.equal((await evaluate('window.electronAPI.quran.library()')).data.installed.length, 0);
    assert.deepEqual(errors, []);
    qul.protocol.unhandle('https');
    const live = await evaluate("window.electronAPI.quran.refresh('quran-script')");
    assert.equal(live.ok, true, JSON.stringify(live));
    const liveListing = await evaluate('window.electronAPI.quran.library()');
    assert.ok(liveListing.data.resources.length > 1);
    console.log(JSON.stringify({ nativeRedirectDownload: true, utilityProcessInstall: true, remoteSandbox, servedDownloads, liveCatalogResources: liveListing.data.resources.length, languages: ['ar', 'en'], widths: [480, 768, 1280], errors, directory }));
  } finally { owner.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
