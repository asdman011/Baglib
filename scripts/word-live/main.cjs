const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_WORD_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
// The save dialog is the one step a script cannot click: answer it with a file inside the throwaway profile.
const picked = path.join(directory, 'picked');
fs.mkdirSync(picked, { recursive: true });
let saveTarget = '';
dialog.showSaveDialog = async (...args) => { const options = args[args.length - 1]; saveTarget = path.join(picked, path.basename(options.defaultPath)); return { canceled: false, filePath: saveTarget }; };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
/** word/document.xml from a .docx, read through the zip's central directory. */
const documentXml = file => {
  const zip = fs.readFileSync(file);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < zip.readUInt16LE(end + 10); index++) {
    const method = zip.readUInt16LE(offset + 10), size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    if (zip.toString('utf8', offset + 46, offset + 46 + nameLength) === 'word/document.xml') {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error('no document.xml');
};
const NOTES = [
  { id: 'word-a', title: 'الصبر', content: '# باب الصبر\nالصبر **ضياء** ^p1\n\n- [[supports::note:word-b|Gratitude]]\n- [[quran:hafs:2:153|البقرة 2:153]]\n\n> إنما الصبر عند الصدمة الأولى', tags: ['أخلاق'] },
  { id: 'word-b', title: 'Gratitude', content: 'Thanks is the twin of patience. See [[explains::note:word-a#^p1|الصبر ضياء]].', tags: [] },
];
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(500); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    // KEY-317: localStorage needs a page of this origin first.
    await owner.loadURL('http://localhost:3000'); await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate("document.querySelector('[data-nav-item=\"notes\"]').click()");
    await until("document.querySelectorAll('[data-study-note]').length>=2");
  };
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    for (const note of NOTES) await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ ...note, aliases: [], expectedRevision: 0 })})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      result.buttonText = await evaluate("document.querySelector('[data-notes-export-word]').textContent");
      await evaluate("document.querySelector('[data-notes-export-word]').click()");
      // The options open first: A5 with wide margins and a table of contents.
      await until("!!document.querySelector('[data-word-options]')");
      const pick = (selector, value) => evaluate(`(() => { const select = document.querySelector('${selector}'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(select, '${value}'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await pick('[data-word-page]', 'a5'); await pick('[data-word-margins]', 'wide');
      result.contentsChecked = await evaluate("document.querySelector('[data-word-contents]').checked");
      await shot(`word-options-${language}`);
      await evaluate("document.querySelector('[data-word-go]').click()");
      await until("!!document.querySelector('[data-notes-word-exported]')");
      result.status = await evaluate("document.querySelector('[data-notes-word-exported]').textContent");
      result.file = path.basename(saveTarget);
      const xml = documentXml(saveTarget);
      result.size = fs.statSync(saveTarget).size;
      result.hasTitle = xml.includes(language === 'ar' ? 'ملاحظات بغلب' : 'BagLib notes');
      result.relationWords = [language === 'ar' ? 'يؤيد' : 'supports', language === 'ar' ? 'يشرح' : 'explains'].map(word => xml.includes(word));
      result.internalLinks = (xml.match(/<w:hyperlink[^>]*w:anchor="note_\d"/gu) || []).length;
      result.page = /<w:pgSz[^>]*w:w="(\d+)"/u.exec(xml)?.[1];
      result.sideMargin = /<w:pgMar[^>]*w:left="(\d+)"/u.exec(xml)?.[1];
      result.contents = xml.includes(language === 'ar' ? 'المحتويات' : 'Contents');
      result.bookmarks = (xml.match(/<w:bookmarkStart/gu) || []).length;
      result.rtlParagraphs = (xml.match(/<w:bidi\/>/gu) || []).length;
      result.leaks = ['^p1', 'quran:hafs', 'note:word-'].filter(text => xml.includes(text));
      await shot(`word-${language}-1280`);
      results[language] = result; console.log(JSON.stringify({ language, result }, null, 1));
      assert.ok(result.buttonText.includes('(2)'));
      assert.ok(result.status.includes('(2)'));
      assert.equal(result.file, `${language === 'ar' ? 'ملاحظات بغلب' : 'BagLib notes'} ${new Date().toISOString().slice(0, 4)}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}.docx`);
      assert.equal(result.hasTitle, true);
      assert.deepEqual(result.relationWords, [true, true]);
      // Two links in the text, plus one per note in the table of contents.
      assert.equal(result.internalLinks, 4);
      assert.equal(result.contentsChecked, true);
      assert.equal(result.page, '8391');
      assert.equal(result.sideMargin, '2880');
      assert.equal(result.contents, true);
      assert.equal(result.bookmarks, 2);
      assert.ok(result.rtlParagraphs >= 4);
      assert.deepEqual(result.leaks, []);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
