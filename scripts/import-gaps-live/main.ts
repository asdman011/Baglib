import { registerLectureIpc } from '../../src/main/ipc/lectures';
﻿import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setupDigitalIPC } from '../../src/main/ipc/digital';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { translations } from '../../src/renderer/translations';
import { confirmedQuitCleanup } from '../../src/main/services/quit-cleanup';
import { discoverImportFiles } from '../../src/main/services/digital/import-files';

const directory = process.env.BAGLIB_KEY48_DIRECTORY!;
const profile = process.env.BAGLIB_KEY48_PROFILE!;
const evidence = process.env.BAGLIB_KEY48_EVIDENCE!;
const lang = process.env.BAGLIB_KEY48_LANG as 'ar' | 'en';
const mode = process.env.BAGLIB_KEY48_MODE!;
const labels = translations[lang];
app.setPath('userData', profile);
app.setAppPath(path.resolve('.'));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const database = getDatabase(); runMigrations(database, migrations);
  const repository = new SqliteWorkRepository(database);
  database.transaction(() => {
    for (let index = 0; index < 1000; index++) repository.addBook({title: `Archive manuscript catalog ${index}`,author:'Library Writer',bookType:'physical'});
  })();
  setupDigitalIPC();
  registerLectureIpc();
  ipcMain.handle('settings:get', () => null);
  ipcMain.handle('settings:set', () => true);
  ipcMain.handle('library:get-all-books', () => repository.getAllWorks());
  for (const channel of ['library:get-all-notes','categories:get-tree','tags:get-all']) ipcMain.handle(channel, () => []);
  const win = new BrowserWindow({show:false,width:1280,height:950,webPreferences:{preload:path.join(directory,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});
  const errors: string[]=[];
  win.webContents.on('console-message', (_event,level,message) => {if(level>=3)errors.push(message);});
  const evaluate = (code: string) => win.webContents.executeJavaScript(code,true);
  const until = async (code: string) => {
    const deadline=Date.now()+300000;
    while (Date.now()<deadline) {try {if(await evaluate(code))return;}catch{/* Mounting */}await pause(80);}
    throw Error('Timeout '+code+'\n'+await evaluate('document.body.innerText.slice(-2500)'));
  };
  const click = (label: string) => evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)})?.click()`);
  const shot = async (name: string) => {await pause(180);await fs.writeFile(path.join(evidence,`${lang}-${mode}-${name}.png`),(await win.webContents.capturePage()).toPNG());};
  await win.loadFile(path.join(directory,'index.html'));
  await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(lang)})`);await win.reload();
  await until('!!window.importTest');win.show();
  await until(`window.importTest.workspace.lang===${JSON.stringify(lang)}`);
  assert.equal(await evaluate('window.importTest.workspace.dir'),lang==='ar'?'rtl':'ltr');
  const singleton=path.join(profile,'single.txt');await fs.writeFile(singleton,'One file direct drop content');
  const single = await evaluate(`window.importTest.routeBookDrop([${JSON.stringify(singleton)}],window.electronAPI)`);
  assert.equal(single.kind,'single');assert.equal(single.result.success,true);assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'),false);
  const corpus=path.join(directory,'books');const discovered=await discoverImportFiles([corpus]);
  assert.ok(discovered.files.length>=300);assert.ok(discovered.files.some(file=>file.path.endsWith('.fb2')));assert.ok(discovered.files.some(file=>file.path.endsWith('.cbz')));
  assert.equal(discovered.files.some(file=>file.path.endsWith('.exe')||file.path.endsWith('.wma')),false);
  // Start the frame sampler after page load. It remains active through scan, import and refresh.
  await evaluate(`window.key48Frames={max:0,count:0,last:performance.now()};(function sample(now){const s=window.key48Frames;s.max=Math.max(s.max,now-s.last);s.last=now;s.count++;requestAnimationFrame(sample)})(performance.now());window.key48Events=[];window.electronAPI.onDigitalImportProgress(event=>{window.key48Events.push(event);if(${JSON.stringify(mode)}==='cancel'&&!window.key48Cancelled&&event.currentFileIndex>=Math.floor(event.totalFiles/2)){window.key48Cancelled=true;document.querySelector('[data-import-cancel]')?.click()}});true`);
  let peakMainBytes=process.memoryUsage().rss;let maxMainGapMs=0;let last=performance.now();
  const sample=setInterval(()=>{peakMainBytes=Math.max(peakMainBytes,process.memoryUsage().rss);const now=performance.now();maxMainGapMs=Math.max(maxMainGapMs,now-last);last=now;},50);
  const start=performance.now();console.log('KEY48 '+lang+' '+mode+' staged '+discovered.files.length);
  try {
    await evaluate(`window.importTest.setPaths([${JSON.stringify(corpus)}]);window.importTest.setOpen(true)`);
    await until(`document.querySelectorAll('button[title=${JSON.stringify(labels.removeImportFile)}]').length===100`);
    await click(labels.scanDuplicatesBtn);
    await until(`document.body.textContent.includes(${JSON.stringify(labels.importBatchDuplicate)})&&document.body.textContent.includes(${JSON.stringify(labels.importErrorCorrupt)})`);
    assert.equal(await evaluate('!!document.querySelector("[data-import-cancel]")'),false,'Review must stay open for twins/errors');
    assert.ok(await evaluate("document.body.textContent.includes('twin-first.txt')&&document.body.textContent.includes('twin-second.txt')"));
    await shot('review-1280');
    win.setContentSize(480,950);await pause(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);await shot('review-480');
    win.setContentSize(1280,950);
    await click(labels.startImportBtn);
    await until('!!document.querySelector("[data-import-result=failures]")');
    await until('window.key48Events.some(event=>["completed","failed","skipped"].includes(event.status))');
    const summary = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-import-count]')].map(node=>[node.dataset.importCount,Number(node.textContent.replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-1632)).replace(/[,٬]/g,''))]))`);
    assert.equal(summary.imported+summary.duplicates+summary.failures+summary.cancelled,discovered.files.length);
    const works=repository.getAllWorks();assert.equal(works.length,1001+summary.imported);
    assert.equal(database.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(database.pragma('foreign_key_check'),[]);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM file_source_detail').get().count,1+summary.imported);
    if(mode==='full'){
      assert.equal(summary.cancelled,0);assert.equal(summary.failures,1);assert.equal(summary.duplicates,1);assert.equal(summary.imported,discovered.files.length-2);
      const fb2=works.find(work=>work.filePath?.endsWith('book-0.fb2'));const cbz=works.find(work=>work.filePath?.endsWith('book-1.cbz'));assert.ok(fb2?.coverImage);assert.ok(cbz?.coverImage);assert.equal(fb2.digitalFormat,'FB2');assert.equal(cbz.digitalFormat,'CBZ');
      await evaluate("document.querySelector('[data-import-result=failures]').click()");
      await until(`document.body.textContent.includes('corrupt.cbz')&&document.body.textContent.includes(${JSON.stringify(labels.importErrorCorrupt)})`);
      await shot('localized-error');
    }else{assert.ok(summary.cancelled>0);assert.ok(summary.imported>0);assert.ok(summary.imported<discovered.files.length);await evaluate("document.querySelector('[data-import-result=cancelled]').click()");await shot('cancelled-results');}
    const frames=await evaluate('window.key48Frames');assert.ok(frames.count>30);assert.ok(frames.max<1000,`Frozen renderer frame ${frames.max} ms`);
    assert.deepEqual(errors,[]);
    const result={lang,mode,discovered:discovered.files.length,existingLibraryWorks:1000,summary,elapsedMs:performance.now()-start,peakMainBytes,maxMainGapMs,frames,rendererErrors:errors,integrity:'ok',singleFileAvoidedWizard:true,twinShownInReview:true,localizedCorruptError:true};
    await fs.writeFile(path.join(evidence,`${lang}-${mode}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally {clearInterval(sample);}
  await confirmedQuitCleanup.run();win.destroy();closeDatabase();app.quit();
}).catch(async error=>{console.error(error);for(const win of BrowserWindow.getAllWindows())try{await fs.writeFile(path.join(evidence,`${lang}-${mode}-failure.png`),(await win.webContents.capturePage()).toPNG());}catch{/* Closing */}app.exit(1);});
