import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { registerPdfEditorIpc } from '../../src/main/ipc/pdf-editor';
import { makePagePdf } from '../../tests/helpers/pdf-pages';
import { fileSha256 } from '../../src/main/services/pdf-editor/source';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
const root = process.cwd(), directory = process.env.BAGLIB_PDF_LIVE_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile')); app.setAppPath(root);
app.whenReady().then(async () => {
  const db = getDatabase(); runMigrations(db, migrations);
  const filename = path.join(directory, 'source.pdf'); await fs.writeFile(filename, makePagePdf(2, Buffer.alloc(0)));
  const works = new SqliteWorkRepository(db); works.addBook({ id: 'fixture-work', title: 'بحث — Research', author: '', workType: 'book', bookType: 'digital', filePath: filename, digitalFormat: 'PDF' });
  for (const [channel, action] of Object.entries({ 'library:get-all-books': () => works.getAllWorks(), 'library:get-all-notes': () => [], 'categories:get-tree': () => [], 'tags:get-all': () => [] })) ipcMain.handle(channel, action);
  registerPdfEditorIpc();
  // Exercise the real extraction/IPC/citation boundary with a named test double,
  // never a production fallback or claim of live-model inference.
  const provider = AIProviderService.getInstance();
  provider.generateChatCompletion = async request => {
    const context = JSON.parse(request.userPrompt);
    assert.equal(context.task, 'chapters');
    const evidence = context.pages[0];
    return JSON.stringify({ answer: 'Disposable chapter-summary integration fixture', abstained: false, citations: [{ page: evidence.page, quote: evidence.text.trim().slice(0, 30) }] });
  };
  const window = new BrowserWindow({ width: 1280, height: 1000, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(root, 'dist/preload/index.js') } });
  const errors: string[] = []; window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  const until = async (code: string) => { for (let i = 0; i < 200; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out ${code}`); };
  try {
    await window.loadFile(path.join(directory, 'index.html')); await until('Boolean(window.pdfLive && document.querySelector("[data-pdf-workstation]"))');
    await until('document.querySelector("[data-pdf-workstation] header p").textContent.includes("source.pdf")');
    await evaluate(`(async()=>{const api=window.electronAPI.pdfEditor;const opened=await api.open({workId:'fixture-work'});window.pdfSession=opened.data;const started=await api.start({sessionId:opened.data.id,operation:'inspect',language:'ar'});window.pdfJob=started.data.id})()`);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(window.pdfJob);return result.ok&&result.data.state==='completed'})()`);
    assert.equal(await evaluate(`(async()=>{const result=await window.electronAPI.pdfEditor.status(window.pdfJob);return result.data.inspection.totalPages})()`), 2);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`document.querySelector('[data-pdf-workstation]').textContent.includes(window.pdfLive.t('pdfSuitePageCount',{count:2}))`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuitePreview'))el.click()})`);
    await until(`Boolean(document.querySelector('[data-pdf-page-preview] img'))`);
    const setTool = async (value: string) => evaluate(`(()=>{const el=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await setTool('edit-content');
    await evaluate(`document.querySelector('[data-pdf-page-preview] button[title]').click()`);
    await until(`Boolean(document.querySelector('[data-pdf-inline-text]'))`);
    await evaluate(`(()=>{const el=document.querySelector('[data-pdf-inline-text]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'NOTE');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await evaluate(`document.querySelector('[data-pdf-inline-editor] button').click()`);
    await until(`document.querySelector('[data-pdf-workstation]').textContent.includes(window.pdfLive.t('pdfSaveOutput',{name:'document.pdf'}))`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`document.querySelector('[data-pdf-workstation] details').textContent.includes('NOTE')`);
    // Use the visible Find/Replace controls and the real staged-job IPC path.
    assert.equal(await evaluate(`document.querySelector('[data-pdf-find-replace] button:last-child').disabled`), true);
    const fillReplacement = async (selector: string, value: string, index = 0) => evaluate(`(()=>{const el=document.querySelectorAll(${JSON.stringify(selector)})[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await fillReplacement('[data-pdf-find]', 'NOTE');
    await fillReplacement('[data-pdf-replacement]', 'TEXT');
    await evaluate(`document.querySelectorAll('[data-pdf-find-replace] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfAddReplacement'))el.click()})`);
    await fillReplacement('[data-pdf-find]', 'العَرَبِيَّة ABC', 1);
    await fillReplacement('[data-pdf-replacement]', 'Mixed بحث 123', 1);
    await evaluate(`document.querySelector('[data-pdf-find-replace] input[type=checkbox]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-pdf-find-replace] input[type=checkbox]').checked`), true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-pdf-find], [data-pdf-replacement]')).every(el=>el.dir==='auto')`), true);
    await evaluate(`document.querySelectorAll('[data-pdf-find-replace] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfApplyReplacements'))el.click()})`);
    await until(`!document.querySelector('[data-pdf-workstation] details') && !document.querySelector('[data-pdf-page-preview]')`);
    await evaluate(`document.querySelectorAll('[data-pdf-workstation] button').forEach(el=>{if(el.textContent===window.pdfLive.t('pdfSuiteInspect'))el.click()})`);
    await until(`Boolean(document.querySelector('[data-pdf-workstation] details')?.textContent.includes('TEXT'))`);
    assert.equal(await evaluate(`document.querySelector('[data-pdf-workstation] details').textContent.includes('NOTE')`), false);
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.pdfLive.lang!==${JSON.stringify(language)})window.pdfLive.toggleLanguage()`);
      for (const width of [480, 1280]) {
        window.setContentSize(width, 1000);
        for (const tool of ['edit-content', 'cloud', 'sign', 'review']) {
          await setTool(tool); await new Promise(resolve => setTimeout(resolve, 120));
          assert.equal(await evaluate(`document.querySelector('[data-pdf-workstation]').dir`), language === 'ar' ? 'rtl' : 'ltr');
          assert.ok(await evaluate(`(()=>{const el=document.querySelector('[data-pdf-workstation]');return el.scrollWidth<=el.clientWidth+1})()`));
          await fs.writeFile(path.join(directory, `${tool}-${language}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        }
      }
    }
    // Native DPAPI encryption is exercised without any browser or account credentials.
    const configured = await evaluate(`window.electronAPI.pdfCloud.configure('google',{clientId:'fixture.apps.googleusercontent.com'})`);
    assert.equal(configured.ok, true); assert.equal(configured.data.connected, false);
    assert.equal(await evaluate(`(async()=>{const result=await window.electronAPI.pdfCloud.status('google');return JSON.stringify(result).includes('tokens')})()`), false);
    const summary = await evaluate(`window.electronAPI.pdfCollaboration.ask(window.pdfSession.id,'Chapter digest','en',false,undefined,{mode:'chapters',fromPage:2,toPage:2})`);
    assert.equal(summary.ok, true); assert.equal(summary.data.citations[0].page, 2);
    const originalHash = await fileSha256(filename);
    const staged = await evaluate(`window.electronAPI.pdfEditor.start({sessionId:window.pdfSession.id,operation:'organize',language:'en',payload:{pages:[{page:2,rotation:90},{page:1}]}})`);
    assert.equal(staged.ok, true);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(${JSON.stringify(staged.data.id)});return result.data.state!=='running'})()`);
    assert.equal(await fileSha256(filename), originalHash);
    const edition = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(staged.data.id)},mode:'edition',title:'Research بحث 2'})`);
    assert.equal(edition.ok, true);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM edition WHERE work_id=?').get('fixture-work') as { n: number }).n, 2);
    const availableSources = await evaluate(`window.electronAPI.pdfEditor.sources('fixture-work')`);
    assert.equal(availableSources.ok, true); assert.equal(availableSources.data.length, 2);
    assert.ok(availableSources.data.every((source: { filename: string }) => !source.filename.includes(path.sep)));
    const publication = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(staged.data.id)},mode:'overwrite'})`);
    assert.equal(publication.ok, true); assert.equal(await fileSha256(publication.data.backup), originalHash); assert.notEqual(await fileSha256(filename), originalHash);
    await evaluate(`window.pdfOpenBlank()`);
    await until(`document.querySelector('[data-pdf-workstation] header p').textContent==='document.pdf'`);
    const blankSession = await evaluate(`window.electronAPI.pdfEditor.blankSession()`);
    assert.equal(blankSession.ok, true); assert.equal(blankSession.data.workId, null);
    const created = await evaluate(`window.electronAPI.pdfEditor.start({sessionId:${JSON.stringify(blankSession.data.id)},operation:'create',language:'ar',payload:{pages:[{text:'Research بحث'}]}})`);
    assert.equal(created.ok, true);
    await until(`(async()=>{const result=await window.electronAPI.pdfEditor.status(${JSON.stringify(created.data.id)});return result.data.state!=='running'})()`);
    const catalogued = await evaluate(`window.electronAPI.pdfEditor.save({jobId:${JSON.stringify(created.data.id)},mode:'new-work',title:'Standalone PDF بحث'})`);
    assert.equal(catalogued.ok, true); assert.ok(catalogued.data.session.workId);
    assert.equal((db.prepare('SELECT title FROM work WHERE id=?').get(catalogued.data.session.workId) as { title: string }).title, 'Standalone PDF بحث');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, parserAndIpc: true, findReplaceControlsAndRealIpc: true, mixedScriptInputs: true, bilingualWidths: [480, 1280], nativeEncryptedSetup: true, browserLogin: false, rendererErrors: errors }, null, 2));
    console.log(`PDF workstation native checks passed: ${directory}`);
  } catch (error) { console.error(error); app.exit(1); return; }
  finally { window.destroy(); closeDatabase(); }
  app.quit();
});
