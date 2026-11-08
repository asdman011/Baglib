import * as electron from 'electron';
import path from 'node:path';
import * as url from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { registerPdfEditorIpc, shutdownPdfViewCaches } from '../../src/main/ipc/pdf-editor';
import { initializeMaterialSave, materialSave } from '../../src/main/ipc/material-save';
import { makePagePdf } from '../../tests/helpers/pdf-pages';
import { fileSha256 } from '../../src/main/services/pdf-editor/source';
import { readerAssetUrl } from '../../src/shared/utils/reader-asset-url';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
import { streamAssetResponse } from '../../src/main/services/digital/asset-range';
import { writeSparsePagePdf } from '../../tests/helpers/sparse-pdf';
import { inspectPdfFile } from '../../src/main/services/pdf-editor/inspection';
var root = process.cwd();
var directory = process.env.BAGLIB_PDF_LIVE_DIRECTORY;
const externalSource = process.env.BAGLIB_TEST_READONLY_PDF ? path.resolve(process.env.BAGLIB_TEST_READONLY_PDF) : null;
if (externalSource && process.env.BAGLIB_TEST_RANGE !== '1' && process.env.BAGLIB_TEST_FIRST_PAINT !== '1') throw new Error('Read-only source requires range-only verification');
electron.protocol.registerSchemesAsPrivileged([{ scheme: "baglib-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
electron.app.setPath("userData", path.join(directory, "profile"));
electron.app.setAppPath(root);
electron.app.whenReady().then(async () => {
  const servedRequests = [];
  let servedBytes = 0;
  electron.protocol.handle("baglib-asset", async (request) => {
    const raw = decodeURIComponent(request.url.replace(/^baglib-asset:\/\//u, "").split(/[?#]/u)[0]);
    let localPath = process.platform === "win32" ? raw.replace(/^\/+ /u, "") : raw;
    if (process.platform === "win32") {
      localPath = raw.replace(/^\/+/u, "");
      if (/^[a-zA-Z]\//u.test(localPath)) localPath = `${localPath[0]}:${localPath.slice(1)}`;
    }
    const target = path.resolve(localPath);
    const expected = externalSource || path.join(directory, "source.pdf");
    const stagedRoot = path.join(directory, 'profile', 'pdf-editor', 'jobs') + path.sep;
    const staged = (process.platform === 'win32' ? target.toLowerCase().startsWith(stagedRoot.toLowerCase()) : target.startsWith(stagedRoot)) && target.endsWith('.pdf');
    const cacheRoot = path.join(directory, 'view-cache') + path.sep;
    const cached = (process.platform === 'win32' ? target.toLowerCase().startsWith(cacheRoot.toLowerCase()) : target.startsWith(cacheRoot)) && /^[a-f0-9]{64}\.pdf$/u.test(path.basename(target));
    if (!staged && !cached && (process.platform === "win32" ? target.toLowerCase() !== expected.toLowerCase() : target !== expected)) {
      console.error('[fixture-asset-denied]', { target, cacheRoot });
      return new Response(null, { status: 403 });
    }
    if (cached && globalThis.failCachedRanges && request.headers.get('range')) return new Response(null, { status: 500 });
    let response = await streamAssetResponse(request, target, 'application/pdf');
    if (process.env.BAGLIB_TEST_RANGE_FAILURE === '1' && request.headers.get('range') && !request.headers.get('range').startsWith('bytes=0-')) response = new Response(response.body, { status: 200, headers: response.headers });
    servedRequests.push({ cached, method: request.method, range: request.headers.get('range'), status: response.status });
    if (!response.body) return response;
    const body = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) { servedBytes += chunk.byteLength; controller.enqueue(chunk); } }));
    return new Response(body, { status: response.status, headers: response.headers });
  });
  const db2 = getDatabase();
  runMigrations(db2, migrations);
  await initializeMaterialSave();
  const filename = externalSource || path.join(directory, "source.pdf");
  if (!externalSource) {
    if (process.env.BAGLIB_TEST_LARGE_RANGE === '1') await writeSparsePagePdf(filename, 2, 500 * 1024 * 1024);
    else await fs.writeFile(filename, makePagePdf(process.env.BAGLIB_TEST_PERFORMANCE === '1' ? 60 : 2, Buffer.alloc(process.env.BAGLIB_TEST_RANGE === '1' ? 32 * 1024 * 1024 : 0)));
  }
  const externalHash = externalSource ? await fileSha256(externalSource) : null;
  const works = new SqliteWorkRepository(db2);
  works.addBook({ id: "fixture-work", title: "\u0628\u062D\u062B \u2014 Research", author: "", workType: "book", bookType: "digital", filePath: filename, digitalFormat: "PDF" });
  for (const [channel, action] of Object.entries({ "library:get-all-books": () => works.getAllWorks(), "library:get-all-notes": () => [], "categories:get-tree": () => [], "tags:get-all": () => [] })) electron.ipcMain.handle(channel, action);
  const registerHandler = electron.ipcMain.handle.bind(electron.ipcMain);
  if (process.env.BAGLIB_TEST_MUTATIONS === '1') electron.ipcMain.handle = (channel, handler) => registerHandler(channel, async (...args) => {
    const result = await handler(...args);
    if (channel === 'pdf-editor:start') console.log('Native tool request:', JSON.stringify(args[1]), 'response:', JSON.stringify(result));
    return result;
  });
  registerPdfEditorIpc({ viewCacheDirectory: path.join(directory, 'view-cache') });
  electron.ipcMain.handle = registerHandler;
  const provider = AIProviderService.getInstance();
  provider.generateChatCompletion = async (request) => {
    const context = JSON.parse(request.userPrompt);
    assert.equal(context.task, "chapters");
    const evidence = context.pages[0];
    return JSON.stringify({ answer: "Disposable chapter-summary integration fixture", abstained: false, citations: [{ page: evidence.page, quote: evidence.text.trim().slice(0, 30) }] });
  };
  const window = new electron.BrowserWindow({ width: 1280, height: 1e3, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(root, "dist/preload/index.js") } });
  const errors = [];
  const pdfWarnings = [];
  window.webContents.on("console-message", (_, level, message) => {
    if (level >= 3) errors.push(message);
    if (/xref|indexing|lineariz|invalid/i.test(message)) pdfWarnings.push(message);
  });
  const evaluate = (code) => window.webContents.executeJavaScript(code).catch(error => { console.error('Native evaluation failed:', code, errors); throw error; });
  const until = async (code) => {
    for (let i = 0; i < (process.env.BAGLIB_TEST_MUTATIONS === '1' || process.env.BAGLIB_TEST_VIEW_CACHE === '1' || process.env.BAGLIB_TEST_ORGANIZER_OUTPUTS === '1' ? 1200 : 200); i++) {
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out ${code}`);
  };
  try {
    await window.loadFile(path.join(directory, "index.html"), { query: process.env.BAGLIB_TEST_FIRST_PAINT === '1' ? { performance: '1', delayedOpen: '1', viewCache: '1', pdf: readerAssetUrl(filename) } : process.env.BAGLIB_TEST_PERFORMANCE === '1' || process.env.BAGLIB_TEST_RANGE === '1' ? { performance: '1', pdf: readerAssetUrl(filename), ...(process.env.BAGLIB_TEST_VIEW_CACHE === '1' ? { viewCache: '1' } : {}) } : process.env.BAGLIB_TEST_TOC === '1' ? { toc: '1' } : process.env.BAGLIB_TEST_IMMERSIVE === "1" ? { pdf: readerAssetUrl(filename) } : {} });
    await until('Boolean(window.pdfLive && (document.querySelector("[data-pdf-performance]") || document.querySelector("[data-pdf-workstation]") || document.querySelector("[data-pdf-toc-editor]")))');
    if (process.env.BAGLIB_TEST_LANGUAGE) {
      const language = process.env.BAGLIB_TEST_LANGUAGE;
      if (await evaluate('window.pdfLive.lang') !== language) await evaluate('window.pdfLive.toggleLanguage()');
      await until(`window.pdfLive.lang === ${JSON.stringify(language)}`);
    }
    if (process.env.BAGLIB_TEST_FIRST_PAINT === '1') {
      const sourceBefore = await fileSha256(filename);
      const page = Number(process.env.BAGLIB_TEST_FIRST_PAINT_PAGE ?? 1);
      await evaluate(`window.pdfFirstPaintPage = ${page}`);
      const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      const open = async label => {
        await sleep(1500);
        await evaluate('window.pdfPerformance.open()');
        await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
        const sample = await evaluate(`({ preview: window.pdfPreviewPresentedAt ? window.pdfPreviewPresentedAt - window.pdfOpenAt : null, crisp: Number(document.querySelector('canvas').dataset.pdfPaintedAt) - window.pdfOpenAt, source: document.querySelector('canvas').dataset.pdfPaintSource })`);
        await sleep(1200);
        await evaluate('window.pdfPerformance.close()');
        return { label, ...sample };
      };
      const results = [await open('cold: no preview yet'), await open('warm: preview'), await open('warm: preview')];
      const lookup = `window.electronAPI.pdfEditor.viewSource({path:${JSON.stringify(filename)},...(window.pdfCacheLease?{id:window.pdfCacheLease}:{})}).then(result=>{if(!result.ok)throw new Error(result.error);window.pdfCacheLease=result.data.id;return result.data.cached;})`;
      await until(lookup);
      results.push(await open('warm: optimized cache'), await open('warm: optimized cache'));
      assert.equal(await fileSha256(filename), sourceBefore);
      if (process.env.BAGLIB_TEST_REAL_SCROLL === '1') {
        await sleep(1500);
        await evaluate('window.pdfPerformance.open()');
        await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
        await evaluate(`window.pdfPerformance.setMode('scrolled')`);
        await until(`document.querySelectorAll('.pdf-page-holder').length > 1`);
        await sleep(2500);
        const scroll = await evaluate(`new Promise(resolve => {
          const container = document.querySelector('.pdf-native-viewer-container');
          const longTasks = [];
          const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => Math.round(entry.duration))));
          observer.observe({ type: 'longtask', buffered: false });
          const deltas = []; let previous, step = 0, maxCanvases = 0;
          function frame(now) {
            if (previous !== undefined) deltas.push(now - previous); previous = now;
            container.scrollTop += 60;
            maxCanvases = Math.max(maxCanvases, container.querySelectorAll('canvas').length);
            if (++step <= 360) requestAnimationFrame(frame);
            else { observer.disconnect(); resolve({ deltas, maxCanvases, longTasks, page: container.scrollTop }); }
          }
          requestAnimationFrame(frame);
        })`);
        const sorted = scroll.deltas.slice(1).sort((first, second) => first - second);
        console.log(JSON.stringify({ realScroll: { frames: sorted.length, over17ms: sorted.filter(value => value > 17).length, over25ms: sorted.filter(value => value > 25).length, p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], p99: sorted[Math.floor(sorted.length * 0.99)], max: sorted.at(-1), longTasks: scroll.longTasks, maxCanvases: scroll.maxCanvases } }));
        await evaluate(`window.pdfPerformance.setMode('single')`);
        await evaluate('window.pdfPerformance.close()');
      }
      if (process.env.BAGLIB_TEST_LATE_FAILURE === '1') {
        await sleep(1500);
        await evaluate('window.pdfPerformance.open()');
        await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
        const before = servedRequests.filter(item => item.cached).length;
        assert.ok(before > 0, 'Reader did not use the cached derivative');
        globalThis.failCachedRanges = true;
        const target = Number(process.env.BAGLIB_TEST_LATE_FAILURE_PAGE ?? 400);
        await evaluate(`window.pdfPerformance.setPage(${target})`);
        await until(`document.querySelector('[data-page-number="${target}"] canvas')?.dataset.pdfPaintedAt`);
        const recovered = await evaluate(`Boolean(document.querySelector('[data-page-number="${target}"] canvas'))`);
        const after = servedRequests.slice(-5).map(item => item.cached);
        console.log(JSON.stringify({ lateFailure: { recovered, page: target, lastRequestsCached: after } }));
        assert.equal(await evaluate(`window.electronAPI.pdfEditor.viewSource({path:${JSON.stringify(filename)},id:window.pdfCacheLease}).then(result=>result.ok&&result.data.cached)`), false);
        assert.equal(await fileSha256(filename), sourceBefore);
      }
      console.log(JSON.stringify({ firstPaint: results, errors: errors.filter(message => !/Failed to load resource|Error rendering page/u.test(message)) }));
      electron.app.quit();
      return;
    }
    if (process.env.BAGLIB_TEST_PAINT_BARRIER === '1') {
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      const firstBitmapAt = await evaluate(`Number(document.querySelector('canvas').dataset.pdfPaintedAt)`);
      await until('window.pdfOutlineLoadedAt > 0');
      const outlineAt = await evaluate('window.pdfOutlineLoadedAt');
      assert.ok(outlineAt > firstBitmapAt);
      console.log(JSON.stringify({ firstBitmapAt, outlineAt, outlineDeferredUntilBitmap: true }));
      electron.app.quit();
      return;
    }
    if (process.env.BAGLIB_TEST_VIEW_CACHE === '1') {
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      console.log('[view-cache-test] Original painted');
      const initialPaintMs = await evaluate(`Number(document.querySelector('canvas').dataset.pdfPaintedAt)-window.pdfFixtureMountStartedAt`);
      const initialDocumentReadyMs = await evaluate('window.pdfDocumentReadyAt-window.pdfFixtureMountStartedAt');
      const originalPixels = await evaluate(`document.querySelector('canvas').toDataURL()`);
      const originalPages = await evaluate('window.pdfDocumentPages');
      const sourceBefore = await fileSha256(filename);
      const lookup = `window.electronAPI.pdfEditor.viewSource({path:${JSON.stringify(filename)},...(window.pdfCacheLease?{id:window.pdfCacheLease}:{})}).then(result=>{if(!result.ok)throw new Error(result.error);window.pdfCacheLease=result.data.id;window.pdfCacheState=result.data;return result.data.cached;})`;
      await until(lookup);
      console.log('[view-cache-test] Derivative ready');
      const state = await evaluate('window.pdfCacheState');
      const corruptCache = process.env.BAGLIB_TEST_CACHE_FAILURE === '1';
      if (corruptCache) {
        if (externalSource) throw new Error('Fault injection requires a disposable source');
        const cachedFile = path.join(directory, 'view-cache', state.key + '.pdf');
        const bytes = (await fs.stat(cachedFile)).size;
        const corrupted = Buffer.alloc(bytes, 32);
        corrupted.write('%PDF-1.7\ninvalid cached derivative');
        await fs.writeFile(cachedFile, corrupted);
      }
      await evaluate('window.electronAPI.pdfEditor.releaseViewSource(window.pdfCacheLease)');
      const warmStartBytes = servedBytes, warmStartRequests = servedRequests.length;
      const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
      window.webContents.reload(); await reloaded;
      console.log('[view-cache-test] Reload complete');
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      const cachedPaintMs = await evaluate(`Number(document.querySelector('canvas').dataset.pdfPaintedAt)-window.pdfFixtureMountStartedAt`);
      const cachedDocumentReadyMs = await evaluate('window.pdfDocumentReadyAt-window.pdfFixtureMountStartedAt');
      const cachedStages = await evaluate(`(()=>{const data=document.querySelector('canvas').dataset;return {pageRequestMs:Number(data.pdfPageRequestedAt)-window.pdfFixtureMountStartedAt,pageReadyMs:Number(data.pdfPageReadyAt)-window.pdfFixtureMountStartedAt,rasterStartMs:Number(data.pdfRasterStartedAt)-window.pdfFixtureMountStartedAt,rasterEndMs:Number(data.pdfRasterFinishedAt)-window.pdfFixtureMountStartedAt};})()`);
      assert.equal(await evaluate('window.pdfDocumentPages'), originalPages);
      assert.ok(await evaluate(`document.querySelector('canvas').toDataURL()`) === originalPixels, 'First-page pixels changed in viewing derivative');
      assert.ok(servedRequests.slice(warmStartRequests).some(request => request.cached));
      if (corruptCache) assert.ok(servedRequests.slice(warmStartRequests).some(request => !request.cached), 'Original fallback was not requested');
      assert.equal(await fileSha256(filename), sourceBefore);
      const warmBytes = servedBytes - warmStartBytes, warmRequests = servedRequests.slice(warmStartRequests);
      let editedSourceReloaded = false;
      if (!externalSource) {
        console.log('[view-cache-test] Checking source edit invalidation');
        await fs.writeFile(filename, makePagePdf(3, Buffer.alloc(0)));
        await until('window.pdfDocumentPages === 3');
        editedSourceReloaded = true;
      }
      const report = { initialPaintMs, initialDocumentReadyMs, cachedPaintMs, cachedDocumentReadyMs, cachedStages, originalPages, firstPagePixelsEqual: true, recoveredFromCorruptCache: corruptCache, warmBytes, warmRequests, cacheKey: state.key, originalUnchangedBeforeDeliberateFixtureEdit: true, editedSourceReloaded, caveat: 'Fresh renderer reload; warmed filesystem; offscreen canvas completion, not full-app/compositor or cold-disk timing' };
      await fs.writeFile(path.join(directory, 'view-cache.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ...report, warmRequests: undefined, warmRequestCount: warmRequests.length, reportPath: path.join(directory, 'view-cache.json') }));
      console.log(`Native cache reopen/source integrity checks passed: ${directory}`);
      return;
    }
    if (process.env.BAGLIB_TEST_RANGE === '1' && process.env.BAGLIB_TEST_RASTER_WORKER !== '1' && process.env.BAGLIB_TEST_RASTER_INTEGRATION !== '1') {
      if (process.env.BAGLIB_TEST_RANGE_FAILURE === '1') {
        await until(`document.querySelector('[data-pdf-performance]').textContent.includes(window.pdfLive.t('pdfDocumentLoadFailed'))`);
        assert.equal(await evaluate(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`), false);
        console.log(`Native range failure surfaced without hanging: ${directory}`);
        electron.app.quit();
        return;
      }
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      const sourceBytes = (await fs.stat(filename)).size;
      const bytesAtPaint = servedBytes;
      const requestsAtPaint = servedRequests.slice();
      assert.ok(servedBytes < (externalSource ? sourceBytes : 1024 * 1024), `Full-file loading regression: ${servedBytes}`);
      assert.ok(servedRequests.filter(request => request.method === 'GET').every(request => request.status === 206 && request.range));
      const paintedAt = await evaluate(`Number(document.querySelector('canvas').dataset.pdfPaintedAt) - window.pdfFixtureMountStartedAt`);
      if (externalSource) assert.equal(await fileSha256(externalSource), externalHash);
      const documentReadyAt = await evaluate('window.pdfDocumentReadyAt - window.pdfFixtureMountStartedAt');
      const report = { sourceBytes, servedBytes: bytesAtPaint, servedRequests: requestsAtPaint, paintedAt, documentReadyAt, pdfWarnings, sourceUnchanged: externalSource ? true : undefined, scope: externalSource ? 'Actual read-only library PDF; checksum pre-read warms filesystem cache; fresh worker; canvas raster completion observation, not compositor/cold-filesystem/full-app click-to-paint; production stream core with fixture path/origin authorization' : 'Synthetic valid PDF with unreferenced padding stream; production range response implementation, fixture origin/path authorization; canvas raster completion, not compositor or representative scanned-book timing' };
      await fs.writeFile(path.join(directory, 'range-loading.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ...report, servedRequests: undefined, requestCount: servedRequests.length, reportPath: path.join(directory, 'range-loading.json') }));
      electron.app.quit();
      return;
    }
    if (process.env.BAGLIB_TEST_RASTER_INTEGRATION === '1') {
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      window.webContents.debugger.attach('1.3');
      const attachedWorkers = new Map();
      window.webContents.debugger.on('message', (_, method, parameters) => {
        if (method === 'Target.attachedToTarget') {
          attachedWorkers.set(parameters.sessionId, parameters.targetInfo);
          void window.webContents.debugger.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, parameters.sessionId).catch(() => undefined);
        } else if (method === 'Target.detachedFromTarget') attachedWorkers.delete(parameters.sessionId);
      });
      await window.webContents.debugger.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
      await new Promise(resolve => setTimeout(resolve, externalSource ? 4000 : 1800));
      await evaluate('window.pdfPerformance.setPage(5)');
      await until(`document.querySelector('[data-page-number="5"] canvas')?.dataset.pdfPaintSource==='worker' && Boolean(document.querySelector('[data-page-number="5"] canvas')?.dataset.pdfPaintedAt)`);
      const pixelsEqual = await evaluate(`(async()=>{const visible=document.querySelector('[data-page-number="5"] canvas');const expected=document.createElement('canvas');expected.width=visible.width;expected.height=visible.height;const context=expected.getContext('2d');context.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const page=await window.pdfTestDocument.getPage(5);await page.render({canvasContext:context,viewport:page.getViewport({scale:Number(visible.dataset.pdfRenderScale)})}).promise;return visible.toDataURL()===expected.toDataURL();})()`);
      assert.equal(pixelsEqual, true);
      if (externalSource) assert.equal(await fileSha256(externalSource), externalHash);
      await evaluate('window.pdfPerformance.setPage(10);window.pdfPerformance.setPage(11);window.pdfPerformance.setPage(12)');
      await until(`Boolean(document.querySelector('[data-page-number="12"] canvas')?.dataset.pdfPaintedAt)`);
      const rasterTargets = [...attachedWorkers.values()].filter(target => target.type === 'worker' && target.url.includes('pdf.raster.worker.mjs'));
      assert.ok(rasterTargets.some(target => target.url.includes('pdf.raster.worker.mjs')), 'Raster target not observed');
      await evaluate('window.pdfPerformance.close()');
      await until(`!document.querySelector('[data-pdf-performance]')`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const remaining = [...attachedWorkers.values()];
      assert.ok(rasterTargets.every(target => !remaining.some(current => current.targetId === target.targetId)), 'Document-scoped raster workers leaked after close');
      window.webContents.debugger.detach();
      await fs.writeFile(path.join(directory, 'raster-integration.json'), JSON.stringify({ pixelsEqual, workerPage: 5, finalPage: 12, documentWorkersDisposed: rasterTargets.length }, null, 2));
      console.log(`Native reader raster-worker integration pixels verified: ${directory}`);
      return;
    }
    if (process.env.BAGLIB_TEST_RASTER_WORKER === '1') {
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      const result = await evaluate(`new Promise((resolve,reject)=>{const visible=document.querySelector('canvas');const expected=visible.toDataURL();const scale=Number(visible.dataset.pdfRenderScale);const worker=new Worker(new URL('./vendor/pdfjs/pdf.raster.worker.mjs',location.href),{type:'module'});const started=performance.now();const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Raster worker timeout'));},30000);worker.onerror=error=>{clearTimeout(timeout);worker.terminate();reject(new Error(error.message));};worker.onmessage=event=>{const message=event.data;if(message.type==='ready')worker.postMessage({type:'render',id:1,page:1,scale,dpr:devicePixelRatio});else if(message.type==='error'){clearTimeout(timeout);worker.terminate();reject(new Error(message.error));}else if(message.type==='bitmap'){const canvas=document.createElement('canvas');canvas.width=message.bitmap.width;canvas.height=message.bitmap.height;canvas.getContext('2d').drawImage(message.bitmap,0,0);message.bitmap.close();clearTimeout(timeout);worker.postMessage({type:'dispose'});worker.terminate();resolve({pixelsEqual:canvas.toDataURL()===expected,width:canvas.width,height:canvas.height,workerMs:performance.now()-started});}};worker.postMessage({type:'init',url:${JSON.stringify(readerAssetUrl(filename))},assets:new URL('./vendor/pdfjs/',location.href).href});})`);
      assert.equal(result.pixelsEqual, true, 'Worker raster pixels differ from current renderer');
      if (externalSource) assert.equal(await fileSha256(externalSource), externalHash);
      await fs.writeFile(path.join(directory, 'raster-worker.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
      console.log(`Native isolated raster-worker pixels verified: ${directory}`);
      return;
    }
    if (process.env.BAGLIB_TEST_PROGRESSIVE === '1') {
      await until(`Boolean(document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      await new Promise(resolve => setTimeout(resolve, 300));
      await evaluate(`window.pdfTestDocument.getPage(1).then(page=>{const render=page.render.bind(page);page.render=options=>{const context=options.canvasContext;context.save();context.setTransform(1,0,0,1,0,0);context.fillStyle='white';context.fillRect(0,0,context.canvas.width,context.canvas.height);context.restore();const visible=document.querySelector('canvas');window.pdfRefinementProbe={targetIsVisible:visible===context.canvas,pixel:[...visible.getContext('2d').getImageData(1,1,1,1).data],previewAt:visible.dataset.pdfPreviewPaintedAt};return render(options);};window.pdfPerformance.setZoom(1.25);})`);
      await until(`Boolean(window.pdfRefinementProbe && document.querySelector('canvas')?.dataset.pdfPaintedAt)`);
      const probe = await evaluate('window.pdfRefinementProbe');
      assert.equal(probe.targetIsVisible, false, 'Refinement must not clear the visible preview');
      assert.deepEqual(probe.pixel, [255, 0, 0, 255]);
      assert.ok(Number(probe.previewAt) > 0);
      await fs.writeFile(path.join(directory, 'progressive.json'), JSON.stringify(probe, null, 2));
      console.log(`Native progressive preview remains visible during crisp redraw: ${directory}`);
      return;
    }
    if (process.env.BAGLIB_TEST_PERFORMANCE === '1') {
      const performanceSourceHash = await fileSha256(filename);
      await until(`document.querySelector('.textLayer')?.textContent.includes('PAGE 1')`);
      await new Promise(resolve => setTimeout(resolve, 1600));
      await evaluate('window.pdfPerformance.setPage(2)');
      await until(`document.querySelector('.textLayer')?.textContent.includes('PAGE 2')`);
      const preloadPaintSource = await evaluate(`document.querySelector('canvas').dataset.pdfPaintSource`);
      assert.equal(preloadPaintSource, 'cache');
      await evaluate('window.pdfPerformance.setPage(1)');
      await until(`document.querySelector('.textLayer')?.textContent.includes('PAGE 1')`);
      assert.equal(await evaluate(`document.querySelector('canvas').dataset.pdfPaintSource`), 'cache');
      const cacheDrawMs = await evaluate(`Number(document.querySelector('canvas').dataset.pdfCacheDrawMs)`);
      await evaluate(`window.pdfPerformance.setMode('scrolled')`);
      await until(`document.querySelectorAll('.pdf-page-holder').length === 60`);
      await new Promise(resolve => setTimeout(resolve, Number(process.env.BAGLIB_TEST_SCROLL_SETTLE ?? 1000)));
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Profiler.enable');
      await window.webContents.debugger.sendCommand('Profiler.start');
      const frames = await evaluate(`new Promise(resolve => {
        const container = document.querySelector('.pdf-native-viewer-container');
        const longTasks = [];
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration }))));
        observer.observe({ type: 'longtask', buffered: false });
        const deltas = []; let previous, step = 0, maxCanvases = 0;
        function frame(now) {
          if (previous !== undefined) deltas.push(now - previous); previous = now;
          container.scrollTop = (container.scrollHeight - container.clientHeight) * step / 90;
          maxCanvases = Math.max(maxCanvases, container.querySelectorAll('canvas').length);
          if (++step <= 90) requestAnimationFrame(frame);
          else { observer.disconnect(); resolve({ deltas, maxCanvases, longTasks }); }
        }
        requestAnimationFrame(frame);
      })`);
      await until(`document.querySelector('[data-page-number="60"] .textLayer')?.textContent.includes('PAGE 60')`);
      const profile = await window.webContents.debugger.sendCommand('Profiler.stop');
      await fs.writeFile(path.join(directory, 'scroll.cpuprofile'), JSON.stringify(profile.profile));
      window.webContents.debugger.detach();
      assert.ok(frames.maxCanvases <= 12, `Unbounded mounted canvases: ${frames.maxCanvases}`);
      assert.ok(await evaluate(`document.querySelectorAll('canvas').length <= 12`));
      assert.equal(await fileSha256(filename), performanceSourceHash);
      const report = { pages: 60, preloadPaintSource, cacheDrawMs, ...frames, scope: 'Synthetic native offscreen fixture; not a representative large-book or hardware benchmark' };
      await fs.writeFile(path.join(directory, 'performance.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`Native long-document cache/residency checks passed: ${directory}`);
      electron.app.quit();
      return;
    }
    if (process.env.BAGLIB_TEST_TOC === '1') {
      const toc = [{ title: 'المقدمة — Introduction', pageNumber: 1, children: [{ title: 'الفصل الثاني — Section 2', pageNumber: 2 }] }];
      for (const language of ['ar', 'en']) {
        if (await evaluate(`window.pdfLive.lang !== '${language}'`)) await evaluate('window.pdfLive.toggleLanguage()');
        await until(`window.pdfLive.lang === '${language}'`);
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfTocImportTitle')+'"]').click()`);
        await until('Boolean(document.querySelector("textarea"))');
        await evaluate(`(()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(JSON.stringify(toc))});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await evaluate(`[...document.querySelectorAll('button')].filter(button=>button.textContent.trim()===window.pdfLive.t('pdfTocImportAction')).at(-1).click()`);
        await until('!document.querySelector("textarea")');
        await evaluate(`(()=>{delete window.pdfTocApplied;[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.pdfLive.t('pdfTocApply')).click();})()`);
        await until('Boolean(window.pdfTocApplied)');
        assert.deepEqual(await evaluate('window.pdfTocApplied.toc'), toc);
        const destination = path.join(directory, `toc-${language}.json`);
        const downloaded = new Promise((resolve, reject) => window.webContents.session.once('will-download', (_event, item) => {
          item.setSavePath(destination);
          item.once('done', (_done, state) => state === 'completed' ? resolve() : reject(new Error(state)));
        }));
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfTocDownloadJson')+'"]').click()`);
        await downloaded;
        assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')), toc);
      }
      console.log(`Bilingual TOC import/apply/download checks passed: ${directory}`);
      electron.app.quit();
      return;
    }
    if (process.env.BAGLIB_TEST_IMMERSIVE === "1") {
      if (process.env.BAGLIB_TEST_ORGANIZER_OUTPUTS === '1') {
        const originalHash = await fileSha256(filename);
        const evidence = [];
        for (const language of ['ar', 'en']) {
          for (const [name, operation, payload, expected] of [
            ['apply', 'organize', { pages: [{ page: 2, rotation: 90 }, { page: 1 }, { blank: true }] }, [2, 1, 0]],
            ['extract', 'organize', { pages: [{ page: 2 }] }, [2]],
            ['split', 'split', { pages: [{ page: 2 }, { page: 1 }], pagesPerFile: 1 }, [2, 1]],
            ['split-groups', 'split', { pages: [{ page: 2 }, { page: 1 }, { blank: true }], pagesPerFile: 2 }, [2, 1, 0]],
          ]) {
            await evaluate(`(async()=>{const api=window.electronAPI.pdfEditor;const opened=await api.open({workId:'fixture-work'});if(!opened.ok)throw new Error(opened.error);window.outputSession=opened.data.id;const result=await api.start({sessionId:opened.data.id,operation:${JSON.stringify(operation)},language:${JSON.stringify(language)},payload:${JSON.stringify(payload)}});if(!result.ok)throw new Error(result.error);window.outputJob=result.data.id;})()`);
            await until(`window.electronAPI.pdfEditor.status(window.outputJob).then(result=>result.ok&&result.data.state!=='running')`);
            const result = await evaluate(`window.electronAPI.pdfEditor.status(window.outputJob)`);
            assert.equal(result.data.state, 'completed', JSON.stringify(result));
            const texts = [];
            const counts = [];
            for (let index = 0; index < result.data.outputs.length; index++) {
              const output = result.data.outputs[index];
              assert.equal(output.format, 'pdf');
              const target = path.join(directory, `${language}-${name}-${index}.pdf`);
              electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
              const saved = await evaluate(`window.electronAPI.pdfEditor.save({jobId:window.outputJob,outputIndex:${index},mode:'copy'})`);
              assert.equal(saved.ok, true, JSON.stringify(saved));
              const inspection = await inspectPdfFile(target, undefined, () => {});
              counts.push(inspection.totalPages);
              for (const page of inspection.pages) texts.push(page.text.includes('PAGE 2') ? 2 : page.text.includes('PAGE 1') ? 1 : 0);
              if (name === 'apply') assert.equal(inspection.pages[0].rotation, 90);
            }
            assert.deepEqual(texts, expected);
            if (name === 'split-groups') assert.deepEqual(counts, [2, 1]);
            assert.equal(await fileSha256(filename), originalHash);
            evidence.push({ language, operation: name, pages: texts, originalUnchanged: true });
            await evaluate(`window.electronAPI.pdfEditor.close(window.outputSession)`);
          }
        }
        await fs.writeFile(path.join(directory, 'organizer-outputs.json'), JSON.stringify(evidence, null, 2));
        console.log(`Organizer output files verified: ${directory}`);
        electron.app.quit(); return;
      }
      if (process.env.BAGLIB_TEST_PAGE_SELECTION === '1') {
        electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
        for (const direction of ['rtl', 'ltr']) {
          if (await evaluate('window.pdfLive.dir') !== direction) await evaluate('window.pdfLive.toggleDirection()');
          await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('stirlingModeOrganize')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
          await until(`!document.querySelector('[data-pdf-page-editor]').dataset.busy`);
          await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorResetAll')+'"]').click()`);
          await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorMoveRight')+'"]').click()`);
          await evaluate(`(()=>{const field=document.querySelector('input[aria-label="'+window.pdfLive.t('pdfPageRangeSelection')+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify('١')});field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
          await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfPageRangeSelection')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card][data-selected]').length === 1`);
          assert.equal(await evaluate(`document.querySelector('[data-page-editor-card]').hasAttribute('data-selected')`), true);
          window.webContents.invalidate();
          await new Promise(resolve => setTimeout(resolve, 500));
          await fs.writeFile(path.join(directory, `page-selection-${direction}.png`), (await window.capturePage()).toPNG());
          assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.pdfLive.t('pdfApplyPagePlan'))`), false);
          await until(`![...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.pdfLive.t('stirlingMergePdfs')).disabled`);
          await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.pdfLive.t('stirlingMergePdfs')).click()`);
          try { await until(`document.querySelectorAll('[data-page-editor-card]').length === 4`); }
          catch (error) { console.log(await evaluate(`document.body.innerText`)); throw error; }
          await evaluate(`document.querySelector('[data-pdf-page-editor] button[title="'+window.pdfLive.t('pdfUndo')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
          await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorRedo')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card]').length === 4`);
          await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorView')+'"]').click()`);
          await until(`document.querySelector('[data-pdf-page-editor]').parentElement.getAttribute('aria-hidden') === 'true'`);
          assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-pdf-page-editor]').parentElement).display`), 'none');
          await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('stirlingModeOrganize')+'"]').click()`);
          await until(`document.querySelector('[data-pdf-page-editor]').parentElement.getAttribute('aria-hidden') !== 'true'`);
          assert.equal(await evaluate(`document.querySelectorAll('[data-page-editor-card]').length`), 4);
          await evaluate(`document.querySelector('[data-pdf-page-editor] button[title="'+window.pdfLive.t('pdfUndo')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
          await evaluate(`document.querySelector('[data-pdf-page-editor] button[title="'+window.pdfLive.t('pdfPageEditorRedo')+'"]').click()`);
          await until(`document.querySelectorAll('[data-page-editor-card]').length === 4`);
          await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorResetAll')+'"]').click()`);
        }
        console.log(`Native reordered page selection passed RTL/LTR: ${directory}`);
        electron.app.quit(); return;
      }
      await until(`Boolean(document.querySelector('.pdf-viewport-container canvas'))`);
      await until(`document.querySelector('.pdf-viewport-container .textLayer')?.textContent.includes('PAGE 1')`);
      await until('window.pdfReaderPageCount === 2 && window.pdfReaderDocumentPages === 2');
      if (process.env.BAGLIB_TEST_WORKBENCH === '1') {
        const openMode = key => evaluate(`document.querySelector('button[title="'+window.pdfLive.t(${JSON.stringify(key)})+'"]').click()`);
        const noLoader = `!document.querySelector('[data-pdf-workstation]').textContent.includes(window.pdfLive.t('loadingNativePdf'))`;
        const viewerShown = `getComputedStyle(document.querySelector('.pdf-viewport-container')).visibility === 'visible' && Boolean(document.querySelector('.pdf-viewport-container canvas'))`;
        await until(`document.querySelectorAll('aside img[src^="data:image/jpeg"]').length === 2`);
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-pdf-workstation] .border-2.border-emerald-600'))`), false);
        await openMode('stirlingModeOrganize');
        await until(`document.querySelectorAll('[data-page-editor-card] img[src^="data:image/jpeg"]').length === 2`);
        assert.equal(await evaluate(noLoader), true);
        assert.equal(await evaluate(`Boolean(document.querySelector('.pdf-viewport-container canvas'))`), true);
        await fs.writeFile(path.join(directory, 'organize.png'), (await window.capturePage()).toPNG());
        await openMode('stirlingModeSecurity');
        assert.equal(await evaluate(noLoader), true);
        await until(viewerShown);
        await until(`Boolean(document.querySelector('[data-pdf-page-preview] img')) || document.querySelector('[data-pdf-workstation] [role="alert"]') !== null`);
        assert.equal(await evaluate(noLoader), true);
        const hasPreview = await evaluate(`Boolean(document.querySelector('[data-pdf-page-preview] img'))`);
        if (hasPreview) {
          const box = `document.querySelector('[data-pdf-page-preview] .border-emerald-600')`;
          assert.equal(await evaluate(`Boolean(${box})`), false);
          const area = await evaluate(`(()=>{const r=document.querySelector('[data-pdf-page-preview]').getBoundingClientRect();return {x:r.left,y:r.top}})()`);
          const send = (type, x, y) => window.webContents.sendInputEvent({ type, x: Math.round(area.x + x), y: Math.round(area.y + y), button: 'left', clickCount: 1 });
          send('mouseMove', 40, 40); send('mouseDown', 40, 40); send('mouseMove', 120, 90); send('mouseUp', 120, 90);
          await until(`Boolean(${box})`);
          await new Promise(resolve => setTimeout(resolve, 400));
          const drawn = await evaluate(`(()=>{const r=${box}.getBoundingClientRect(),p=document.querySelector('[data-pdf-page-preview]').getBoundingClientRect(),hit=document.elementFromPoint(p.left+5,p.top+5);return {width:r.width,height:r.height,left:r.left-p.left,top:r.top-p.top,overlayOnTop:Boolean(hit?.closest('[data-pdf-page-preview]'))}})()`);
          console.log('drawn box', JSON.stringify(drawn));
          assert.ok(drawn.width > 60 && drawn.height > 30 && drawn.overlayOnTop, JSON.stringify(drawn));
        }
        await fs.writeFile(path.join(directory, 'security.png'), (await window.capturePage()).toPNG());
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log(`Workbench checks passed (engine page image: ${hasPreview}): ${directory}`);
        electron.app.quit();
        return;
      }
      const annotationViewportWidth =await evaluate(`document.querySelector('.pdf-viewport-container').getBoundingClientRect().width`);
      await evaluate(`document.querySelector('[data-pdf-annotations-toggle]').click()`);
      await until(`Boolean(document.querySelector('[data-pdf-annotations-panel] [data-reader-annotations]'))`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-reader-annotations]').length`), 1);
      assert.equal(await evaluate(`(()=>{const tabs=document.querySelector('[data-annotation-tabs]');return tabs.scrollWidth<=tabs.clientWidth;})()`), true);
      assert.equal(await evaluate(`document.querySelectorAll('[data-pdf-tool-directory]').length`), 0);
      assert.equal(await evaluate(`document.querySelector('.pdf-viewport-container').getBoundingClientRect().width`), annotationViewportWidth);
      await fs.writeFile(path.join(directory, 'annotations.png'), (await window.capturePage()).toPNG());
      for (const query of ['تامل', 'not-a-matching-annotation', 'Reflection']) {
        await evaluate(`(()=>{const input=document.querySelector('[data-reader-annotations] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await until(`Boolean(document.querySelector('[data-reader-annotations] button[title="'+window.pdfLive.t('goToPage',{page:2})+'"]')) === ${query !== 'not-a-matching-annotation'}`);
      }
      await evaluate(`document.querySelector('[data-reader-annotations] button[title="'+window.pdfLive.t('goToPage',{page:2})+'"]').click()`);
      assert.equal(await evaluate('window.pdfAnnotationJump'), 2);
      await evaluate(`document.querySelector('[data-reader-annotations] button[aria-label="'+window.pdfLive.t('close')+'"]').click()`);
      await until(`!document.querySelector('[data-pdf-annotations-panel]') && Boolean(document.querySelector('[data-pdf-tool-directory]'))`);
      if (process.env.BAGLIB_TEST_ANNOTATIONS === '1') {
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log(`Native compact annotations checks passed: ${directory}`);
        electron.app.quit();
        return;
      }
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.canvasWrapper')).filter`), 'none');
      await evaluate('window.pdfLive.toggleTheme()');
      await until(`document.querySelector('[data-pdf-workstation]').dataset.workstationTheme === window.pdfLive.theme`);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.canvasWrapper')).filter`), 'none');
      await evaluate('window.pdfLive.toggleTheme()');
      await until(`document.querySelector('[data-pdf-workstation]').dataset.workstationTheme === window.pdfLive.theme`);
      await evaluate(`document.querySelector('[data-pdf-page-tint]').click()`);
      await until(`getComputedStyle(document.querySelector('.canvasWrapper')).filter !== 'none'`);
      await evaluate(`document.querySelector('[data-pdf-page-tint]').click()`);
      await until(`getComputedStyle(document.querySelector('.canvasWrapper')).filter === 'none'`);
      if (process.env.BAGLIB_TEST_SHOT === '1') {
        await until(`Boolean(document.querySelector('.pdf-native-viewer-container canvas')?.dataset.pdfPaintedAt)`);
        for (const [language, shots] of [['ar', 2], ['en', 2]]) {
          if (await evaluate('window.pdfLive.lang') !== language) await evaluate('window.pdfLive.toggleLanguage()');
          await until(`window.pdfLive.lang === '${language}'`);
          for (let shot = 0; shot < shots; shot++) {
            await new Promise(resolve => setTimeout(resolve, 700));
            const theme = await evaluate(`document.querySelector('[data-pdf-workstation]').dataset.workstationTheme`);
            await fs.writeFile(path.join(directory, `shot-${language}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
            await evaluate(`[...document.querySelectorAll('[data-reader-chrome="rail"] button')].at(-1).click()`);
          }
        }
        console.log(`Screenshots: ${directory}`);
        electron.app.quit();
        return;
      }
      if (process.env.BAGLIB_TEST_MUTATIONS === '1') {
        const requestedLanguage = process.env.BAGLIB_TEST_MUTATION_LANGUAGE;
        if (requestedLanguage && await evaluate('window.pdfLive.lang') !== requestedLanguage) {
          await evaluate('window.pdfLive.toggleLanguage()');
          await until(`window.pdfLive.lang === ${JSON.stringify(requestedLanguage)}`);
        }
        const sourceHash = await fileSha256(filename);
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('stirlingModeOrganize')+'"]').click()`);
        await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
        await until(`Boolean(document.querySelector('[data-pdf-page-editor]')) && document.querySelector('[data-pdf-page-editor]').dataset.busy !== 'true'`);
        await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorRotateRight')+'"]').click()`);
        await until(`document.querySelector('[data-page-editor-card]').textContent.includes('90')`);
        await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.pdfLive.t('pdfPageEditorApplyChanges')).click()`);
        await until(`document.querySelector('.pdf-native-viewer-container canvas')?.width > document.querySelector('.pdf-native-viewer-container canvas')?.height`);
        await until(`document.querySelector('.textLayer')?.textContent.includes('PAGE 1')`);
        await evaluate(`[...document.querySelectorAll('[data-pdf-tool-directory] button')].find(button=>button.textContent.includes(window.pdfLive.t('pdfSuiteEdit'))).click()`);
        await until(`Boolean(document.querySelector('[data-pdf-find]'))`);
        await until(`document.querySelector('[data-pdf-find-replace]')?.disabled === false`);
        for (const [selector,value] of [['[data-pdf-find]','PAGE 1'],['[data-pdf-replacement]','EDIT 1']]) {
          await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        }
        await until(`(()=>{const button=[...document.querySelectorAll('[data-pdf-find-replace] button')].find(button=>button.textContent.trim()===window.pdfLive.t('pdfApplyReplacements'));return button&&!button.disabled&&document.querySelector('[data-pdf-find]').value==='PAGE 1'&&document.querySelector('[data-pdf-replacement]').value==='EDIT 1'})()`);
        console.log('Replacement form ready:', await evaluate(`JSON.stringify({find:document.querySelector('[data-pdf-find]').value,replace:document.querySelector('[data-pdf-replacement]').value,disabled:document.querySelector('[data-pdf-find-replace]').disabled})`));
        await evaluate(`[...document.querySelectorAll('[data-pdf-find-replace] button')].find(button=>button.textContent.trim()===window.pdfLive.t('pdfApplyReplacements')).click()`);
        try { await until(`document.querySelector('.textLayer')?.textContent.includes('EDIT 1')`); }
        catch (error) {
          console.log('Replacement failure UI:', await evaluate(`document.body.innerText`));
          const jobsRoot = path.join(electron.app.getPath('userData'), 'pdf-editor', 'jobs');
          for (const item of await fs.readdir(jobsRoot, { recursive: true })) if (item.endsWith('.pdf')) {
            const inspection = await inspectPdfFile(path.join(jobsRoot, item), undefined, () => {}).catch(cause => ({ error: String(cause) }));
            console.log('Replacement staged file:', item, JSON.stringify(inspection));
          }
          throw error;
        }
        assert.equal(await evaluate(`document.querySelector('.pdf-native-viewer-container canvas').width > document.querySelector('.pdf-native-viewer-container canvas').height`), true);
        assert.equal(await fileSha256(filename), sourceHash);
        assert.equal(await evaluate(`document.querySelector('[data-pdf-save-state]').dataset.pdfSaveState`), 'staged');
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfSaveDocument')+'"]').click()`);
        await until(`document.querySelector('[data-pdf-save-state]').dataset.pdfSaveState === 'saved'`);
        assert.notEqual(await fileSha256(filename), sourceHash);
        const emergency = path.join(electron.app.getPath('userData'), 'emergency-copies');
        const copies = await fs.readdir(emergency);
        assert.equal(copies.length, 1);
        assert.equal(await fileSha256(path.join(emergency, copies[0])), sourceHash);
        await materialSave().restoreEmergency('fixture-work');
        window.webContents.send('pdf-editor:source-changed', { workId: 'fixture-work' });
        await until(`document.querySelector('.textLayer')?.textContent.includes('PAGE 1')`);
        await until(`(()=>{const canvas=document.querySelector('.pdf-native-viewer-container canvas');return canvas&&canvas.width<canvas.height;})()`);
        assert.equal(await fileSha256(filename), sourceHash);
        console.log('[restore-test] Saved edit restored through the single emergency copy; viewer reloaded the original');
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log(`Native organizer/apply/replacement staged preview checks passed: ${directory}`);
        electron.app.quit();
        return;
      }
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-reader-chrome="tools"]')).width`), '275px');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pdf-page-container')).borderRadius`), '6px');
      assert.equal(await evaluate(`document.querySelector('[data-pdf-document-page-count]').textContent.trim()`), await evaluate(`window.pdfLive.t('pdfDocumentPageCount',{count:2})`));
      await evaluate(`(()=>{for(const key of ['ttsReadAloud','autoScrollPlay','addBookmarkBtn']){const button=[...document.querySelectorAll('[data-pdf-workstation] header button')].find(button=>button.getAttribute('aria-label')===window.pdfLive.t(key));if(!button)throw new Error('Missing reading action '+key);button.click();}if(!window.pdfReadAloudInvoked||!window.pdfAutoScrollInvoked||!window.pdfBookmarkInvoked)throw new Error('Reader callback not invoked');})()`);
      await until(`(()=>{const canvas=document.querySelector('.pdf-viewport-container canvas');if(!canvas?.width||!canvas?.height)return false;const pixel=canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data;return pixel[0]>240&&pixel[1]<10&&pixel[2]<10&&pixel[3]===255})()`);
      const mountToPaintObservationMs = await evaluate('performance.now() - window.pdfFixtureMountStartedAt');
      await fs.writeFile(path.join(directory, 'paint-timing.json'), JSON.stringify({ mountToPaintObservationMs, scope: 'Disposable two-page fixture; includes polling and text-layer wait; not user-click first paint or representative book latency', sourceBytes: (await fs.stat(filename)).size }));
      console.log(JSON.stringify({ mountToPaintObservationMs }));
      window.webContents.debugger.attach("1.3");
      await window.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      for (const direction of ["rtl", "ltr"]) {
        const language = direction === 'rtl' ? 'ar' : 'en';
        if (await evaluate('window.pdfLive.lang') !== language) await evaluate('window.pdfLive.toggleLanguage()');
        await until(`window.pdfLive.lang === '${language}'`);
        await evaluate(`(()=>{const trigger=document.querySelector('button[title="'+window.pdfLive.t('pdfCompactToolsBtn')+'"]');trigger.focus();trigger.click();})()`);
        await until(`document.querySelector('[data-pdf-workstation]').dataset.readerOverlay === 'quick-tools'`);
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        await until(`!document.querySelector('[data-pdf-workstation]').hasAttribute('data-reader-overlay')`);
        assert.equal(await evaluate(`document.activeElement?.getAttribute('title') === window.pdfLive.t('pdfCompactToolsBtn')`), true);
        if (await evaluate("window.pdfLive.dir") !== direction) await evaluate("window.pdfLive.toggleDirection()");
        await until(`document.querySelector('[data-pdf-workstation]').dir === '${direction}'`);
        for (const [zone, label, selector] of [
          ['top', 'pdfChromeTop', '[data-pdf-workstation] > header'],
          ['rail', 'pdfChromeRail', '[data-reader-chrome="rail"]'],
          ['library', 'pdfChromeLibrary', '[data-reader-chrome="library"]'],
          ['tools', 'pdfDirectoryTitle', '[data-reader-chrome="tools"]'],
          ['bottom', 'pdfChromeBottom', '[data-pdf-bottom-navigation]'],
        ]) {
          await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfChromeHide',{region:window.pdfLive.t('${label}')})+'"]').click()`);
          await until(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).display === 'none'`);
          await evaluate(`(()=>{const menu=document.querySelector('[data-reader-recovery]');menu.open=true;[...menu.querySelectorAll('button')].find(button=>button.textContent===window.pdfLive.t('${label}')).click();})()`);
          await until(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).display !== 'none'`);
        }
        for (const page of [2, 1]) {
          await evaluate(`(()=>{const field=document.querySelector('[data-pdf-bottom-navigation] input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'${page}');field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
          await until(`document.querySelector('.pdf-viewport-container .textLayer')?.textContent.includes('PAGE ${page}')`);
          await until(`(()=>{const canvas=document.querySelector('.pdf-viewport-container canvas');const pixel=canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data;return ${page === 2 ? 'pixel[1]>240&&pixel[0]<10' : 'pixel[0]>240&&pixel[1]<10'}&&pixel[2]<10&&pixel[3]===255})()`);
        }
        if (await evaluate("window.pdfLive.dir") !== direction) await evaluate("window.pdfLive.toggleDirection()");
        await until(`document.querySelector('[data-pdf-workstation]').dir === '${direction}'`);
        for (const [label, theme] of [["pdfThemeLight", "light"], ["pdfThemeSepia", "sepia"], ["pdfThemeDark", "dark"]]) {
          await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('${label}')+'"]').click()`);
          await until(`document.querySelector('[data-pdf-workstation]').dataset.workstationTheme === '${theme}'`);
          const directoryContrast = await evaluate(`(()=>{const directory=document.querySelector('[data-pdf-tool-directory]');const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(value=>value/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};const ratio=(foreground,background)=>{const values=[luminance(foreground),luminance(background)].sort((a,b)=>a-b);return(values[1]+0.05)/(values[0]+0.05);};return{input:ratio(getComputedStyle(directory.querySelector('input')).color,getComputedStyle(directory.querySelector('label')).backgroundColor),heading:ratio(getComputedStyle(directory.querySelector('h4')).color,getComputedStyle(document.querySelector('[data-reader-chrome="tools"]')).backgroundColor)};})()`);
          assert.ok(directoryContrast.input >= 4.5, `${theme}/${direction} input contrast ${directoryContrast.input}`);
          assert.ok(directoryContrast.heading >= 4.5, `${theme}/${direction} heading contrast ${directoryContrast.heading}`);
          if (theme === "sepia") {
            assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-pdf-workstation]')).backgroundColor`), "rgb(239, 236, 228)");
            assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-reader-chrome="tools"]')).color`), "rgb(44, 34, 26)");
          }
        }
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('stirlingModeOrganize')+'"]').click()`);
        await until(`Boolean(document.querySelector('[data-pdf-page-editor]'))`);
        assert.equal(await evaluate(`document.querySelectorAll('[data-page-editor-card]').length`), 2);
        await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfThemeLight')+'"]').click()`);
        await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfThemeSepia')+'"]').click()`);
        await until(`document.querySelector('[data-pdf-page-editor]').dataset.editorTheme === 'sepia'`);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-pdf-page-editor]')).backgroundColor`), 'rgb(239, 236, 228)');
        await until(`getComputedStyle(document.querySelector('[data-page-editor-card]')).backgroundColor === 'rgb(248, 246, 240)'`);
        window.webContents.focus();
        await evaluate(`document.querySelector('[data-page-editor-divider]').focus()`);
        await until(`Boolean(document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorInsertBlankPageHere')+'"]'))`);
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorInsertBlankPageHere')+'"]').click()`);
        await until(`document.querySelectorAll('[data-page-editor-card]').length === 3`);
        await evaluate(`document.querySelector('[data-pdf-page-editor] button[title="'+window.pdfLive.t('pdfUndo')+'"]').click()`);
        await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
        await evaluate(`document.querySelector('[data-pdf-page-editor] button[title="'+window.pdfLive.t('pdfPageEditorRedo')+'"]').click()`);
        await until(`document.querySelectorAll('[data-page-editor-card]').length === 3`);
        await evaluate(`document.querySelector('button[title="'+window.pdfLive.t('pdfPageEditorResetAll')+'"]').click()`);
        console.log(await evaluate(`JSON.stringify({organizerReset:window.pdfLive.lang,total:document.querySelector('[data-pdf-page-editor]').dataset.totalPages,busy:document.querySelector('[data-pdf-page-editor]').dataset.busy,cards:document.querySelectorAll('[data-page-editor-card]').length})`));
        await until(`document.querySelectorAll('[data-page-editor-card]').length === 2`);
        await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorRotateRight')+'"]').focus()`);
        await until(`getComputedStyle(document.querySelector('[data-page-editor-actions]')).opacity === '1'`);
        await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorRotateRight')+'"]').click()`);
        await until(`document.querySelector('[data-page-editor-card]').textContent.includes('90')`);
        await evaluate(`document.querySelector('[data-page-editor-card] button[title="'+window.pdfLive.t('pdfPageEditorView')+'"]').click()`);
        await until(`!document.querySelector('[data-pdf-page-editor]') && document.querySelector('.textLayer')?.textContent.includes('PAGE 1')`);
        await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfThemeDark')+'"]').click()`);
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "F11" });
        await until(`document.querySelector('[data-pdf-workstation]').hasAttribute('data-immersive')`);
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        await until(`!document.querySelector('[data-pdf-workstation]').hasAttribute('data-immersive')`);
        await evaluate(`(()=>{const button=document.querySelector('button[aria-label="'+window.pdfLive.t('zenModePurePage')+'"]');button.focus();button.click();})()`);
        await until(`document.querySelector('[data-pdf-workstation]').hasAttribute('data-immersive')`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        console.log(await evaluate(`JSON.stringify({sheets:[...document.styleSheets].map(s=>s.href),matches:document.querySelector('[data-pdf-workstation] > header').matches('[data-pdf-workstation][data-immersive] > header'),position:getComputedStyle(document.querySelector('[data-pdf-workstation]')).position,media:matchMedia('(prefers-reduced-motion: reduce)').matches})`));
        console.log(await evaluate(`JSON.stringify([...document.styleSheets[0].cssRules].filter(r=>r.selectorText&&r.style?.opacity&&document.querySelector('[data-pdf-workstation] > header').matches(r.selectorText)).map(r=>r.cssText))`));
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-pdf-workstation] > header')).opacity`), "0", await evaluate(`JSON.stringify({direction:document.querySelector('[data-pdf-workstation]').dir,edge:document.querySelector('[data-pdf-workstation]').dataset.revealedEdge,focus:document.activeElement?.tagName,pins:document.querySelector('[data-pdf-workstation]').dataset.pinnedChrome})`));
        window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 10 });
        const capture = await window.webContents.debugger.sendCommand("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
        await fs.writeFile(path.join(directory, `immersive-${direction}.png`), Buffer.from(capture.data, "base64"));
        await until(`document.querySelector('[data-pdf-workstation]').dataset.revealedEdge === 'top'`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-pdf-workstation] > header')).opacity`), "1");
        await evaluate(`document.querySelector('button[aria-label="'+window.pdfLive.t('pdfChromeHide',{region:window.pdfLive.t('pdfChromeTop')})+'"]').click()`);
        await until(`getComputedStyle(document.querySelector('[data-pdf-workstation] > header')).display === 'none'`);
        window.webContents.focus();
        await evaluate(`document.querySelector('[data-reader-recovery] summary').focus()`);
        assert.equal(await evaluate(`document.activeElement?.tagName`), 'SUMMARY');
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        await until(`document.querySelector('[data-reader-recovery]').open`);
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        await until(`getComputedStyle(document.querySelector('[data-pdf-workstation] > header')).display !== 'none'`);
        for (const [edge, x, y, selector] of [
          ["start", direction === "rtl" ? 1270 : 10, 500, '[data-reader-chrome="rail"]'],
          ["end", direction === "rtl" ? 10 : 1270, 500, '[data-reader-chrome="tools"]'],
          ["bottom", 600, 990, "[data-pdf-bottom-navigation]"]
        ]) {
          window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 500 });
          await new Promise((resolve) => setTimeout(resolve, 450));
          window.webContents.sendInputEvent({ type: "mouseMove", x, y });
          await until(`document.querySelector('[data-pdf-workstation]').dataset.revealedEdge === '${edge}'`);
          assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity`), "1");
        }
        await evaluate(`document.querySelector('[data-reader-chrome="tools"] button[aria-pressed]').click()`);
        window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 500 });
        await new Promise((resolve) => setTimeout(resolve, 450));
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-reader-chrome="tools"]')).opacity`), "1");
        await evaluate(`document.querySelector('[data-reader-chrome="tools"] button[aria-pressed]').click()`);
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        await until(`!document.querySelector('[data-pdf-workstation]').hasAttribute('data-immersive')`);
      }
      await fs.writeFile(path.join(directory, "immersive-results.json"), JSON.stringify({ passed: true, renderedPdfTextAndPixels: true, pageEntryViaDomInput: true, fiveRegionCollapseRecoveryViaDomClick: true, directions: ["rtl", "ltr"], themesViaDomClick: ["dark", "light", "sepia"], sepiaComputedColors: true, reducedMotion: true, keyboardAndAllEdges: true, toolsPinViaDomClick: true }));
      console.log(`Immersive native checks passed: ${directory}`);
      electron.app.quit();
      return;
    }
    await until('document.querySelector("[data-pdf-workstation] header p").textContent.includes("source.pdf")');
    await until('Boolean(document.querySelector("[data-pdf-page-preview] img"))');
    await evaluate(`(async()=>{const api=window.electronAPI.pdfEditor;const opened=await api.open({workId:'fixture-work'});window.pdfSession=opened.data;const started=await api.start({sessionId:opened.data.id,operation:'inspect',language:'ar'});window.pdfJob=started.data.id})()`);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(window.pdfJob);return result.ok&&result.data.state==='completed'})()`);
    assert.equal(await evaluate(`(async()=>{const result=await window.electronAPI.pdfEditor.status(window.pdfJob);return result.data.inspection.totalPages})()`), 2);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`document.querySelector('[data-pdf-workstation]').textContent.includes(window.pdfLive.t('pdfSuitePageCount',{count:2}))`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuitePreview'))el.click()})`);
    await until(`Boolean(document.querySelector('[data-pdf-page-preview] img'))`);
    const setTool = async (value) => evaluate(`(()=>{const el=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await setTool("edit-content");
    await evaluate(`document.querySelector('[data-pdf-page-preview] button[title]').click()`);
    await until(`Boolean(document.querySelector('[data-pdf-inline-text]'))`);
    await evaluate(`(()=>{const el=document.querySelector('[data-pdf-inline-text]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'NOTE');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await until(`document.querySelector('[data-pdf-inline-editor] button')?.disabled === false`);
    await evaluate(`document.querySelector('[data-pdf-inline-editor] button').click()`);
    await until(`document.querySelector('[data-pdf-workstation]').textContent.includes(window.pdfLive.t('pdfSaveOutput',{name:'document.pdf'}))`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`document.querySelector('[data-pdf-workstation] details').textContent.includes('NOTE')`);
    assert.equal(await evaluate(`document.querySelector('[data-pdf-find-replace] button:last-child').disabled`), true);
    const fillReplacement = async (selector, value, index = 0) => evaluate(`(()=>{const el=document.querySelectorAll(${JSON.stringify(selector)})[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await fillReplacement("[data-pdf-find]", "NOTE");
    await fillReplacement("[data-pdf-replacement]", "TEXT");
    await evaluate(`document.querySelectorAll('[data-pdf-find-replace] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfAddReplacement'))el.click()})`);
    await fillReplacement("[data-pdf-find]", "\u0627\u0644\u0639\u064E\u0631\u064E\u0628\u0650\u064A\u064E\u0651\u0629 ABC", 1);
    await fillReplacement("[data-pdf-replacement]", "Mixed \u0628\u062D\u062B 123", 1);
    await evaluate(`document.querySelector('[data-pdf-find-replace] input[type=checkbox]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-pdf-find-replace] input[type=checkbox]').checked`), true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-pdf-find], [data-pdf-replacement]')).every(el=>el.dir==='auto')`), true);
    await evaluate(`document.querySelectorAll('[data-pdf-find-replace] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfApplyReplacements'))el.click()})`);
    await until(`!document.querySelector('[data-pdf-workstation] details') && !document.querySelector('[data-pdf-page-preview]')`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`Boolean(document.querySelector('[data-pdf-workstation] details')?.textContent.includes('TEXT'))`);
    assert.equal(await evaluate(`document.querySelector('[data-pdf-workstation] details').textContent.includes('NOTE')`), false);
    for (const language of ["ar", "en"]) {
      await evaluate(`if(window.pdfLive.lang!==${JSON.stringify(language)})window.pdfLive.toggleLanguage()`);
      for (const width of [480, 1280]) {
        window.setContentSize(width, 1e3);
        for (const tool of ["edit-content", "cloud", "sign", "review"]) {
          await setTool(tool);
          await new Promise((resolve) => setTimeout(resolve, 120));
          assert.equal(await evaluate(`document.querySelector('[data-pdf-workstation]').dir`), language === "ar" ? "rtl" : "ltr");
          assert.ok(await evaluate(`(()=>{const el=document.querySelector('[data-pdf-workstation]');return el.scrollWidth<=el.clientWidth+1})()`));
          await fs.writeFile(path.join(directory, `${tool}-${language}-${width}.png`), (await window.webContents.capturePage(void 0, { stayHidden: true, stayAwake: true })).toPNG());
        }
      }
    }
    const configured = await evaluate(`window.electronAPI.pdfCloud.configure('google',{clientId:'fixture.apps.googleusercontent.com'})`);
    assert.equal(configured.ok, true);
    assert.equal(configured.data.connected, false);
    assert.equal(await evaluate(`(async()=>{const result=await window.electronAPI.pdfCloud.status('google');return JSON.stringify(result).includes('tokens')})()`), false);
    const summary = await evaluate(`window.electronAPI.pdfCollaboration.ask(window.pdfSession.id,'Chapter digest','en',false,undefined,{mode:'chapters',fromPage:2,toPage:2})`);
    assert.equal(summary.ok, true);
    assert.equal(summary.data.citations[0].page, 2);
    const originalHash = await fileSha256(filename);
    const staged = await evaluate(`window.electronAPI.pdfEditor.start({sessionId:window.pdfSession.id,operation:'organize',language:'en',payload:{pages:[{page:2,rotation:90},{page:1}]}})`);
    assert.equal(staged.ok, true);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(${JSON.stringify(staged.data.id)});return result.data.state!=='running'})()`);
    assert.equal(await fileSha256(filename), originalHash);
    const edition = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(staged.data.id)},mode:'edition',title:'Research \u0628\u062D\u062B 2'})`);
    assert.equal(edition.ok, true);
    assert.equal(db2.prepare("SELECT COUNT(*) n FROM edition WHERE work_id=?").get("fixture-work").n, 2);
    const availableSources = await evaluate(`window.electronAPI.pdfEditor.sources('fixture-work')`);
    assert.equal(availableSources.ok, true);
    assert.equal(availableSources.data.length, 2);
    assert.ok(availableSources.data.every((source) => !source.filename.includes(path.sep)));
    const publication = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(staged.data.id)},mode:'overwrite'})`);
    assert.equal(publication.ok, true);
    assert.equal(await fileSha256(publication.data.backup), originalHash);
    assert.notEqual(await fileSha256(filename), originalHash);
    await evaluate(`window.pdfOpenBlank()`);
    await until(`document.querySelector('[data-pdf-workstation] header p').textContent==='document.pdf'`);
    const blankSession = await evaluate(`window.electronAPI.pdfEditor.blankSession()`);
    assert.equal(blankSession.ok, true);
    assert.equal(blankSession.data.workId, null);
    const created = await evaluate(`window.electronAPI.pdfEditor.start({sessionId:${JSON.stringify(blankSession.data.id)},operation:'create',language:'ar',payload:{pages:[{text:'Research \u0628\u062D\u062B'}]}})`);
    assert.equal(created.ok, true);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(${JSON.stringify(created.data.id)});return result.data.state!=='running'})()`);
    const catalogued = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(created.data.id)},mode:'new-work',title:'Standalone PDF \u0628\u062D\u062B'})`);
    assert.equal(catalogued.ok, true);
    assert.ok(catalogued.data.session.workId);
    assert.equal(db2.prepare("SELECT title FROM work WHERE id=?").get(catalogued.data.session.workId).title, "Standalone PDF \u0628\u062D\u062B");
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, "results.json"), JSON.stringify({ passed: true, parserAndIpc: true, findReplaceControlsAndRealIpc: true, mixedScriptInputs: true, bilingualWidths: [480, 1280], nativeEncryptedSetup: true, browserLogin: false, rendererErrors: errors }, null, 2));
    console.log(`PDF workstation native checks passed: ${directory}`);
  } catch (error) {
    await fs.writeFile(path.join(directory, "failure.json"), JSON.stringify({ error: String(error), text: await evaluate("document.body.innerText").catch(() => ""), rendererErrors: errors }, null, 2));
    console.error(error);
    electron.app.exit(1);
    return;
  } finally {
    window.destroy();
    await shutdownPdfViewCaches();
    closeDatabase();
    electron.app.quit();
  }
  electron.app.quit();
});

