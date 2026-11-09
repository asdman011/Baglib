const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const profile = process.env.BAGLIB_DEEPLINK_PROFILE;
const evidence = process.env.BAGLIB_DEEPLINK_EVIDENCE;
const language = process.env.BAGLIB_DEEPLINK_LANG;
const target = process.env.BAGLIB_DEEPLINK_TARGET;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
// Assert the real main never even attempts OS registration in this unpackaged harness.
app.setAsDefaultProtocolClient = () => { throw new Error('Harness must never register a protocol'); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let exportCounter = 0;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [profile] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(profile, `export-${++exportCounter}.docx`) });
let started = false;
if (!process.argv.includes('--deeplink-secondary')) app.on('browser-window-created', (_, win) => {
  if (started) return; started = true;
  win.webContents.on('console-message', (_e,_l,message) => { if(_l>=3) console.log(message); });
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async (code, tries = 250) => {
    for (let i = 0; i < tries; i++) { try { if (await evaluate(code)) return; } catch {} await pause(200); }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => { await pause(600); fs.writeFileSync(path.join(evidence, `${language}-${name}.png`), (await win.webContents.capturePage()).toPNG()); };
  const second = async url => {
    const code = await new Promise(resolve => {
      const child = spawn(process.execPath, [path.resolve('scripts/deeplink-live/main.cjs'), '--deeplink-secondary', `--user-data-dir=${profile}`, url], { env: process.env, stdio: 'ignore', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 15_000);
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 0, 'Second instance exits through real lock');
  };
  const note = () => until(`!!document.querySelector('[data-study-note="link-note"]') && document.querySelectorAll('[data-study-note]').length===1`);
  const book = async () => { await until("!!document.querySelector('.textLayer span')"); await until("window.electronAPI.reader.getLastLocation('link-book').then(p=>p==='3')"); };
  const quran = () => until("!!document.querySelector('[data-quran-reader]') && [...document.querySelectorAll('input')].some(el=>el.value==='42') && document.querySelector('[data-quran-study-panel]')?.textContent.includes('2:255')");
  (async () => {
    win.setContentSize(1280, 900); win.show(); win.focus(); win.webContents.focus();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    if (target === 'seed') {
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)})`);
      await evaluate(`window.electronAPI.addBook({id:'link-book',title:'كِتَاب — Book',author:'',workType:'book',bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(path.join(profile,'pages.pdf'))}})`);
      const existing = await evaluate("window.electronAPI.studyNotes.list().then(notes=>notes.some(n=>n.id==='link-note'))");
      if (!existing) {
        await evaluate("window.electronAPI.studyNotes.save({id:'link-note',title:'تَأَمُّل — Reflection',content:'وَالصَّبْرُ ضِيَاءٌ — Patience is light. ^para\\n\\n[[book:link-book#p=3|الصفحة الثالثة]]',aliases:['Patience'],tags:['تأمل']})");
        await evaluate("window.electronAPI.studyNotes.save({id:'other-note',title:'Other note',content:'Must not export',aliases:[],tags:[]})");
        await evaluate("window.electronAPI.knowledge.save({id:'reader-note',workId:'link-book',knowledgeType:'note',location:'1',noteContent:'ملاحظة القارئ — Reader note'})");
      }
    } else {
      if (target.startsWith('book:')) await book();
      else if (target.startsWith('quran:')) await quran();
      else {
        await note();
        await until("!!document.querySelector('[data-paragraph-focused]')");
        for (const width of [1280, 480]) {
          win.setContentSize(width, 900); await pause(700);
          await evaluate("document.querySelector('[data-note-export-menu]').open=true");
          await evaluate("document.querySelector('[data-note-export-menu]').scrollIntoView({block:'center'})");
          assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
          assert.equal(await evaluate("document.querySelector('[data-notes-overview]').dir"), language === 'ar' ? 'rtl' : 'ltr');
          await shot(`card-${width}`);
        }
        win.setContentSize(1280,900);
        // Card and bulk paths write one file, with equivalent content; native dialogs select only the throwaway profile.
        await evaluate("document.querySelector('[data-note-export-markdown]').click()");
        await until("!!document.querySelector('[data-notes-exported]')");
        const cardMd = await evaluate("document.querySelector('[data-notes-exported] bdi').textContent");
        await evaluate("document.querySelector('[data-notes-export-markdown]').click()");
        await until(`document.querySelector('[data-notes-exported] bdi')?.textContent!==${JSON.stringify(cardMd)}`);
        const bulkMd = await evaluate("document.querySelector('[data-notes-exported] bdi').textContent");
        const files = fs.readdirSync(cardMd); assert.equal(files.length,1); assert.ok(files[0].endsWith('.md'));
        assert.equal(fs.readFileSync(path.join(cardMd,files[0]),'utf8'),fs.readFileSync(path.join(bulkMd,fs.readdirSync(bulkMd)[0]),'utf8'));
        await evaluate("document.querySelector('[data-note-export-word]').click()");
        await until("!!document.querySelector('[data-word-note=\"link-note\"]')");
        await evaluate("document.querySelector('[data-word-go]').click()");
        await until("!!document.querySelector('[data-notes-word-exported]')");
        const cardWord = await evaluate("document.querySelector('[data-notes-word-exported] bdi').textContent");
        await evaluate("document.querySelector('[data-notes-export-word]').click()");
        await evaluate("document.querySelector('[data-word-go]').click()");
        await until(`document.querySelector('[data-notes-word-exported] bdi')?.textContent!==${JSON.stringify(cardWord)}`);
        const bulkWord = await evaluate("document.querySelector('[data-notes-word-exported] bdi').textContent");
        const { unzipSync } = require('fflate');
        const xml = file => new TextDecoder().decode(unzipSync(fs.readFileSync(file))['word/document.xml']).replace(/w:id="\d+"/gu, 'w:id="ID"');
        assert.equal(xml(cardWord),xml(bulkWord)); assert.ok(!xml(cardWord).includes('Must not export'));
        // Real single-instance dispatch for all required target kinds, plus missing-note notice.
        console.log('Checking second-instance book'); win.minimize(); await second('baglib:book:link-book#p=3'); await book();
        assert.equal(win.isMinimized(),false); assert.equal(win.isFocused(),true);
        await second('baglib:book:link-book#p=1'); await until("window.electronAPI.reader.getLastLocation('link-book').then(p=>p==='1')");
        await second('baglib:book:link-book#p=3'); await book();
        console.log('Checking second-instance Quran'); await second('baglib:quran:hafs:2:255'); await quran();
        await second('baglib:note:link-note'); await note();
        let prevented=false; app.emit('open-url',{preventDefault(){prevented=true;}},'baglib://note%3Alink-note'); assert.equal(prevented,true); await note();
        await second('baglib:note:deleted-note'); await until("!!document.querySelector('[data-study-link-missing]')");
        win.setContentSize(480,900); await shot('missing-480');
        await evaluate("document.querySelector('[data-study-link-dismiss]').click()");
        await until("!document.querySelector('[data-study-link-missing]')");
        await shot('dismissed-480');
        await second('baglib:note:another-deleted-note'); await until("!!document.querySelector('[data-study-link-missing]')");
        await second('baglib:note:reader-note'); await until("!!document.querySelector('[data-study-note=\"reader-note\"]')");
        await evaluate("document.querySelector('[data-note-export-menu]').open=true;document.querySelector('[data-note-export-markdown]').click()");
        await until("!!document.querySelector('[data-notes-exported]')");
        const readerMd = await evaluate("document.querySelector('[data-notes-exported] bdi').textContent");
        assert.equal(fs.readdirSync(readerMd).length,1);
        assert.match(fs.readFileSync(path.join(readerMd,fs.readdirSync(readerMd)[0]),'utf8'), /Reader note/u);
      }
      await shot(`cold-${target.split(':')[0]}-1280`);
    }
    fs.writeFileSync(path.join(evidence,`${language}-${target.split(':')[0]}.json`),JSON.stringify({passed:true,target,language}));
    console.log(JSON.stringify({passed:true,target,language})); app.quit();
  })().catch(async error => { console.error(error); fs.writeFileSync(path.join(evidence,'failure.txt'),String(error.stack)); fs.writeFileSync(path.join(evidence,'failure-dom.html'), await evaluate('document.body.innerHTML').catch(()=>'')); await shot('failure').catch(()=>{}); app.exit(1); });
});
require('../../dist/main/index.js');
