const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_EXPORT_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
// The folder picker is the one step a script cannot click: answer it with a folder inside the throwaway profile.
const picked = path.join(directory, 'picked');
fs.mkdirSync(picked, { recursive: true });
let pickerCalls = 0;
dialog.showOpenDialog = async () => { pickerCalls++; return { canceled: false, filePaths: [picked] }; };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const NOTES = [
  { id: 'exp-a', title: 'الصبر: ضياء', content: 'الصبر ضياء ^p1\n\nانظر [[note:exp-b|الشكر]] و[[quran:hafs:2:153|البقرة 2:153]] [[book:exp-book#p=4|رياض الصالحين (4)]]', tags: ['أخلاق'] },
  { id: 'exp-b', title: 'Gratitude', content: 'Thanks. Back to [[note:exp-a#^p1|patience paragraph]]', tags: [] },
  { id: 'exp-c', title: 'Gratitude', content: 'Same title, second note.', tags: [] },
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
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate(`document.querySelector('[data-nav-item=notes]').click()`);
    await until("document.querySelectorAll('[data-study-note]').length>=3");
  };
  const exportedFolders = () => fs.readdirSync(picked).sort();
  const newFolder = before => exportedFolders().find(name => !before.includes(name));
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    await evaluate("window.electronAPI.addBook({id:'exp-book',title:'رياض الصالحين',author:'',workType:'book',bookType:'physical'})");
    for (const note of NOTES) await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({ ...note, aliases: [], expectedRevision: 0 })})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      result.buttonText = await evaluate("document.querySelector('[data-notes-export-markdown]').textContent");
      result.dir = await evaluate("document.querySelector('[data-notes-overview]').getAttribute('dir')");
      const before = exportedFolders();
      await evaluate("document.querySelector('[data-notes-export-markdown]').click()");
      await until("!!document.querySelector('[data-notes-format-go]')");
      await evaluate("document.querySelector('[data-notes-format-go]').click()");
      await until("!!document.querySelector('[data-notes-exported]')");
      result.status = await evaluate("document.querySelector('[data-notes-exported]').textContent");
      const folder = newFolder(before);
      result.folder = folder;
      result.files = fs.readdirSync(path.join(picked, folder)).sort();
      result.patience = fs.readFileSync(path.join(picked, folder, 'الصبر ضياء.md'), 'utf8');
      const linked = result.files.find(name => result.patience.includes(`[[${name.slice(0, -3)}|`));
      result.gratitude = fs.readFileSync(path.join(picked, folder, linked), 'utf8');
      await shot(`export-${language}-1280`);
      // A search narrows the export to the notes shown.
      await evaluate("(() => { const input = document.querySelector('[data-notes-overview] input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'Same title'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
      await until("document.querySelectorAll('[data-study-note]').length===1");
      result.filteredButton = await evaluate("document.querySelector('[data-notes-export-markdown]').textContent");
      const beforeFiltered = exportedFolders();
      await evaluate("document.querySelector('[data-notes-export-markdown]').click()");
      await until("!!document.querySelector('[data-notes-format-go]')");
      await evaluate("document.querySelector('[data-notes-format-go]').click()");
      await until("(document.querySelector('[data-notes-exported]')?.textContent || '').includes('(1)')");
      result.filteredFiles = fs.readdirSync(path.join(picked, newFolder(beforeFiltered)));
      owner.setContentSize(420, 900);
      await shot(`export-${language}-420`);
      result.horizontalOverflow = await evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth');
      results[language] = result; console.log(JSON.stringify({ language, result }, null, 1));
      assert.equal(result.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.deepEqual(result.files, ['Gratitude (2).md', 'Gratitude.md', 'الصبر ضياء.md']);
      assert.match(result.patience, /^---\nbaglib_id: "exp-a"\ntitle: "الصبر: ضياء"\ntags:\n {2}- "أخلاق"\n/u);
      assert.ok(result.patience.includes('الصبر ضياء ^p1'));
      assert.ok(result.patience.includes('[البقرة 2:153](<baglib:quran:hafs:2:153>)'));
      assert.ok(result.patience.includes('[رياض الصالحين (4)](<baglib:book:exp-book#p=4>)'));
      assert.ok(result.gratitude.includes('[[الصبر ضياء#^p1|patience paragraph]]'));
      assert.deepEqual(result.filteredFiles.length, 1);
      assert.ok(result.buttonText.includes("(3)"));
      assert.ok(result.status.includes('(3)'));
      assert.equal(result.horizontalOverflow, false);
    }
    assert.notEqual(results.ar.folder, results.en.folder, 'each export uses a new folder');
    assert.equal(pickerCalls, 4);
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
