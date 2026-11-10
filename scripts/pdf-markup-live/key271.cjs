const { app, dialog } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const directory = process.env.BAGLIB_KEY271_DIR, phase = process.env.BAGLIB_KEY271_PHASE;
app.setPath('userData', directory); app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const python = path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe');
const helper = path.resolve('assets/pdf-editor/baglib_marks.py');
const inspect = file => JSON.parse(execFileSync(python, ['-I', helper, 'inspect', file], { encoding: 'utf8', windowsHide: true }));
let exportIndex = 0, started = false;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(directory, `export-${++exportIndex}.pdf`) });
app.on('browser-window-created', (_, win) => {
  if (started) return; started = true;
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) errors.push(message.slice(0, 600)); });
  const evaluate = code => win.webContents.executeJavaScript(code, true).catch(error => { throw new Error(error.message+' '+code.slice(0,600)); });
  const until = async code => { for (let i = 0; i < 400; i++) { try { if (await evaluate(code)) return; } catch {} await pause(150); } throw new Error(`Timed out ${code}`); };
  const screenshot = async name => { await pause(400); const image = await win.webContents.capturePage(); fs.writeFileSync(path.join(directory, name+'.png'), image.toPNG()); };
  const key = (value, ctrl = false, shift = false) => evaluate(`(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},ctrlKey:${ctrl},shiftKey:${shift},bubbles:true}))`);
  const change = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const tool = async id => {
    for (let attempt=0;attempt<12;attempt++) {
      if (await evaluate(`!!document.querySelector('[data-markup-tool-button="${id}"]')`)) {
        await evaluate(`document.querySelector('[data-markup-tool-button="${id}"]').click()`);
        await until(`!!document.querySelector('[data-pdf-draw-surface="${id}"]')`);
        return;
      }
      await evaluate(`(()=>{const e=document.querySelector('[data-markup-palette]')||document.querySelector('[data-markup-more]');if(e&&e.getAttribute('aria-expanded')!=='true')e.click();})()`);
      await pause(250);
    }
    throw new Error('Tool could not be opened: '+id);
  };
  const drag = async (a, b = a) => {
    const box = await evaluate(`(()=>{const r=document.querySelector('[data-pdf-draw-surface]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const at = p => ({ x: Math.round(box.x + p[0]*box.w), y: Math.round(box.y+p[1]*box.h) });
    const from = at(a), to = at(b);
    win.show(); win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseMove', ...from });
    win.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 }); await pause(100);
    win.webContents.sendInputEvent({ type: 'mouseMove', ...to }); await pause(100);
    win.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 }); await pause(400);
  };
  const load = async (language, bookLanguage = language) => {
    win.setContentSize(1280, 900);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await win.loadURL('http://localhost:3000'); await until('!!window.electronAPI && !!document.querySelector("footer")');
    await key('Escape'); await pause(800);
    const library = language === 'ar' ? 'المكتبة' : 'Library';
    await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(library)}]').click()`);
    const title = `KEY271 ${bookLanguage} علم Knowledge`;
    const read = language === 'ar' ? 'قراءة' : 'Read';
    await until(`[...document.querySelectorAll('h3,h4')].some(e=>e.textContent.trim()===${JSON.stringify(title)}) && [...document.querySelectorAll('button')].some(b=>b.title===${JSON.stringify(read)}||b.textContent.trim()===${JSON.stringify(read)})`);
    await evaluate(`(()=>{let e=[...document.querySelectorAll('h3,h4')].find(e=>e.textContent.trim()===${JSON.stringify(title)});const read=b=>b.title===${JSON.stringify(read)}||b.textContent.trim()===${JSON.stringify(read)};while(e&&!([...e.querySelectorAll('button')].some(read)))e=e.parentElement;[...e.querySelectorAll('button')].find(read).click();})()`);
    await until(`!!document.querySelector('[data-reader-markup-bar]') && !!document.querySelector('[data-pdf-width]')`);
    await pause(500);
  };
  const rows = language => evaluate(`window.electronAPI.knowledge.getByWork('key271-${language}')`);
  (async () => {
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.settings.set('save.policy.v1',{mode:'manual',intervalMinutes:2})`);
    if (phase === 'first') for (const language of ['ar', 'en']) await evaluate(`window.electronAPI.addBook({id:'key271-${language}',title:'KEY271 ${language} علم Knowledge',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(directory, language+'.pdf'))}})`);
    const results = {};
    for (const language of (process.env.BAGLIB_KEY271_LOCALE_ONLY ? [] : ['ar', 'en'])) {
      await load(language);
      const id = 'key271-'+language;
      if (phase === 'first') {
        for (let index=0;index<10;index++) {
          await tool('stamp');
          const ids = await evaluate(`[...document.querySelector('[data-stamp-choice]').options].map(e=>e.value)`);
          await change('[data-stamp-choice]', ids[index]);
          await drag([0.08+(index%2)*0.46, 0.22+Math.floor(index/2)*0.11]);
          await until(`window.electronAPI.knowledge.getByWork('${id}').then(rows=>rows.filter(r=>JSON.parse(r.location).shape==='stamp').length===${index+1})`);
        }
        await screenshot(`stamps-${language}-1280`);
        // Real page calibration line defines ten centimeters. Repeating the same line must measure ten.
        await tool('measure'); await change('[data-measure-unit]', 'cm');
        await evaluate(`document.querySelector('[data-measure-calibrate]').click()`);
        await drag([0.1,0.45],[0.6,0.45]);
        await drag([0.1,0.55],[0.6,0.55]);
        await until(`window.electronAPI.knowledge.getByWork('${id}').then(rows=>rows.some(r=>JSON.parse(r.location).shape==='measure'))`);
        const measured = (await rows(language)).find(row=>JSON.parse(row.location).shape==='measure');
        assert.match(measured.noteContent, language==='ar'?/١٠/u:/10/u);
        await tool('measure'); await change('[data-measure-mode]', 'area'); await drag([0.1,0.55],[0.6,0.75]);
        await screenshot(`measure-${language}-1280`);
        await key('Escape');
        await key('z', true); await pause(500); await key('z',true,true); await pause(500);
        const all = await rows(language); assert.equal(all.length,12);
        await evaluate(`window.electronAPI.materialSave.save('${id}')`);
        const file=path.join(directory, language+'.pdf'); const first=inspect(file);
        assert.equal(first.owned,12); assert.ok(first.outside>=1);
        await evaluate(`window.electronAPI.materialSave.save('${id}')`);
        assert.equal(inspect(file).owned,12);
        await evaluate(`window.electronAPI.materialSave.exportCopy('${id}',{categories:['stamps']},'${language}')`);
        assert.equal(inspect(path.join(directory,`export-${exportIndex}.pdf`)).owned,10);
        await evaluate(`window.electronAPI.materialSave.exportCopy('${id}',{categories:['shapes']},'${language}')`);
        assert.equal(inspect(path.join(directory,`export-${exportIndex}.pdf`)).owned,2);
        results[language]={first, rows:all.map(r=>({id:r.id,location:r.location,text:r.noteContent}))};
      } else {
        assert.equal((await rows(language)).length,12);
        assert.equal(await evaluate(`document.querySelectorAll('[data-pdf-mark="stamp"]').length`),10);
        await screenshot(`restart-${language}-1280`);
      }
      await evaluate(`for(const zone of ['tools','library']) document.querySelector('[data-reader-chrome="'+zone+'"] > div button:last-child')?.click()`);
      win.setContentSize(480,900); await pause(700); await tool('stamp'); await screenshot(`${phase}-stamp-options-${language}-480`);
      await tool('measure'); await screenshot(`${phase}-measure-options-${language}-480`);
      await key('Escape');
      if (phase === 'restart') results[language] = await require('../pdf-workstation-live/key271-actions.cjs')({language,directory,win,evaluate,until,change,screenshot,key,inspect});
    }
    if (process.env.BAGLIB_KEY271_HISTORY_ONLY) {
      for (const bookLanguage of ['ar','en']) {
        for (let step=0;step<3;step++) {
          const restored = await evaluate(`window.electronAPI.materialSave.redo('key271-${bookLanguage}')`);
          if (!restored.ok) break;
        }
      }
    }
    for (const language of ['ar','en']) {
      await load(language,language==='ar'?'en':'ar');
      const labels=await evaluate(`[...document.querySelectorAll('button[data-pdf-mark="measure"]')].map(e=>e.textContent)`);
      assert.equal(labels.length,2);
      for(const label of labels) assert.equal(/[\u0660-\u0669]/u.test(label),language==='ar');
      await screenshot('cross-locale-'+language+'-1280');
      if (!process.env.BAGLIB_KEY271_HISTORY_ONLY) {
        win.setContentSize(480,900);
        await evaluate(`for(const zone of ['tools','library']) document.querySelector('[data-reader-chrome="'+zone+'"] > div button:last-child')?.click()`);
        await tool('stamp');
        await screenshot('cross-stamp-options-'+language+'-480');
        await tool('measure');
        await screenshot('cross-measure-options-'+language+'-480');
        await key('Escape');
      }

      if (process.env.BAGLIB_KEY271_HISTORY_ONLY) {
        const bookLanguage = language === 'ar' ? 'en' : 'ar';
        const workId = 'key271-' + bookLanguage;
        const stampCountIs = expected => `window.electronAPI.knowledge.getByWork('${workId}').then(rows=>rows.filter(row=>JSON.parse(row.location).shape==='stamp').length===${expected})`;
        for (let step=0;step<3;step++) { await key('z',true); await pause(300); }
        await until(stampCountIs(9));
        await screenshot('stamp-undo-'+language+'-1280');
        await key('z',true,true); await until(stampCountIs(10));
        for (let step=0;step<2;step++) { await key('z',true,true); await pause(300); }
        await until(`window.electronAPI.knowledge.getByWork('${workId}').then(rows=>rows.length===12)`);
        await tool('stamp');
        await change('[data-stamp-language]',bookLanguage);
        const stampLabels = await evaluate(`[...document.querySelector('[data-stamp-choice]').options].map(option=>option.textContent)`);
        for (const label of stampLabels) assert.equal(/[\u0600-\u06ff]/u.test(label),bookLanguage==='ar');
        await screenshot('stamp-language-choice-'+language+'-1280');
        await key('Escape');
        const saved = await evaluate(`window.electronAPI.materialSave.save('${workId}')`);
        assert.equal(saved.ok,true,JSON.stringify(saved));
        results[language] = { stampUndoCount:9, stampRedoCount:10, totalRestored:12, stampChoiceLanguage:bookLanguage };
      }

    }
    fs.writeFileSync(path.join(directory, process.env.BAGLIB_KEY271_LOCALE_ONLY ? 'results-locale.json' : `results-${phase}.json`),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({phase,passed:true,directory})); app.quit();
  })().catch(async error => {
    console.error(error); fs.writeFileSync(path.join(directory,'failure-'+phase+'.txt'),String(error.stack)+'\n'+errors.join('\n')+'\n'+await evaluate(`JSON.stringify([...document.querySelectorAll('h3,h4')].filter(e=>e.textContent.includes('KEY271')).map(e=>e.parentElement.parentElement.outerHTML))`).catch(()=> ''));
    await screenshot('failure-'+phase).catch(()=>{}); app.exit(1);
  });
});
require('../../dist/main/index.js');
