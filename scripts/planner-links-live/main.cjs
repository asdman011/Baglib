// KEY-236 live audit: study tasks' saved source links open the real installed Quran and Sunnah data, and the month
// grid's leading cells line every date up under the same weekday. Throwaway profile with disposable copies of the
// installed Quran packs (with the mushaf layout) and the merged Sunnah database. ar and en.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_PLANNER_LINKS_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  owner.webContents.on('did-finish-load', () => { owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 220)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(`(async()=>(${code}))()`)) return; } catch { /* retry */ } await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };
  const plannerLabel = language => language === 'ar' ? 'مخطط الدراسة' : 'Study planner';
  const openPlanner = async language => {
    await evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(plannerLabel(language))}).click()`);
    await until("!!document.querySelector('[data-study-planner]')");
    await until("document.querySelectorAll('[data-planner-task]').length>0", 100);
  };
  const clickReference = label => evaluate(`[...document.querySelectorAll('[data-planner-task] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
  (async () => {
    const results = {};
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.planner');
    const today = new Date(); const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await evaluate(`window.electronAPI.planner.save({title:'مراجعة — Review',description:'',status:'open',startDate:${JSON.stringify(day)},dueDate:${JSON.stringify(day)},priority:2,sortOrder:0,references:[{target:'quran:hafs:2:255',label:'آية الكرسي'},{target:'sunnah:Bukhari:1:Bukhari:1:1',label:'حديث النيات'}]})`);
    for (const language of ['ar', 'en']) {
      const result = {};
      await load(language);
      await openPlanner(language);
      // Month grid: every date in one column falls on the same weekday (leading cells right in RTL and LTR).
      result.grid = await evaluate(`(()=>{const cells=[...document.querySelectorAll('[data-study-planner] .grid-cols-7 > button time')].map(t=>({date:t.getAttribute('datetime'),x:Math.round(t.closest('button').getBoundingClientRect().left)}));const columns={};for(const c of cells){const wd=new Date(c.date+'T12:00:00').getDay();(columns[c.x]??=new Set()).add(wd);}return {cells:cells.length,columns:Object.keys(columns).length,mixed:Object.values(columns).filter(s=>s.size>1).length,dir:document.querySelector('[data-study-planner]').getAttribute('dir'),firstColumnX:cells.length?cells[0].x:null};})()`);
      await shot(`month-${language}`);
      // Quran link → the Quran reader at Al-Baqarah 255 (page 42 of the Madinah mushaf).
      await clickReference('آية الكرسي');
      await until("!!document.querySelector('[data-quran-mushaf]')", 200);
      await until("[...document.querySelectorAll('input[type=number]')].some(i=>i.value==='42')", 150);
      result.quranPage = 42;
      await shot(`quran-link-${language}`);
      await openPlanner(language);
      // Hadith link → Sahih al-Bukhari, book 1, hadith 1 with its real text.
      await clickReference('حديث النيات');
      await until("!!document.querySelector('[data-hadith-id=\"Bukhari:1:1\"]')", 200);
      result.hadithText = await evaluate("document.querySelector('[data-hadith-id=\"Bukhari:1:1\"]').textContent.slice(0,1200)");
      await shot(`hadith-link-${language}`);
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.ok(result.grid.cells >= 28, 'a full month of day cells');
      assert.equal(result.grid.columns, 7, 'seven weekday columns');
      assert.equal(result.grid.mixed, 0, 'each column holds one weekday');
      assert.equal(result.grid.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.match(result.hadithText, /إِنَّمَا الأَعْمَالُ|إنما الأعمال/u, 'the real text of Bukhari 1');
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught/iu.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => app.exit(1)); });
});
require('../../dist/main/index.js');
