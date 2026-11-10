const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY291_DIR;
const evidence = process.env.BAGLIB_KEY291_EVIDENCE;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => Promise.race([win.webContents.executeJavaScript(code, true), pause(8000).then(() => { throw new Error('Evaluation timeout'); })]).catch(error => { throw new Error(error.message + ' ' + code.slice(0, 700)); });
  const until = async code => {
    for (let index = 0; index < 300; index++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    console.log(await evaluate(`document.body.innerText.slice(-1500)`));
    throw new Error(`Timed out ${code}`);
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(100);
  };
  const shot = async name => {
    await pause(350);
    fs.writeFileSync(path.join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const touch = async selector => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height,visible:r.width>0&&r.height>0};})()`);
    console.log('TOUCH:', selector, point);
    if (!point) return;
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1, id: 1 }] });
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(250);
  };
  const geometry = () => evaluate(`(()=>{const h=document.querySelector('[data-reader-top-bar],[data-pdf-header]');const r=h.getBoundingClientRect();return {opacity:getComputedStyle(h).opacity,top:r.top,bottom:r.bottom,width:innerWidth,scroll:document.documentElement.scrollWidth,focus:document.activeElement?.outerHTML.slice(0,250)};})()`);
  (async () => {
    const files = JSON.parse(fs.readFileSync(path.join(directory, 'inputs.json')));
    const results = [];
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.settings.set('save.policy.v1',{mode:'manual',intervalMinutes:2})`);
    for (const file of files) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: file.id, title: file.title, author: '', workType: 'book', bookType: 'digital', digitalFormat: file.kind.toUpperCase(), filePath: file.filename })})`);
    win.webContents.debugger.attach('1.3');
    for (const language of ['ar', 'en']) for (const width of [1280, 480]) for (const file of files.filter(file => file.kind === 'epub' || file.lang === language)) {
      await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
      await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
      win.setContentSize(width, 900);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)})`);
      await win.loadURL('http://localhost:3000');
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      await key('Escape');
      await pause(600);
      const library = language === 'ar' ? '\u0627\u0644\u0645\u0643\u062a\u0628\u0629' : 'Library';
      const read = language === 'ar' ? '\u0642\u0631\u0627\u0621\u0629' : 'Read';
      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(library)}]').click()`);
      await until(`[...document.querySelectorAll('h3,h4')].some(e=>e.textContent.trim()===${JSON.stringify(file.title)})`);
      await pause(500);
      await evaluate(`(()=>{const title=[...document.querySelectorAll('h3,h4')].find(e=>e.textContent.trim()===${JSON.stringify(file.title)});if(!title)throw new Error('Missing title');let e=title;while(e){const button=[...e.querySelectorAll('button')].find(b=>b.title===${JSON.stringify(read)}||b.textContent.trim()===${JSON.stringify(read)});if(button){button.click();return;}e=e.parentElement;}throw new Error('No read button '+document.querySelector('main')?.textContent.slice(-700));})()`);
      await until("!!document.querySelector('[data-reader-markup-bar]')");
      if (file.kind === 'pdf') await until("!!document.querySelector('[data-pdf-width]')");
      else await until("!!document.querySelector('[data-epub-marks-status]')");
      await pause(700);
      const prefix = `${file.kind}-${language}-${width}`;
      win.show(); win.focus(); win.webContents.focus();
      console.log('OPEN', prefix);
      // Move the mouse away and remove hover/focus before checking hidden chrome.
      win.webContents.sendInputEvent({ type: 'mouseMove', x: width - 5, y: 450 });
      if (file.kind === 'pdf') await key('F11');
      await evaluate('document.activeElement?.blur()');
      await pause(700);
      assert.equal((await geometry()).opacity, '0', `${prefix} initially hidden`);
      // Begin the focus test at the persistent handle, then use native Tab into hidden chrome.
      await evaluate("document.querySelector('[data-reader-toolbar-toggle]').focus()");
      await key('Tab');
      await pause(350);
      assert.ok(await evaluate("!!document.activeElement?.closest('[data-reader-top-bar],[data-pdf-header]')"), prefix+' Tab enters header');
      assert.equal((await geometry()).opacity, '1', `${prefix} Tab reveals header`);
      await key('M', ['alt']);
      await until("document.activeElement?.hasAttribute('data-markup-tool-button')");
      // Tab to highlighter, including compact PDF palette when applicable.
      if (await evaluate("!!document.querySelector('[data-markup-palette]')")) {
        await key('Tab'); await key('Enter');
        await until("!!document.querySelector('[data-markup-palette-panel]')");
      }
      for (let count = 0; count < 35; count++) {
        if (await evaluate("document.activeElement?.getAttribute('data-markup-tool-button')==='highlight'")) break;
        await key('Tab');
      }
      assert.equal(await evaluate("document.activeElement?.getAttribute('data-markup-tool-button')"), 'highlight');
      await key('Enter');
      await until("document.querySelector('[data-reader-markup-bar]')?.getAttribute('data-markup-tool')==='highlight'");
      await key('Tab');
      await pause(350);
      assert.equal((await geometry()).opacity, '1', 'Focus retention');
      await shot(`${prefix}-keyboard`);
      // Reset to selection and hide again, then enable actual Chromium mobile/touch emulation.
      await key('Escape');
      if (file.kind === 'pdf') await key('F11');
      await evaluate('document.activeElement?.blur()');
      win.webContents.sendInputEvent({ type: 'mouseMove', x: width - 5, y: 450 });
      await pause(700);
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
      await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await touch('[data-reader-toolbar-toggle]');
      await pause(400);
      assert.equal((await geometry()).opacity, '1', `${prefix} touch reveals`);
      if (await evaluate("!!document.querySelector('[data-markup-palette]')")) {
        await touch('[data-markup-palette]');
        await until("!!document.querySelector('[data-markup-palette-panel]')");
      }
      await touch('[data-markup-tool-button="underline"]');
      await until("document.querySelector('[data-reader-markup-bar]')?.getAttribute('data-markup-tool')==='underline'");
      await shot(`${prefix}-touch`);
      const metrics = await geometry();
      assert.ok(metrics.scroll <= width, `${prefix} horizontal overflow`);
      // Use the real rendered text to check selection actions against the pinned toolbar.
      if (await evaluate("!!document.querySelector('[data-markup-palette]')")) {
        await touch('[data-markup-palette]');
        await until("!!document.querySelector('[data-markup-palette-panel]')");
      }
      await touch('[data-markup-tool-button="select"]');
      await until("document.querySelector('[data-reader-markup-bar]')?.getAttribute('data-markup-tool')==='select'");
      await evaluate('document.activeElement?.blur()');
      if (file.kind === 'pdf') {
        const page = file.lang === 'en' ? 200 : 2;
        await evaluate(`(()=>{const e=document.querySelector('[data-reader-go-to], [data-pdf-bottom-navigation] input[type=number]');if(!e)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(page))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.form?.requestSubmit();})()`);
        await until(`document.querySelector('[data-reader-page]')?.getAttribute('data-reader-page')==='${page}' && [...document.querySelectorAll('.textLayer span')].some(e=>e.textContent.trim().length>5)`);
        await pause(600);
      }
      if (file.kind === 'epub') for (let page = 0; page < 12; page++) {
        if (await evaluate("[...document.querySelectorAll('.prose p')].some(p=>p.textContent.trim().length>30)")) break;
        await evaluate(`(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}))`); await pause(800);
      }
      await evaluate(`(()=>{
        const nodes=[...document.querySelectorAll(${JSON.stringify(file.kind === 'epub' ? '.prose p' : '.textLayer span')})];
        const text=nodes.flatMap(e=>{const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);const out=[];let n;while(n=walker.nextNode())if(n.textContent.trim().length>0)out.push(n);return out;}).find(t=>t.textContent.trim().length>5);
        if(!text)throw new Error('No real body text for selection');
        const range=document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(25,text.length));
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
        text.parentElement.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        document.querySelector('.pdf-native-viewer-container')?.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      })()`);
      await until("!!document.querySelector('[role=dialog] [data-reader-study-action]') || [...document.querySelectorAll('[role=dialog]')].some(e=>e.style.top.includes('reader-toolbar-bottom'))");
      const overlap = await evaluate(`(()=>{const h=document.querySelector('[data-reader-top-bar],[data-pdf-header]').getBoundingClientRect();const m=[...document.querySelectorAll('[role=dialog]')].find(e=>e.style.top.includes('reader-toolbar-bottom')).getBoundingClientRect();return {headerBottom:h.bottom,menuTop:m.top,menuBottom:m.bottom};})()`);
      assert.ok(overlap.menuTop >= overlap.headerBottom, prefix+' selection overlap');
      assert.ok(overlap.menuBottom <= 900, prefix+' selection viewport');
      await shot(prefix+'-selection');
      await key('Escape');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      assert.ok(await evaluate("getComputedStyle(document.querySelector('[data-reader-top-bar],[data-pdf-header]')).transitionDuration.split(',').every(value=>parseFloat(value)<=0.00001)"), 'Reduced motion');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
      if (file.kind === 'pdf') await key('F11');
      await evaluate("document.querySelector('[data-reader-toolbar-toggle]').click();document.activeElement?.blur()");
      win.webContents.sendInputEvent({type:'mouseMove',x:width-5,y:450});await pause(700);
      assert.equal((await geometry()).opacity,'0');
      win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(width/2),y:20});await pause(400);
      assert.equal((await geometry()).opacity,'1',prefix+' hover unchanged');
      results.push({ prefix, keyboard: true, touch: true, selection: overlap, reducedMotion: true, hover: true, metrics });
      console.log('PASS', prefix);
    }
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
    app.quit();
  })().catch(async error => {
    console.error(error);
    await shot('failure').catch(() => {});
    app.exit(1);
  });
});
require('../../dist/main/index.js');
