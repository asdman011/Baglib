const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_DATA_DIR;
if (!directory || !path.basename(directory).startsWith('layout-live-')) throw new Error('A disposable layout-live profile is required');
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 160; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(300);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const results = {};
  (async () => {
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    if (process.env.BAGLIB_MOTION_CHECK) owner.webContents.debugger.attach('1.3');
    for (const language of ['en', 'ar']) {
      await evaluate(`localStorage.setItem('baglib-lang', '${language}')`);
      await owner.loadURL('http://localhost:3000');
      await until('!!document.querySelector("#workspace-navigation")');
      await pause(1800);
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      if (owner.isFullScreen()) owner.setFullScreen(false);
      if (owner.isMaximized()) owner.unmaximize();
      owner.setMinimumSize(320, 400);
      const checks = [];
      for (const width of [1280, 900, 640, 480, 380]) {
        owner.setContentSize(width, 820);
        await pause(650);
        const result = await evaluate(`(() => {
          const header = document.querySelector('header');
          const footer = document.querySelector('footer');
          const outside = [...header.querySelectorAll('button'), ...footer.querySelectorAll('button')].filter(element => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5);
          }).map(element => element.title || element.textContent);
          return { width: innerWidth, outside, sections: document.querySelectorAll('#workspace-navigation section').length,
            current: document.querySelectorAll('aside [aria-current="page"]').length,
            direction: getComputedStyle(document.querySelector('aside')).direction };
        })()`);
        assert.deepEqual(result.outside, [], `${language} ${width} header/footer overflow`);
        assert.equal(result.sections, 3);
        assert.equal(result.current, 1);
        assert.equal(result.direction, language === 'ar' ? 'rtl' : 'ltr');
        checks.push(result);
        fs.writeFileSync(path.join(directory, `${language}-${width}.png`), (await owner.webContents.capturePage()).toPNG());
      }
      const notesLabel = await evaluate("document.querySelector('aside svg.lucide-file-text').closest('button').getAttribute('aria-label')");
      await evaluate("document.querySelector('footer button').click()");
      await until(`document.querySelector('aside [aria-current="page"]')?.getAttribute('aria-label') === ${JSON.stringify(notesLabel)}`);
      await evaluate("document.querySelector('header button').click()");
      await until("document.querySelector('aside [aria-current=\"page\"] svg.lucide-layout-dashboard') !== null");
      const before = await evaluate("document.querySelector('[aria-controls=workspace-navigation]').getAttribute('aria-expanded')");
      await evaluate("document.querySelector('[aria-controls=workspace-navigation]').click()");
      assert.notEqual(await evaluate("document.querySelector('[aria-controls=workspace-navigation]').getAttribute('aria-expanded')"), before);
      await evaluate("document.querySelector('[aria-controls=workspace-navigation]').click()");
      results[language] = checks;
      const workspaceChecks = [];
      for (const icon of ['lucide-library', 'lucide-calendar-days', 'lucide-clapperboard', 'lucide-layers', 'lucide-file-text', 'lucide-feather', 'lucide-book-open-text', 'lucide-book-marked', 'lucide-route', 'lucide-settings']) {
        if (process.env.BAGLIB_RECOVERY_CHECK && !['lucide-file-text', 'lucide-settings'].includes(icon)) continue;
        if (process.env.BAGLIB_BACKGROUND_CHECK && icon !== 'lucide-library') continue;
        if ((process.env.BAGLIB_LAYOUT_TOOLS_ONLY || process.env.BAGLIB_USABILITY_INSPECT) && icon !== 'lucide-library') continue;
        if (icon === 'lucide-clapperboard') await evaluate("window.electronAPI.settings.set('media.lectures.v1',Array.from({length:60},(_,index)=>({id:'layout-lecture-'+index,title:'محاضرة طويلة — Lecture '+index,path:'layout-fixture-'+index+'.mp3',kind:'audio',sections:[],sectionSource:'none',addedAt:'2026-11-07T00:00:00Z'})))");
        await evaluate(`document.querySelector('aside svg.${icon}').closest('button').click()`);
        await pause(1800);
        if (process.env.BAGLIB_MOTION_CHECK && icon === 'lucide-library') {
          const target = await evaluate("(() => {const button=document.querySelector('[data-library-ribbon] button:not(:disabled)');const box=button.getBoundingClientRect();return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2),hover:matchMedia('(hover:hover) and (pointer:fine)').matches};})()");
          if (target.hover) {
            owner.webContents.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
            await pause(250);
            assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-library-ribbon] button:not(:disabled)')).translate"), '0px -1px');
            await owner.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            await pause(60);
            assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-library-ribbon] button:not(:disabled)')).translate"), 'none');
            await owner.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
          }
          results[`${language}-hover-motion`] = target.hover;
        }
        if (process.env.BAGLIB_BACKGROUND_CHECK) {
          const paths = [1, 2].map(index => path.join(directory, `${language}-import-${index}.txt`));
          paths.forEach((filename, index) => fs.writeFileSync(filename, `${language} temporary import fixture ${index}`));
          const handlers = new Map(['digital:check-duplicates', 'digital:import-files'].map(key => [key, ipcMain._invokeHandlers.get(key)]));
          ipcMain.removeHandler('digital:check-duplicates');
          ipcMain.handle('digital:check-duplicates', () => paths.map(filename => ({ filePath: filename, fileName: path.basename(filename), matchType: 'none', confidence: 0, reason: '' })));
          ipcMain.removeHandler('digital:import-files');
          ipcMain.handle('digital:import-files', async event => {
            await pause(500);
            event.sender.send('digital:import-progress', { currentFileIndex: 1, totalFiles: 2, currentFilename: path.basename(paths[0]), status: 'extracting', progressPercentage: 25 });
            await pause(4500);
            return { totalFiles: 2, successfulImports: 2, failedImports: 0, skippedImports: 0, results: paths.map(filename => ({ filePath: filename, fileName: path.basename(filename), fileSizeBytes: 12, success: true })) };
          });
          await evaluate("document.querySelector('[data-library-dialog=import]').click()");
          await until("!!document.querySelector('[data-import-minimize]')");
          await evaluate(`(() => {const transfer=new DataTransfer();for(const filename of ${JSON.stringify(paths)}){const file=new File(['fixture'],filename.split(/[\\\\/]/).at(-1),{type:'text/plain'});Object.defineProperty(file,'path',{value:filename});transfer.items.add(file);}const input=document.querySelector('[role=dialog] input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await until("document.querySelector('[role=dialog]')?.textContent.includes('-import-2.txt')");
          const scanLabel = language === 'ar' ? 'فحص التكرارات والمتابعة' : 'Check Duplicates & Continue';
          await evaluate(`(() => {const button=[...document.querySelectorAll('[role=dialog] button')].find(button=>button.textContent.trim()===${JSON.stringify(scanLabel)});if(!button)throw new Error('scan button missing');button.click();})()`);
          await until("!!document.querySelector('[role=dialog] button[disabled] svg.lucide-x')");
          await evaluate("document.querySelector('[data-import-minimize]').click()");
          assert.equal(await evaluate("!!document.querySelector('[role=dialog]')"), false);
          await evaluate("document.querySelector('aside svg.lucide-file-text').closest('button').click()");
          await until("!!document.querySelector('[data-import-resume]')");
          await pause(6000);
          assert.ok(await evaluate(`document.querySelector('[data-import-resume]').textContent.includes(${JSON.stringify(language === 'ar' ? 'انتهت العملية' : 'The operation finished')})`));
          await evaluate("document.querySelector('[data-import-resume]').click()");
          await until("!!document.querySelector('[role=dialog]')");
          await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(button=>button.querySelector('svg.lucide-x')).click()");
          for (const [key, original] of handlers) { ipcMain.removeHandler(key); ipcMain.handle(key, original); }
          results[`${language}-background-import`] = true;
          continue;
        }
        if (process.env.BAGLIB_RECOVERY_CHECK && icon === 'lucide-file-text') {
          const original = ipcMain._invokeHandlers.get('study-notes:list');
          assert.ok(original, 'notes handler available');
          ipcMain.removeHandler('study-notes:list');
          ipcMain.handle('study-notes:list', () => { throw new Error('Disposable recovery fixture'); });
          await evaluate("window.dispatchEvent(new Event('baglib:notes-changed'))");
          await until("!!document.querySelector('main [role=alert]')");
          const recovery = await evaluate(`(() => {const main=document.querySelector('main');const retry=[...main.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(language === 'ar' ? 'إعادة المحاولة' : 'Retry')});return {retry:!!retry,empty:main.textContent.includes(${JSON.stringify(language === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')})};})()`);
          assert.equal(recovery.retry, true);
          assert.equal(recovery.empty, false);
          ipcMain.removeHandler('study-notes:list');
          ipcMain.handle('study-notes:list', original);
          await evaluate(`[...document.querySelectorAll('main button')].find(button=>button.textContent.trim()===${JSON.stringify(language === 'ar' ? 'إعادة المحاولة' : 'Retry')}).click()`);
          await until("!document.querySelector('main [role=alert]')");
          results[`${language}-notes-recovery`] = recovery;
        }
        if (process.env.BAGLIB_RECOVERY_CHECK && icon === 'lucide-settings') {
          assert.equal(await evaluate("document.querySelectorAll('[data-settings-entry]').length"), 6);
          for (const panel of ['providers', 'sync']) {
            await evaluate(`document.querySelector('[data-settings-entry=${panel}]').click()`);
            await until("!!document.querySelector('.fixed.inset-0')");
            await pause(500);
            await evaluate("[...document.querySelectorAll('.fixed.inset-0 button')].find(button=>button.querySelector('svg.lucide-x')).click()");
            await pause(200);
          }
          results[`${language}-settings-directory`] = true;
        }
        for (const width of [1280, 480]) {
          owner.setContentSize(width, 820);
          await pause(600);
          const layout = await evaluate(`(() => {
            const main = document.querySelector('main');
            const box = main.getBoundingClientRect();
            return { width: innerWidth, mainWidth: box.width, bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              ribbonGroups: [...document.querySelectorAll('[data-library-ribbon] section')].map(group => group.getAttribute('aria-label')) };
          })()`);
          assert.equal(layout.bodyOverflow, false, `${language} ${icon} ${width} body overflow`);
          if (icon === 'lucide-clapperboard') {
            const list = await evaluate("(() => {const list=document.querySelector('main ul');return {rows:list.querySelectorAll('li').length,scrolls:list.scrollHeight>list.clientHeight,height:list.getBoundingClientRect().height};})()");
            assert.equal(list.rows, 60);
            assert.ok(list.scrolls && list.height <= 550, `${language} lecture list bounds`);
          }
          if (icon === 'lucide-library') {
            const reserved = await evaluate("(() => { const controls=document.querySelector('[data-library-controls]'); const parent=controls.parentElement.getBoundingClientRect(); const box=controls.getBoundingClientRect(); return parent.bottom-box.bottom; })()");
            assert.ok(reserved > 150, `${language} ${width} library must leave book space`);
            const listTitle = language === 'ar' ? 'عرض القائمة' : 'List View';
            await evaluate(`document.querySelector('button[title=${JSON.stringify(listTitle)}]').click()`);
            await pause(500);
            await evaluate("document.querySelector('svg.lucide-columns-3').closest('button').click()");
            await pause(200);
            const popup = await evaluate("(() => { const popup=document.querySelector('body > [role=region]'); if(!popup)return null; const box=popup.getBoundingClientRect(); return {inside:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,direction:popup.dir}; })()");
            assert.ok(popup?.inside, `${language} ${width} column popup visible`);
            assert.equal(popup.direction, language === 'ar' ? 'rtl' : 'ltr');
            fs.writeFileSync(path.join(directory, `${language}-columns-${width}.png`), (await owner.webContents.capturePage()).toPNG());
            await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
            assert.equal(await evaluate("!!document.querySelector('body > [role=region]')"), false);
            if (width === 480) {
              owner.setContentSize(480, 600);
              for (const dialog of ['import', 'book', 'storage', 'sync', 'catalog', 'clipper', 'statistics', 'security', 'trash', 'audit', 'tools', 'search', ...(process.env.BAGLIB_FOCUS_DIALOGS?.split(',').includes('providers') ? ['providers'] : [])]) {
                if (process.env.BAGLIB_USABILITY_INSPECT && !(process.env.BAGLIB_FOCUS_DIALOGS?.split(',') || (process.env.BAGLIB_FOCUS_CHECK ? ['import', 'book', 'search'] : ['import', 'search'])).includes(dialog)) continue;
                if (process.env.BAGLIB_LAYOUT_TOOLS_ONLY && !['tools', 'search'].includes(dialog)) continue;
                if (dialog === 'providers') {
                  await evaluate("document.querySelector('aside svg.lucide-settings').closest('button').click()");
                  await until("!!document.querySelector('[data-settings-entry=providers]')");
                }
                const trigger = dialog === 'providers' ? '[data-settings-entry=providers]' : dialog === 'search' ? 'aside svg.lucide-globe' : `[data-library-dialog="${dialog}"]`;
                await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(trigger)});const button=node.closest('button');button.focus();window.__dialogOpener=button;button.click();})()`);
                await pause(800);
                const bounds = await evaluate("(() => {const overlays=[...document.querySelectorAll('.fixed.inset-0')];const overlay=overlays.at(-1);const panel=[...overlay.children].find(element=>element.getBoundingClientRect().width>200);const box=panel.getBoundingClientRect();return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,width:innerWidth,height:innerHeight};})()");
                assert.ok(bounds.top>=-1&&bounds.bottom<=bounds.height+1&&bounds.left>=-1&&bounds.right<=bounds.width+1, `${language} ${dialog} bounds ${JSON.stringify(bounds)}`);
                if (dialog === 'storage') assert.ok(await evaluate("document.querySelector('[data-storage-results]').getBoundingClientRect().height>=80"), `${language} usable storage results area`);
                if (dialog === 'tools') assert.ok(await evaluate("[...[...document.querySelectorAll('.fixed.inset-0')].at(-1).querySelectorAll('header button')].every(button=>{const box=button.getBoundingClientRect();return box.width===0||(box.left>=0&&box.right<=innerWidth);})"), `${language} tools header controls visible`);
                if (process.env.BAGLIB_MOTION_CHECK) {
                  const normal = await evaluate("getComputedStyle(document.querySelector('[role=dialog]')).animationName");
                  assert.equal(normal, 'baglib-surface-enter');
                  await evaluate("window.__motionFocus=document.activeElement");
                  await owner.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
                  await pause(60);
                  const reduced = await evaluate("(() => {const style=getComputedStyle(document.querySelector('[role=dialog]'));return {duration:parseFloat(style.animationDuration),transition:parseFloat(style.transitionDuration),focus:document.activeElement===window.__motionFocus};})()");
                  assert.ok(reduced.duration <= 0.00001 && reduced.transition <= 0.00001);
                  assert.equal(reduced.focus, true);
                  await owner.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
                  results[`${language}-${dialog}-motion`] = { normal, reduced };
                }
                fs.writeFileSync(path.join(directory, `${language}-dialog-${dialog}.png`), (await owner.webContents.capturePage()).toPNG());
                if (process.env.BAGLIB_USABILITY_INSPECT) {
                  await evaluate("[...document.querySelectorAll('.fixed.inset-0')].at(-1).querySelector('button').focus()");
                  owner.webContents.focus();
                  let escapedAt = null;
                  for (let step = 1; step <= 40; step++) {
                    owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
                    owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
                    await pause(30);
                    if (!await evaluate("!!document.activeElement?.closest('.fixed.inset-0')")) { escapedAt = step; break; }
                  }
                  const finding = await evaluate("(() => {const overlay=[...document.querySelectorAll('.fixed.inset-0')].at(-1);return {activeLabel:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80),modalSemantics:overlay.matches('[role=dialog][aria-modal=true]')||!!overlay.querySelector('[role=dialog][aria-modal=true]')};})()");
                  results[`${language}-${dialog}-keyboard`] = { escapedAt, ...finding };
                  fs.writeFileSync(path.join(directory, 'usability.json'), JSON.stringify(results, null, 2));
                  if (process.env.BAGLIB_FOCUS_CHECK) {
                    assert.equal(escapedAt, null, `${language} ${dialog} Tab containment`);
                    assert.equal(finding.modalSemantics, true);
                    assert.ok(await evaluate("!!document.querySelector('[role=dialog]')?.getAttribute('aria-label')"));
                    for (let step = 0; step < 40; step++) {
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] });
                      owner.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] });
                      await pause(20);
                      assert.ok(await evaluate("!!document.activeElement?.closest('[role=dialog]')"), `${language} ${dialog} reverse Tab`);
                    }
                    if (dialog === 'book') {
                      await evaluate("(() => {const input=document.querySelector('[role=dialog] input[placeholder]'); window.__dirtyInput=input;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Focus test اختبار');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
                      await pause(200);
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(200);
                      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"), 2, 'dirty prompt opens');
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(200);
                      assert.equal(await evaluate("window.__dirtyInput.value"), 'Focus test اختبار');
                      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"), 1, 'Escape keeps editing');
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(200);
                      await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).querySelectorAll('button')[1].click()");
                    } else if (dialog === 'providers') {
                      await evaluate("(() => {const checkbox=document.querySelector('[role=dialog] input[type=checkbox]');checkbox.click();window.__providerChecked=checkbox.checked;const input=document.querySelector('[data-source-urls] input');if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://example.invalid/unsaved.json');input.dispatchEvent(new Event('input',{bubbles:true}));}})()");
                      await pause(150);
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"), 2);
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      assert.equal(await evaluate("document.querySelector('[role=dialog] input[type=checkbox]').checked===window.__providerChecked"), true);
                      assert.equal(await evaluate("document.querySelector('[data-source-urls] input')?.value"), 'https://example.invalid/unsaved.json');
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).querySelectorAll('button')[1].click()");
                    } else if (dialog === 'sync') {
                      await evaluate("(() => {const input=document.querySelector('input[placeholder=\"e.g. reader_user\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'draft-reader');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
                      await pause(150);
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"), 2);
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      assert.equal(await evaluate("document.querySelector('input[placeholder=\"e.g. reader_user\"]').value"), 'draft-reader');
                      owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                      await pause(150);
                      await evaluate("[...document.querySelectorAll('[role=dialog]')].at(-1).querySelectorAll('button')[1].click()");
                    } else owner.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
                    await pause(250);
                    assert.equal(await evaluate("document.activeElement===window.__dialogOpener"), true, `${language} ${dialog} opener restored`);
                    continue;
                  }
                }
                await evaluate("(() => {const overlay=[...document.querySelectorAll('.fixed.inset-0')].at(-1);const close=[...overlay.querySelectorAll('button')].find(button=>button.querySelector('svg.lucide-x'));if(!close)throw new Error('missing close');close.click();})()");
                await pause(250);
              }
              owner.setContentSize(480, 820);
            }
          }
          workspaceChecks.push({ icon, ...layout });
          if (icon === 'lucide-book-open-text' && width === 480) {
            await until("!!document.querySelector('.sunnah-hadith .sunnah-bilingual > .sunnah-english')");
            const parallel = await evaluate("(() => {const row=document.querySelector('.sunnah-hadith .sunnah-bilingual');row.scrollIntoView({block:'start'});const ar=row.querySelector('.sunnah-arabic').getBoundingClientRect();const en=row.querySelector('.sunnah-english').getBoundingClientRect();return {stacked:en.top>=ar.bottom-1,inside:ar.left>=0&&en.left>=0&&ar.right<=innerWidth+1&&en.right<=innerWidth+1};})()");
            assert.ok(parallel.stacked && parallel.inside, `${language} mobile hadith columns: ${JSON.stringify(parallel)}`);
            fs.writeFileSync(path.join(directory, `${language}-hadith-mobile.png`), (await owner.webContents.capturePage()).toPNG());
          }
          if (icon === 'lucide-layers' && width === 480) {
            owner.setContentSize(480, 500);
            const addLabel = language === 'ar' ? 'إضافة تصنيف جديد' : 'Add New Category';
            await evaluate(`[...document.querySelectorAll('main button')].find(button=>button.textContent.trim()===${JSON.stringify(addLabel)}).click()`);
            await pause(300);
            const bounds = await evaluate("(() => {const box=document.querySelector('main .fixed > div').getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:innerHeight};})()");
            assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height, `${language} category dialog short window bounds`);
            fs.writeFileSync(path.join(directory, `${language}-category-dialog-short.png`), (await owner.webContents.capturePage()).toPNG());
            const cancelLabel = language === 'ar' ? 'إلغاء' : 'Cancel';
            await evaluate(`[...document.querySelectorAll('main .fixed button')].find(button=>button.textContent.trim()===${JSON.stringify(cancelLabel)}).click()`);
            owner.setContentSize(480, 820);
          }
          fs.writeFileSync(path.join(directory, `${language}-${icon}-${width}.png`), (await owner.webContents.capturePage()).toPNG());
        }
      }
      results[`${language}Workspaces`] = workspaceChecks;
      if (process.env.BAGLIB_MOTION_CHECK) {
        await evaluate("document.querySelector('aside svg.lucide-book-marked').closest('button').click()");
        await until("document.querySelector('main')?.dataset.workspaceMotion==='reading'");
        await pause(250);
        const reading = await evaluate("(() => {const main=document.querySelector('main');return {transform:getComputedStyle(main).transform,animated:[...main.children].some(child=>getComputedStyle(child).animationName==='baglib-surface-enter')};})()");
        assert.equal(reading.transform, 'none');
        assert.equal(reading.animated, false);
        results[`${language}-reading-motion`] = reading;
      }
    }
    assert.deepEqual(errors.filter(message => /uncaught|maximum update depth/i.test(message)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ results, consoleErrors: errors }, null, 2));
    console.log(JSON.stringify({ passed: true, directory }));
    app.quit();
  })().catch(async error => {
    fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack) + '\n' + errors.join('\n'));
    fs.writeFileSync(path.join(directory, 'failure.png'), (await owner.webContents.capturePage()).toPNG());
    console.error(error);
    app.exit(1);
  });
});
require('../../dist/main/index.js');
