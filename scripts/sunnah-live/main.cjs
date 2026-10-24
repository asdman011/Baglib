const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_SUNNAH_TEST_DIRECTORY;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const { SunnahService } = require(path.join(directory, 'service.cjs'));
  const service = new SunnahService(path.join(app.getPath('userData'), 'sunnah'));
  const start = performance.now();
  const catalog = await service.importArchive(path.resolve(process.argv[2] || 'repos/Hadith/LK-Hadith-Corpus-master.zip'));
  console.log(JSON.stringify({ imported: catalog.hadithCount, collections: catalog.collections.length, milliseconds: Math.round(performance.now() - start) }));
  require(path.join(directory, 'ipc.cjs')).registerSunnahIpc();
  for (const channel of ['library:get-all-books', 'library:get-all-notes', 'categories:get-tree', 'tags:get-all']) ipcMain.handle(channel, () => []);
  const window = new BrowserWindow({ show: false, width: 1280, height: 960, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
  const consoleErrors = [];
  let networkRequests = 0;
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { networkRequests++; callback({ cancel: true }); });
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleErrors.push(message); });
  const evaluate = code => window.webContents.executeJavaScript(code);
  if (process.env.BAGLIB_TEST_NATIVE_SHARE === '1') {
    app.setAppPath(process.cwd());
    window.show();
    await window.loadFile(path.join(directory, 'index.html'));
    const result = await evaluate(`window.electronAPI.sunnah.share('عن عُمَرَ بْنَ الْخَطَّابِ — Native sharing verification')`);
    assert.equal(result.ok, true, JSON.stringify(result));
    console.log('Native Windows Share DataRequested callback received');
    await new Promise(resolve => setTimeout(resolve, 3000));
    window.close();
    app.quit();
    return;
  }
  const until = async expression => {
    const deadline = Date.now() + 15000;
    while (!(await evaluate(`Boolean(${expression})`))) {
      if (Date.now() > deadline) {
        console.error(await evaluate(`({ errors: ${JSON.stringify(consoleErrors)}, articles: document.querySelectorAll('article').length, scroll: document.querySelector('.sunnah-scroll')?.getBoundingClientRect().toJSON(), more: document.querySelector('.sunnah-scroll > .flex > button')?.getBoundingClientRect().toJSON() })`));
        throw new Error(`Timed out: ${expression}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const select = async (index, value) => {
    await evaluate(`(() => { const select = document.querySelectorAll('.sunnah-browser select')[${index}]; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  };
  await window.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await window.loadFile(path.join(directory, 'index.html'));
  await until("document.querySelector('article') && window.sunnahWorkspace");
  assert.equal(await evaluate("document.querySelector('aside .overflow-y-auto button').textContent.trim()"), 'السنة النبوية');
  await select(0, 'Bukhari');
  await select(1, '3');
  await until("document.querySelector('[data-hadith-id=\"Bukhari:3:1\"]')");
  const expected = await service.chapter('Bukhari', 3);
  assert.equal(await evaluate("document.querySelector('article .sunnah-arabic .sunnah-passage').textContent"), expected.hadiths[0].text.ar.full);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.sunnah-narrator')).color"), 'rgb(96, 207, 208)');
  await evaluate("document.querySelector('.sunnah-toolbar-actions > button').click()");
  await until("!document.querySelector('.sunnah-english')");
  await evaluate("document.querySelector('.sunnah-toolbar-actions > button').click()");
  await until("document.querySelector('.sunnah-english')");
  await evaluate("document.querySelectorAll('.sunnah-mode button')[1].click()");
  await until("document.querySelectorAll('article').length >= 24");
  await evaluate("document.querySelector('.sunnah-scroll > .flex > button').scrollIntoView({ block: 'center' })");
  await until("document.querySelectorAll('article').length >= 48");
  await evaluate("document.querySelector('.sunnah-scroll').scrollTop = 0; document.querySelectorAll('.sunnah-mode button')[0].click()");
  await until("document.querySelectorAll('article').length === 1");
  for (const language of ['ar', 'en']) {
    if (language === 'en') await evaluate('window.sunnahWorkspace.toggleLanguage()');
    await until(`document.documentElement.lang === '${language}'`);
    for (const theme of ['dark', 'light']) {
      await evaluate(`document.documentElement.classList.toggle('dark', ${theme === 'dark'})`);
      for (const width of [480, 768, 1280]) {
        window.setContentSize(width, 960);
        await evaluate(`if (window.sunnahWorkspace.isSidebarCollapsed !== ${width < 1000}) window.sunnahWorkspace.toggleSidebar()`);
        await until(`window.sunnahWorkspace.isSidebarCollapsed === ${width < 1000}`);
        await new Promise(resolve => setTimeout(resolve, 350));
        const geometry = await evaluate(`(() => {
          const arabic = document.querySelector('article .sunnah-arabic').getBoundingClientRect();
          const english = document.querySelector('article .sunnah-english').getBoundingClientRect();
          const controls = [...document.querySelectorAll('.sunnah-toolbar button, .sunnah-toolbar input, .sunnah-browser select')].map(element => element.getBoundingClientRect());
          let overlaps = 0;
          for (let first = 0; first < controls.length; first++) for (let second = first + 1; second < controls.length; second++) {
            const earlier = controls[first], later = controls[second];
            if (Math.min(earlier.right, later.right) - Math.max(earlier.left, later.left) > 1 && Math.min(earlier.bottom, later.bottom) - Math.max(earlier.top, later.top) > 1) overlaps++;
          }
          return { overlaps, overflow: document.querySelector('.sunnah-scroll').scrollWidth > document.querySelector('.sunnah-scroll').clientWidth + 1, aligned: Math.abs(arabic.top - english.top) < 1, arabicOnRight: arabic.left >= english.right - 1, railWidth: document.querySelector('aside').getBoundingClientRect().width };
        })()`);
        assert.equal(geometry.overlaps, 0);
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.aligned, true);
        assert.equal(geometry.arabicOnRight, true);
        console.log(JSON.stringify({ language, theme, width, ...geometry }));
        if (width === 1280) {
          window.webContents.invalidate();
          await new Promise(resolve => setTimeout(resolve, 100));
          fs.writeFileSync(path.join(directory, `${language}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
          await evaluate("document.querySelector('article footer').scrollIntoView({ block: 'end' })");
          await new Promise(resolve => setTimeout(resolve, 100));
          fs.writeFileSync(path.join(directory, `${language}-${theme}-actions.png`), (await window.webContents.capturePage()).toPNG());
          await evaluate("document.querySelector('.sunnah-scroll').scrollTop = 0");
        }
      }
    }
  }
  for (const collection of catalog.collections) {
    await select(0, collection.id);
    await until(`document.querySelector('[data-hadith-id="${collection.id}:${collection.chapters[0].number}:1"]')`);
    assert.equal(await evaluate("document.querySelectorAll('article').length"), 1);
  }
  await select(0, 'Bukhari');
  await select(1, '3');
  await until("document.querySelector('[data-hadith-id=\"Bukhari:3:1\"]')");
  await select(2, 'Bukhari:3:2');
  await until("document.querySelector('[data-hadith-id=\"Bukhari:3:2\"]')");
  const search = async value => {
    await evaluate(`(() => { const input = document.querySelector('.sunnah-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
  };
  await search('العِلْم');
  const vocalized = await evaluate("document.querySelector('[role=status]').textContent");
  await search('العلم');
  assert.equal(await evaluate("document.querySelector('[role=status]').textContent"), vocalized);
  assert.ok(await evaluate("document.querySelectorAll('article').length > 0"));
  await search('knowledge');
  assert.ok(await evaluate("document.querySelectorAll('article').length > 0"));
  await search('unmatched-query-987654');
  assert.equal(await evaluate("document.querySelectorAll('article').length"), 0);
  await search('');
  await select(2, 'Bukhari:3:1');
  await evaluate("document.querySelector('.sunnah-navigation button').click()");
  await until("document.querySelector('[data-hadith-id^=\"Bukhari:2:\"]')");
  const previousChapter = await service.chapter('Bukhari', 2);
  assert.equal(await evaluate("document.querySelector('[data-hadith-id]').dataset.hadithId"), previousChapter.hadiths.at(-1).id);
  await evaluate("document.querySelectorAll('.sunnah-navigation button')[1].click()");
  await until("document.querySelector('[data-hadith-id=\"Bukhari:3:1\"]')");
  await select(2, 'Bukhari:3:2');
  await evaluate("window.sunnahWorkspace.setViewMode('library')");
  await until("!document.querySelector('.sunnah-workspace')");
  await evaluate("window.sunnahWorkspace.setViewMode('sunnah')");
  await until("document.querySelector('[data-hadith-id=\"Bukhari:3:2\"]')");
  assert.equal(networkRequests, 0);
  await search('knowledge');
  await evaluate("(() => { const select = document.querySelector('.sunnah-navigation select'); select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await until("document.querySelector('.sunnah-scroll > .p-4 button')");
  await evaluate("document.querySelector('.sunnah-scroll > .p-4 button').click()");
  await until("document.querySelector('article footer textarea')");
  assert.equal(await evaluate("document.querySelector('article footer textarea').rows"), 2);
  assert.equal(await evaluate("document.querySelectorAll('article footer details').length"), 0);
  await evaluate("document.querySelector('article footer button[aria-expanded]').click()");
  await until("document.querySelectorAll('article footer input[type=checkbox]').length === 3");
  await evaluate("document.querySelector('article footer button[aria-expanded]').click()");
  await until("document.querySelectorAll('article footer input[type=checkbox]').length === 0");
  await evaluate("(() => { const input = document.querySelector('article footer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'تأمل شخصي — reflection'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  const reflectionId = await evaluate("document.querySelector('[data-hadith-id]').dataset.hadithId");
  assert.equal(await evaluate(`localStorage.getItem('baglib:sunnah:reflection:' + ${JSON.stringify(reflectionId)})`), 'تأمل شخصي — reflection');
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ checks: 'six collections, translation toggle, continuous append, cross-chapter navigation, bilingual search, remount position, offline', networkRequests, consoleErrors }));
  window.destroy();
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
