import { app, BrowserWindow, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { streamAssetResponse } from '../../src/main/services/digital/asset-range';
import { readerAssetUrl } from '../../src/shared/utils/reader-asset-url';
const directory = process.env.BAGLIB_KEY210_DIR!;
const evidence = process.env.BAGLIB_KEY210_EVIDENCE!;
fs.mkdirSync(path.join(directory, 'profile'), { recursive: true });
app.setPath('userData', path.join(directory, 'profile'));
app.commandLine.appendSwitch('remote-debugging-port', '9310');
protocol.registerSchemesAsPrivileged([{ scheme: 'baglib-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
void app.whenReady().then(async () => {
  const files = JSON.parse(fs.readFileSync(path.join(directory, 'inputs.json'), 'utf8')) as { filename: string; lang: string; path: string }[];
  const allowed = new Map(files.map(file => [new URL(readerAssetUrl(file.filename)).href, file.filename]));
  protocol.handle('baglib-asset', request => {
    const canonical = request.url.replace(/^baglib-asset:\/\/([a-z])\//iu, (_, drive: string) => `baglib-asset:///${drive.toUpperCase()}:/`);
    const filename = allowed.get(canonical);
    if (!filename) { console.error('Denied fixture URL', request.url, [...allowed.keys()]); return new Response(null, { status: 403 }); }
    return streamAssetResponse(new Request(request.url, { method: request.method, headers: request.headers }), filename, 'application/pdf');
  });
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const errors: string[] = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) { errors.push(message); console.error('Renderer', message); } });
  const evaluate = (code: string) => win.webContents.executeJavaScript(code, true);
  const until = async (code: string) => {
    for (let i = 0; i < 350; i++) { if (await evaluate(code)) return; await pause(100); }
    throw new Error('Timed out ' + code);
  };
  const results = [];
  try {
    for (const lang of ['ar', 'en']) {
      await win.loadFile(path.join(directory, 'index.html'), { query: { lang } });
      await until('!!window.lifecycle');
      for (const file of files) {
        for (let cycle = 0; cycle < 3; cycle++) {
          await evaluate(`window.lifecycle.open(${JSON.stringify(readerAssetUrl(file.filename))})`);
          await until('!!window.lifecycle.doc() && !!document.querySelector("canvas[data-pdf-painted-at],canvas[data-pdf-first-paint-at],.pdf-page-container canvas")');
          await until('window.lifecycle.stats.dispatches>0');
          const raster = await evaluate('window.lifecycle.doc().usesRasterHost');
          assert.equal(raster, true, 'Exercise real nested raster parser');
          await evaluate('document.querySelector("[data-thumbnails]").scrollTop=700');
          await pause(50);
          if (cycle === 0) {
            await until('!!document.querySelector("[data-thumbnails] img")');
            await pause(400);
            fs.writeFileSync(path.join(evidence, `${lang}-${file.lang}-${files.indexOf(file)}-thumbnails.png`), (await win.webContents.capturePage()).toPNG());
          }
          await evaluate('window.lifecycle.close()');
          await until('!document.querySelector(".pdf-page-container")');
          const before = await evaluate('window.lifecycle.stats.dispatches');
          await pause(700);
          assert.equal(await evaluate('window.lifecycle.stats.dispatches'), before, 'No render dispatch after close');
        }
      }
      const stats = await evaluate('window.lifecycle.stats');
      assert.equal(stats.rendersAfterClose, 0); assert.equal(stats.dispatchesAfterDispose, 0);
      assert.equal(stats.destroyed, stats.documents); assert.deepEqual(stats.errors, []);
      results.push({ lang, ...stats });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ results, rendererErrors: errors }, null, 2));
    console.log('PASS live ar/en', JSON.stringify(results));
    app.quit();
  } catch (error) {
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String((error as Error).stack));
    fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    console.error(error); app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
