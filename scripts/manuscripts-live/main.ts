import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/database/migrator';
import { migrations } from '../../src/main/database/migrations';
import { getDatabase, closeDatabase } from '../../src/main/database/connection';
import { registerManuscriptIpc } from '../../src/main/ipc/manuscripts';
import { normalizeArabicText } from '../../src/shared/utils/text-normalizer';
import { translations } from '../../src/renderer/translations';
import type { Manuscript, ManuscriptDocument } from '../../src/shared/manuscripts';
const directory = process.env.BAGLIB_KEY364_DIR!;
const evidence = process.env.BAGLIB_KEY364_EVIDENCE!;
assert.equal(path.dirname(directory), fs.realpathSync('.baglib-data'));
app.setPath('userData', directory);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hash = (filename: string) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
function priorTables(db: Database.Database) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_migrations' ORDER BY name").all() as { name: string }[];
  return tables.map(({ name }) => {
    const digest = createHash('sha256'); let rows = 0;
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    for (const row of db.prepare(`SELECT * FROM ${quoted}`).iterate()) { digest.update(JSON.stringify(row)); rows++; }
    return { name, rows, hash: digest.digest('hex') };
  });
}
void app.whenReady().then(async () => {
  const errors: string[] = [];
  let win: BrowserWindow | undefined;
  try {
    fs.rmSync(path.join(evidence, 'failure.txt'), { force: true });
    fs.mkdirSync(path.join(directory, 'data'), { recursive: true });
    const sourcePath = path.resolve(process.env.BAGLIB_KEY364_SOURCE_DB!);
    assert.notEqual(sourcePath, path.join(directory, 'data/baglib.db'));
    const sourceHashes = ['','-wal'].filter(suffix => fs.existsSync(sourcePath + suffix)).map(suffix => ({ file: sourcePath + suffix, hash: hash(sourcePath + suffix) }));
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    await source.backup(path.join(directory, 'data/baglib.db')); source.close();
    const db = getDatabase(), before = priorTables(db);
    const applied = runMigrations(db, migrations);
    assert.ok(applied > 0, 'copy must require migration029');
    assert.deepEqual(priorTables(db).filter(row => before.some(old => old.name === row.name)), before, 'all prior table rows intact');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    for (const file of sourceHashes) assert.equal(hash(file.file), file.hash, 'real database unchanged');
    const migrationResult = { source: sourcePath, applied, priorTables: before, integrity: db.pragma('integrity_check'), originalUnchanged: true };
    fs.writeFileSync(path.join(evidence, 'migration-copy.json'), JSON.stringify(migrationResult, null, 2));

    const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8')) as { files: { path: string; lang: string; kind: string; textLayer?: string }[] };
    const realFiles: { path: string; lang: string; hash: string; sample: string; query: string }[] = [];
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    for (const lang of ['ar','en']) {
      const file = manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes')!;
      const filename = path.resolve('tests/real-files', file.path), originalHash = hash(filename);
      const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(filename)), useSystemFonts: true, isEvalSupported: false });
      const pdf = await task.promise;
      let sample = '';
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        sample += content.items.map(item => 'str' in item ? item.str : '').join(' ').normalize('NFKC') + '\n';
        if (sample.length > 400 && (normalizeArabicText(sample).match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).some(word => (lang === 'ar' ? /^[\u0621-\u064A]{3,}$/u : /^[a-z]{5,}$/u).test(word))) break;
      }
      await task.destroy();
      const words = (normalizeArabicText(sample).match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).filter(word => (lang === 'ar' ? /^[\u0621-\u064A]{3,}$/u : /^[a-z]{5,}$/u).test(word));
      fs.writeFileSync(path.join(evidence, 'text-probe-'+lang+'.json'), JSON.stringify({sample:sample.slice(0,2000),words:words.slice(0,20)},null,2));
      assert.ok(words?.length, 'real searchable text ' + lang);
      realFiles.push({ path: filename, lang, hash: originalHash, sample, query: words![0] });
    }
    registerManuscriptIpc();
    win = new BrowserWindow({ width: 1450, height: 1050, show: false, webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
    const evaluate = (code: string) => win!.webContents.executeJavaScript(code, true);
    const until = async (code: string) => {
      for (let i = 0; i < 160; i++) { try { if (await evaluate(code)) return; } catch { /* mounting */ } await pause(80); }
      throw Error('Timeout ' + code + '\n' + await evaluate('document.body.innerText'));
    };
    const input = async (selector: string, value: string) => {
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await pause(100);
    };
    const click = async (selector: string) => {
      await until(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled && !document.querySelector('fieldset:disabled')`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(130);
    };
    const button = async (selector: string, text: string) => {
      await until(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(el=>el.textContent===${JSON.stringify(text)}&&!el.disabled) && !document.querySelector('fieldset:disabled')`);
      await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el=>el.textContent===${JSON.stringify(text)}).click()`); await pause(130);
    };
    const select = async (selector: string, value: string) => {
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause(150);
    };
    await win.loadFile(path.join(directory, 'index.html'));
    fs.writeFileSync(path.join(evidence, 'inputs.json'), JSON.stringify(realFiles.map(file => ({ path: file.path, lang: file.lang, hash: file.hash, query: file.query })), null, 2));
    const results = [];
    for (const lang of ['ar','en'] as const) {
      const t = translations[lang];
      await until('!!window.manuscriptHarness'); await evaluate(`window.manuscriptHarness.setLanguage('${lang}')`);
      await until(`document.documentElement.lang==='${lang}'`);
      assert.equal(await evaluate('document.documentElement.dir'), lang === 'ar' ? 'rtl' : 'ltr');
      const name = lang === 'ar' ? 'مَخطوط — Research 364' : 'Research — مَخطوط 364';
      await input(`input[aria-label="${t.manuscriptNew}"]`, name);
      await button('button', t.manuscriptCreate);
      await until('!!document.querySelector("[data-manuscript-tree]")');
      const manuscript = (await evaluate('window.electronAPI.manuscripts.list()') as Manuscript[]).find(item => item.title === name)!;
      assert.ok(manuscript);
      const row = `[data-manuscript-id="${manuscript.id}"]`;
      await button(row + ' button', t.manuscriptRename);
      await input(`input[aria-label="${t.manuscriptName}"]`, name + ' — v2'); await button('button', t.manuscriptSaveName);
      const create = async (title: string) => {
        await input(`input[aria-label="${t.manuscriptChapterNew}"]`, title); await button('button', t.manuscriptChapterCreate);
        await until(`window.electronAPI.manuscripts.documents('${manuscript.id}').then(rows=>rows.some(row=>row.title===${JSON.stringify(title)}))`);
        return (await evaluate(`window.electronAPI.manuscripts.documents('${manuscript.id}')`) as ManuscriptDocument[]).find(doc => doc.title === title)!;
      };
      const part = await create('جُزء — Part'), chapter = await create('فَصل — Chapter'), section = await create('قِسم — Section');
      const docRow = (id: string) => `[data-document-id="${id}"] > .manuscript-row`;
      await select(docRow(chapter.id) + ' select', part.id);
      await select(docRow(section.id) + ' select', chapter.id);
      await until(`document.querySelector('[data-document-id="${section.id}"]').getAttribute('data-level')==='3'`);
      const top = await create('ثانٍ — Second');
      await click(docRow(top.id) + ` button[aria-label="${t.manuscriptUp}"]`);
      assert.equal((await evaluate(`window.electronAPI.manuscripts.document('${top.id}')`)).position, 0);
      await button(docRow(section.id) + ' button', t.manuscriptRename);
      await input(`input[aria-label="${t.manuscriptName}"]`, 'قِسم مُنقّح — Revised'); await button('button', t.manuscriptSaveName);
      const text = realFiles.map(file => file.sample).join('\n\n');
      const snapshot = JSON.stringify({ id: chapter.id, blocks: { id: 'page', flavour: 'affine:page', props: { title: { delta: [{ insert: chapter.title }], '$blocksuite:internal:text$': true } }, children: [{ id: 'paragraph', flavour: 'affine:paragraph', props: { text: { delta: [{ insert: text, attributes: { footnote: { type: 'url', url: 'quran:hafs:2:255' } } }], '$blocksuite:internal:text$': true } }, children: [] }] } }, null, 2);
      for (let i = 0; i < 10; i++) await evaluate(`window.electronAPI.manuscripts.save(${JSON.stringify({ id: chapter.id, snapshot })})`);
      assert.equal((await evaluate(`window.electronAPI.manuscripts.history('${chapter.id}')`)).length, 0);
      assert.equal(await evaluate(`window.electronAPI.manuscripts.checkpoint('${chapter.id}')`), true);
      assert.equal(await evaluate(`window.electronAPI.manuscripts.checkpoint('${chapter.id}')`), false);
      assert.equal((await evaluate(`window.electronAPI.manuscripts.history('${chapter.id}')`)).length, 1);
      const queries = [];
      for (const file of realFiles) {
        const hits = await evaluate(`window.electronAPI.manuscripts.search(${JSON.stringify(file.query)},'${manuscript.id}')`) as ManuscriptDocument[];
        assert.equal(hits.some(doc => doc.id === chapter.id), true, 'real-file FTS '+file.lang+' '+file.query); queries.push({ lang: file.lang, query: file.query, hits: hits.length });
      }
      const changed = snapshot.replace(text.slice(0, 10), 'replacement');
      // Add an independent property so the changed snapshot is always distinct without altering real-file samples.
      const edited = JSON.parse(changed); edited.blocks.props.caption = 'Changed draft';
      await evaluate(`window.electronAPI.manuscripts.save(${JSON.stringify({ id: chapter.id, snapshot: JSON.stringify(edited) })})`);
      const restored = await evaluate(`window.electronAPI.manuscripts.restoreVersion('${chapter.id}',1)`);
      assert.equal(restored.snapshot, snapshot);
      assert.equal((await evaluate(`window.electronAPI.manuscripts.history('${chapter.id}')`)).length, 3);
      await win.loadFile(path.join(directory, 'index.html')); await until('!!window.manuscriptHarness');
      await evaluate(`window.manuscriptHarness.setLanguage('${lang}')`); await pause(150);
      await click(row + ' .manuscript-name');
      assert.equal((await evaluate(`window.electronAPI.manuscripts.document('${chapter.id}')`)).snapshot, snapshot);
      await click(docRow(chapter.id) + ` button[aria-label="${t.manuscriptTrash}"]`);
      await until(`!!document.querySelector('[data-deleted-document-id="${chapter.id}"]') && !document.querySelector('[data-document-id="${section.id}"]')`);
      assert.equal((await evaluate(`window.electronAPI.manuscripts.search(${JSON.stringify(realFiles[0].query)},'${manuscript.id}')`)).length, 0);
      await button(`[data-deleted-document-id="${chapter.id}"] button`, t.manuscriptRestore);
      await until(`!!document.querySelector('[data-document-id="${section.id}"]')`);
      await button(row + ' button', t.manuscriptTrash); await until(`!document.querySelector('${row}')`);
      await click('[data-manuscripts-trash-toggle]'); await button(row + ' button', t.manuscriptRestore);
      await click('[data-manuscripts-trash-toggle]'); await click(row + ' .manuscript-name');
      await until(`!!document.querySelector('[data-document-id="${section.id}"]')`);
      await click(docRow(chapter.id) + ' .manuscript-name'); await until('!!document.querySelector("[data-preview]")');
      for (const width of [1450, 720]) {
        win.setContentSize(width, 1050); await pause(220);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), true, 'no horizontal overflow '+lang+' '+width);
        fs.writeFileSync(path.join(evidence, `${lang}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
      results.push({ lang, manuscriptId: manuscript.id, chapterId: chapter.id, queries, autosaves: 10, initialCheckpointRows: 1, afterRestoreRows: 3 });
    }
    assert.deepEqual(errors, []);
    for (const file of realFiles) assert.equal(hash(file.path), file.hash, 'real PDF unchanged');
    for (const file of sourceHashes) assert.equal(hash(file.file), file.hash, 'real database unchanged after live checks');
    fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, errors, realFiles: realFiles.map(file => ({ path: file.path, lang: file.lang, hash: file.hash, query: file.query })), originalsUnchanged: true, extraction: 'PDF.js text compatibility-normalized (NFKC) in the test extractor to decode presentation-form glyphs. No normalization in canonical manuscript storage.' }, null, 2));
    win.destroy(); closeDatabase(); console.log('PASS KEY-364 native ar/en 2/2, migration copy, real PDF text, originals unchanged'); app.exit(0);
  } catch (error) {
    console.error(error); fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error)); win?.destroy(); closeDatabase(); app.exit(1);
  }
});
