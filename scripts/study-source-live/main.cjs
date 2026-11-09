const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createHash } = require('node:crypto');
const profile = process.env.BAGLIB_STUDY_SOURCE_PROFILE;
const evidence = process.env.BAGLIB_STUDY_SOURCE_EVIDENCE;
const language = process.env.BAGLIB_STUDY_SOURCE_LANG;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => { throw new Error('No protocol registration in live check'); };
const openings = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  const result = await listener(...args);
  if (channel === 'pdf-editor:open') openings.push({ input: args[1], result });
  return result;
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(200);
    }
    throw new Error(`Timed out ${code}`);
  };
  const shot = async name => {
    if (win.getContentSize()[0] === 480) {
      const label = language === 'ar' ? 'إخفاء أدوات PDF' : 'Hide PDF Tools';
      await evaluate(`document.querySelector('[data-reader-chrome="tools"] button[aria-label="${label}"]')?.click()`);
    }
    win.show(); win.focus(); win.webContents.focus();
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await pause(900);
    console.log(JSON.stringify({ screenshot: name, reader: await evaluate("[document.querySelector('[data-reader-source]')?.dataset.readerSource,document.querySelector('[data-reader-page]')?.dataset.readerPage]") }));
    fs.writeFileSync(path.join(evidence, `${language}-${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const open = async (target, source, page) => {
    console.log(JSON.stringify({ target, source, page, stage: 'open' }));
    app.emit('open-url', { preventDefault() {} }, 'baglib:' + target);
    await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(source)} && document.querySelector('[data-reader-page]')?.dataset.readerPage===${JSON.stringify(String(page))}`);
    console.log(JSON.stringify({ target, stage: 'identity' }));
    await until(`!!document.querySelector('.pdf-page-container[data-page-number="${page}"] canvas') && !!document.querySelector('.textLayer span')`);
    console.log(JSON.stringify({ target, stage: 'rendered' }));
    await until(`window.electronAPI.reader.getLastLocation('source-work').then(page=>page===${JSON.stringify(String(page))})`);
  };
  (async () => {
    win.setContentSize(1280, 900);
    win.show(); win.focus(); win.webContents.focus();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)})`);
    win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    let books = await evaluate('window.electronAPI.getAllBooks()');
    if (!books.some(book => book.id === 'source-work')) {
      await evaluate(`window.electronAPI.addBook({id:'source-work',title:'كِتَاب — Source Book',author:'Test',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(profile, '0', 'same.pdf'))}})`);
      const status = await evaluate('window.electronAPI.getDatabaseStatus()');
      const db = new Database(status.path);
      db.prepare('INSERT INTO edition(id,work_id,label) VALUES (?,?,?)').run('second-edition', 'source-work', 'Second edition');
      db.prepare('INSERT INTO source(id,edition_id,source_type) VALUES (?,?,?)').run('second-source', 'second-edition', 'digital');
      db.prepare('INSERT INTO file_source_detail(source_id,file_path,file_format) VALUES (?,?,?)').run('second-source', path.join(profile, '1', 'same.pdf'), 'PDF');
      db.close();
      win.reload();
      await until('!!window.electronAPI && !!document.querySelector("footer")');
      books = await evaluate('window.electronAPI.getAllBooks()');
    }
    const defaultBook = books.find(book => book.id === 'source-work');
    const dbStatus = await evaluate('window.electronAPI.getDatabaseStatus()');
    const db = new Database(dbStatus.path, { readonly: true });
    const rows = db.prepare('SELECT s.id,f.file_path path FROM source s JOIN edition e ON e.id=s.edition_id JOIN file_source_detail f ON f.source_id=s.id WHERE e.work_id=? ORDER BY f.file_path').all('source-work');
    db.close();
    assert.equal(rows.length, 2);
    assert.equal(path.basename(rows[0].path), path.basename(rows[1].path));
    for (const width of [1280, 480]) {
      win.setContentSize(width, 900);
      for (const [index, source] of rows.entries()) {
        const page = index === 0 ? 8 : 3;
        await open(`book:source-work@${source.id}#p=${page}`, source.id, page);
        await until(`document.querySelector('[data-reader-source]')?.closest('[dir]')?.getAttribute('dir')===${JSON.stringify(language === 'ar' ? 'rtl' : 'ltr')}`);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        const expectedHash = createHash('sha256').update(fs.readFileSync(source.path)).digest('hex');
        assert.ok(openings.some(item => item.input.sourceId === source.id && item.result.ok && item.result.data.sourceId === source.id && item.result.data.sha256 === expectedHash), 'Workstation opens exact source bytes');
        await shot(`source-${index}-${width}`);
      }
      await open('book:source-work#p=4', defaultBook.sourceId, 4);
      await open('book:source-work#p=5', defaultBook.sourceId, 5);
      await open('book:source-work@deleted-source#p=6', defaultBook.sourceId, 6);
      await until("!!document.querySelector('[data-study-link-missing]')");
      const notice = await evaluate("document.querySelector('[data-study-link-missing]').textContent");
      assert.ok(notice.includes(language === 'ar' ? 'الملف الافتراضي' : 'default file'));
      await shot(`fallback-${width}`);
    }
    fs.writeFileSync(path.join(evidence, `${language}-checks.json`), JSON.stringify({ passed: true, rows, defaultSource: defaultBook.sourceId, openings }, null, 2));
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, `${language}-failure.txt`), String(error.stack));
    fs.writeFileSync(path.join(evidence, `${language}-failure-dom.html`), await evaluate('document.body.innerHTML').catch(() => ''));
    await shot('failure').catch(() => {});
    app.exit(1);
  });
});
require('../../dist/main/index.js');
