const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const directory = process.env.BAGLIB_PLANNER_LIVE_DIR;
app.setPath('userData', directory);
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
let started = false;
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));

app.on('browser-window-created', (_, window) => {
  if (started) return;
  started = true;
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  window.webContents.on('did-finish-load', () => { window.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const waitFor = async code => {
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(400);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const run = async () => {
    await waitFor('!!window.electronAPI?.planner && !!document.querySelector("footer")');
    const fixture = new Database(path.join(directory, 'data', 'baglib.db'));
    fixture.prepare("INSERT INTO work(id,title) VALUES ('wave3-qa','Wave 3 QA')").run();
    fixture.prepare("INSERT INTO reading_session(id,work_id,started_at,ended_at,pages_read) VALUES ('wave3-session','wave3-qa',datetime('now','-1 hour'),datetime('now'),12)").run();
    fixture.prepare("INSERT INTO book_content_fts(book_id,page_number,content) VALUES ('wave3-qa',1,'العِلْمُ العلم BOOK book')").run();
    fixture.close();
    const results = [];
    for (const language of ['ar', 'en']) {
      await evaluate(`localStorage.setItem('baglib-lang','${language}'); localStorage.setItem('baglib-theme','${language === 'ar' ? 'dark' : 'light'}');`);
      await window.loadURL('http://localhost:3000');
      await waitFor('!!window.electronAPI?.planner && !!document.querySelector("footer")');
      await pause(5000);
      const insights = await evaluate('window.electronAPI.studyInsights.summary()');
      assert.equal(insights.seconds, 3600);
      assert.equal(insights.timeSource, 'sessions');
      await evaluate(`window.electronAPI.studyInsights.savePreferences({dailyMinutes:20,dailyPages:4,taskOrder:[]})`);
      assert.equal((await evaluate('window.electronAPI.studyInsights.preferences()')).dailyMinutes, 20);
      const words = await evaluate("window.electronAPI.studyInsights.words('wave3-qa')");
      assert.ok(words.words.some(item => item.word === 'العلم' && item.count === 2));
      const title = language === 'ar' ? 'مُراجعة القرآن — Planner QA' : 'Study review — مُراجعة';
      await evaluate(`window.electronAPI.planner.save({title:${JSON.stringify(title)},description:'QA canonical النص',status:'open',startDate:'2026-11-01',dueDate:'2026-11-03',priority:2,sortOrder:0,references:[{target:'quran:hafs:2:1',label:'البقرة',scope:'surah'}]})`);
      await evaluate(`Array.from(document.querySelectorAll('[data-nav-item]')).find(button=>button.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'مخطط الدراسة' : 'Study planner')})?.click()`);
      await waitFor('!!document.querySelector("[data-study-planner]") && document.querySelectorAll("[data-planner-task]").length > 0');
      assert.equal(await evaluate(`document.querySelector('[data-study-planner]').dir`), language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-planner-task]')).some(element=>element.textContent.includes(${JSON.stringify(title)}))`), true);
      await evaluate(`document.querySelector('[data-planner-task] input[type=checkbox]').click()`);
      await waitFor(`Array.from(document.querySelectorAll('[data-planner-task] input[type=checkbox]')).some(element=>element.checked)`);
      for (const period of ['week', 'month', 'year']) {
        for (const calendar of ['gregorian', 'hijri']) {
          await evaluate(`(() => {const controls=document.querySelectorAll('[data-study-planner] select'); controls[0].value='${calendar}'; controls[0].dispatchEvent(new Event('change',{bubbles:true})); controls[1].value='${period}'; controls[1].dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await pause(150);
          assert.equal(await evaluate(`document.querySelectorAll('[data-study-planner] time').length > 0`), true);
          for (const width of [480, 1200]) {
            window.setContentSize(width, 800);
            await pause(100);
            assert.equal(await evaluate(`(() => {const panel=document.querySelector('[data-study-planner]');return panel.scrollWidth<=panel.clientWidth+1;})()`), true, `planner overflow: ${language}/${calendar}/${period}/${width}`);
          }
        }
      }
      await evaluate(`(() => {const field=document.querySelector('[data-study-planner] form input:not([type])'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(field,${JSON.stringify(title + ' form')}); field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await pause(150);
      await evaluate(`document.querySelector('[data-study-planner] form').requestSubmit()`);
      await waitFor(`Array.from(document.querySelectorAll('[data-planner-task]')).some(element=>element.textContent.includes(${JSON.stringify(title + ' form')}))`);
      const saved = await evaluate('window.electronAPI.planner.list()');
      assert.ok(saved.some(task => task.title === title + ' form'));
      const screenshot = await window.webContents.capturePage();
      fs.writeFileSync(path.join(directory, `${language}.png`), screenshot.toPNG());
      const before = await evaluate('document.querySelector("[data-study-planner]").textContent');
      await evaluate(`(async () => {
        const snapshot = await window.electronAPI.athan.getState();
        const parts = new Intl.DateTimeFormat('en-GB',{timeZone:snapshot.coordinates.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
        await window.electronAPI.settings.set('dashboard.study.rhythm.v1',{enabled:true,prayers:false,minutes:2,zikr:parts,wird:'',launch:false,intentionAr:'',intentionEn:''});
        window.dispatchEvent(new Event('baglib:study-rhythm-changed'));
      })()`);
      await waitFor('document.querySelector("[data-study-snooze]")?.open');
      assert.equal(await evaluate('document.documentElement.dataset.studyPaused'), 'true');
      assert.equal(await evaluate('document.querySelector("[data-study-planner]").textContent'), before);
      await evaluate('document.querySelector("[data-study-snooze] button").click()');
      await waitFor('!document.querySelector("[data-study-snooze]").open');
      assert.equal(await evaluate('document.documentElement.dataset.studyPaused'), 'false');
      await evaluate(`(async () => {const saved=await window.electronAPI.settings.get('dashboard.study.rhythm.v1'); await window.electronAPI.settings.set('dashboard.study.rhythm.v1',{...saved,enabled:false}); window.dispatchEvent(new Event('baglib:study-rhythm-changed'));})()`);
      await window.loadURL('http://localhost:3000');
      await waitFor('!!window.electronAPI?.planner && !!document.querySelector("footer")');
      assert.ok((await evaluate('window.electronAPI.planner.list()')).some(task => task.title === title + ' form'));
      await evaluate(`window.electronAPI.settings.set('dashboard.study.rhythm.v1',{enabled:false,prayers:false,minutes:15,zikr:'',wird:'',launch:true,intentionAr:'طلاب عمل لا طلاب علم',intentionEn:'Seekers of doing, not knowing'})`);
      await window.loadURL('http://localhost:3000');
      await waitFor('document.querySelector("[data-study-snooze]")?.open');
      assert.ok(await evaluate(`document.querySelector('[data-study-snooze]').textContent.includes(${JSON.stringify(language === 'ar' ? 'طلاب عمل لا طلاب علم' : 'Seekers of doing, not knowing')})`));
      await evaluate('document.querySelector("[data-study-snooze] button").click()');
      await waitFor('!document.querySelector("[data-study-snooze]").open');
      await evaluate(`(async () => {const saved=await window.electronAPI.settings.get('dashboard.study.rhythm.v1');await window.electronAPI.settings.set('dashboard.study.rhythm.v1',{...saved,launch:false});})()`);
      results.push({ language, persisted: true, calendars: 6, form: true, completion: true, summary: true, goals: true, frequency: true, snooze: true, approvedIntention: true });
    }
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: results }));
    app.quit();
  };
  run().catch(error => { console.error(error); process.exitCode = 1; app.exit(1); });
});

require('../../dist/main/index.js');
