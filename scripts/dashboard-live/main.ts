import { app, BrowserWindow, ipcMain } from 'electron';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { buildPrayerStatusSnapshot, DEFAULT_ATHAN_SETTINGS } from '../../src/shared/athan-calculator';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
const directory = process.env.BAGLIB_DASHBOARD_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const db = new Database(path.join(directory, 'notes.db'));
  runMigrations(db, migrations);
  const works = new SqliteWorkRepository(db);
  works.addBook({ id: 'study-book', title: 'دراسة الإيمان — Faith', author: 'مؤلف — Author', workType: 'book', bookType: 'physical' });
  const knowledge = new SqliteKnowledgeRepository(db);
  knowledge.saveKnowledge({ id: 'book-note-test', workId: 'study-book', knowledgeType: 'note', location: 'epubcfi(/6/2)', noteContent: 'Book note — ملاحظة كتاب' });
  const settings = new SqliteSettingsRepository(db);
  const notes = new StudyNotesService(settings);
  const first = notes.save({ title: 'الهداية — Guidance', content: 'تأمل في الهداية', aliases: ['Faith', 'إِيمَان'], tags: ['بحث'] });
  const second = notes.save({ title: 'روابط البحث', content: `![[note:${first.id}|الهداية]]\n[[quran:hafs:2:255|البقرة ٢٥٥]]\n[[sunnah:Bukhari:1:Bukhari:1:1|حديث النيات]]`, aliases: [], tags: [] });
  ipcMain.handle('dashboard-live', (_, action, input) => {
    if (action === 'list') return notes.list();
    if (action === 'save') return notes.save(input);
    if (action === 'remove') return notes.remove(input);
    if (action === 'get') return settings.get(input);
    if (action === 'set') return settings.set(input.key, input.value);
    if (action === 'books') return works.getAllWorks();
    if (action === 'book-notes') return knowledge.getAllNotes();
    if (action === 'knowledge-list') return knowledge.getAllKnowledge();
    if (action === 'knowledge-by-work') return knowledge.getKnowledgeByWork(input);
    if (action === 'knowledge-save') return knowledge.saveKnowledge(input);
    if (action === 'knowledge-delete') return knowledge.deleteKnowledge(input);
    if (action === 'athan') return buildPrayerStatusSnapshot(DEFAULT_ATHAN_SETTINGS, new Date());
    if (action === 'alert') { const alert = { id: 'live-alert', type: 'athan', prayer: 'asr', scheduledTime: '15:00', timestamp: new Date().toISOString() }; owner.webContents.send('live-alert', alert); return alert; }
  });
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url!, 'http://localhost').pathname;
    const file = path.join(directory, name === '/' ? 'index.html' : name);
    try {
      const body = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wav') ? 'audio/wav' : 'text/html'); response.end(body);
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/`;
  const owner = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(directory, 'preload.cjs'), autoplayPolicy: 'no-user-gesture-required' } });
  owner.webContents.setAudioMuted(true);
  const errors: string[] = [];
  owner.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const evaluate = <T = unknown>(code: string): Promise<T> => owner.webContents.executeJavaScript(code);
  const until = async (code: string) => { for (let i = 0; i < 150; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out: ${code}`); };
  const fill = async (selector: string, value: string) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    await owner.loadURL(url);
    await until("Boolean(window.dashboardTest && document.querySelector('[data-dashboard-view]'))");
    for (const lang of ['ar', 'en']) {
      await evaluate(`if(window.dashboardTest.workspace.lang!==${JSON.stringify(lang)})window.dashboardTest.workspace.toggleLanguage()`);
      for (const width of [480, 1280]) {
        owner.setContentSize(width, 1000); await new Promise(resolve => setTimeout(resolve, 450));
        if (width === 480) assert.ok(await evaluate("document.querySelector('aside').getBoundingClientRect().width<=65"));
        assert.ok(await evaluate("(()=>{const el=document.querySelector('[data-dashboard-view]');return el.scrollWidth<=el.clientWidth+1;})()"));
        await fs.writeFile(path.join(directory, `dashboard-${lang}-${width}.png`), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      }
    }
    // Keep the reader mounted while transitioning from no selection to a book.
    await evaluate("window.dashboardTest.workspace.setViewMode('reader')");
    await until("document.body.textContent.includes('No Book Selected for Reading')");
    await evaluate("window.dashboardTest.workspace.openBookForReading(window.dashboardTest.workspace.books[0])");
    await until("!document.body.textContent.includes('No Book Selected for Reading') && window.dashboardTest.workspace.activeBook?.id==='study-book'");
    for (const language of ['ar', 'en']) {
      await evaluate(`if(window.dashboardTest.workspace.lang!==${JSON.stringify(language)})window.dashboardTest.workspace.toggleLanguage()`);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
      await fs.writeFile(path.join(directory, `reader-${language}.png`), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    }
    await evaluate("window.dashboardTest.workspace.setViewMode('dashboard')");
    await until("Boolean(document.querySelector('[data-dashboard-view]'))");
    await evaluate("document.querySelector('[data-athan-test-alert]').click()");
    await until('window.livePlays===1 && window.liveAudio.currentTime>0');
    assert.equal(await evaluate('window.livePlays'), 1);
    await evaluate("window.dashboardTest.workspace.setViewMode('notes')");
    await until("document.querySelectorAll('[data-study-note]').length===3");
    await fill('input[type=search]', 'ايمان');
    await until("document.querySelectorAll('[data-study-note]').length===2");
    assert.ok(await evaluate(`Boolean(document.querySelector('[data-study-note="${first.id}"]'))`));
    await fill('input[type=search]', '');
    await until("document.querySelectorAll('[data-study-note]').length===3");
    assert.ok(await evaluate(`document.querySelector('[data-study-note="${first.id}"]').textContent.includes('(1)')`));
    await evaluate("window.dashboardTest.capture({content:'[[quran:hafs:2:255|البقرة]]\\n\\nملاحظة — mixed English'})");
    await until("Boolean(document.querySelector('[data-scratchpad-save]:not([disabled])'))");
    await evaluate("document.querySelector('button[aria-label='+JSON.stringify(window.dashboardTest.workspace.t('studyInsertLink'))+']').click()");
    await fill('[data-study-link-picker] input:not([type=checkbox])', '/notes ايمان');
    await until("document.querySelector('[data-study-link-picker] .max-h-44 button')?.textContent.includes('Guidance')");
    await evaluate("document.querySelector('[data-study-link-picker] input[type=checkbox]').click();document.querySelector('[data-study-link-picker] .max-h-44 button').click()");
    await until("document.querySelector('[data-scratchpad-textarea]').value.includes('![[note:')");
    await evaluate("document.querySelector('[data-scratchpad-save]').click()");
    await until('window.electronAPI.studyNotes.list().then(notes=>notes.length===3)');
    assert.equal(notes.list().length, 3);
    assert.ok(notes.list().some(note => note.content.includes('ملاحظة — mixed English')));
    assert.ok(notes.list().some(note => note.content.includes(`![[note:${first.id}|`)));
    await until("!document.querySelector('[data-scratchpad-textarea]')");
    await evaluate("window.dashboardTest.workspace.setCommandPaletteOpen(true)");
    await until("Boolean(document.querySelector('[role=dialog] input[type=search]'))");
    await fill('[role=dialog] input[type=search]', '/notes ايمان');
    await until("document.querySelector('[role=dialog] .max-h-96 button')?.textContent.includes('Guidance')");
    await evaluate("window.dashboardTest.workspace.setCommandPaletteOpen(false)");
    await until("!document.querySelector('[role=dialog]') && document.querySelectorAll('[data-study-note]').length===2");
    await evaluate("[...document.querySelector('[data-notes-overview]').querySelectorAll('button')].find(button=>button.textContent===window.dashboardTest.workspace.t('studyLinkedNotes')).click()");
    await until("document.querySelectorAll('[data-study-note]').length===4");
    await evaluate("document.querySelector('[data-study-note=book-note-test] button[aria-label='+JSON.stringify(window.dashboardTest.workspace.t('studyEdit'))+']').click()");
    await until("Boolean(document.querySelector('[data-scratchpad-textarea]'))");
    await fill('[data-scratchpad-textarea]', 'Updated book note — ملاحظة معدلة');
    await evaluate("document.querySelector('[data-scratchpad-save]').click()");
    await until("!document.querySelector('[data-scratchpad-textarea]')");
    assert.equal(knowledge.getKnowledgeByWork('study-book')[0].location, 'epubcfi(/6/2)');
    assert.equal(knowledge.getKnowledgeByWork('study-book')[0].noteContent, 'Updated book note — ملاحظة معدلة');
    await new Promise(resolve => setTimeout(resolve, 300));
    await fs.writeFile(path.join(directory, 'notes-en.png'), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    for (const lang of ['ar', 'en']) {
      await evaluate(`if(window.dashboardTest.workspace.lang!==${JSON.stringify(lang)})window.dashboardTest.workspace.toggleLanguage();if(window.dashboardTest.workspace.theme!==${JSON.stringify(lang === 'ar' ? 'dark' : 'light')})window.dashboardTest.workspace.toggleTheme()`);
      for (const width of [480, 1280]) {
        owner.setContentSize(width, 1000); await new Promise(resolve => setTimeout(resolve, 200));
        assert.ok(await evaluate("(()=>{const el=document.querySelector('[data-notes-overview]');return el.scrollWidth<=el.clientWidth+1;})()"));
        await fs.writeFile(path.join(directory, `notes-${lang}-${width}.png`), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      }
    }
    assert.deepEqual(await evaluate('window.liveErrors'), []);
    await evaluate("window.dashboardTest.workspace.setViewMode('dashboard')");
    await owner.loadURL(`${url}?widget=companion`);
    await until("Boolean(document.querySelector('[data-companion-widget]'))");
    owner.setContentSize(340, 220);
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.writeFile(path.join(directory, 'companion.png'), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    assert.equal(await evaluate("Boolean(document.querySelector('[data-dashboard-view]'))"), false);
    assert.deepEqual(await evaluate('window.liveErrors'), []);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify({ passed: true, notes: notes.list().length, audioPlayback: true, hydrationErrors: [], rendererErrors: errors, first: first.id, second: second.id }, null, 2));
    console.log(`Dashboard live checks passed: ${directory}`);
  } catch (error) {
    console.error(error);
    console.error('Renderer errors:', errors);
    console.error('Page state:', await evaluate("({text:document.body.textContent.slice(0,1200),errors:window.liveErrors})").catch(String));
    await fs.writeFile(path.join(directory, 'failure.png'), (await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    app.exit(1); return;
  }
  finally { owner.destroy(); server.close(); db.close(); }
  const reopened = new Database(path.join(directory, 'notes.db'));
  assert.equal(new StudyNotesService(new SqliteSettingsRepository(reopened)).list().length, 4); reopened.close(); app.quit();
});
