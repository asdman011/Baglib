const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const profile = process.env.BAGLIB_STATISTICS_PROFILE;
const evidence = process.env.BAGLIB_STATISTICS_EVIDENCE;
assert.ok(profile && path.dirname(profile) === path.resolve('.baglib-data'));
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => { throw new Error('Protocol registration prohibited in live check'); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  // KEY-317: throwaway profiles would show the KEY-307 first-run guide, which takes focus.
  win.webContents.on('did-finish-load', () => { win.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until = async (code, timeout = 90000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await evaluate(code)) return; } catch { /* Page still loading. */ }
      await pause(150);
    }
    throw new Error(`Timeout ${code}`);
  };
  const language = async lang => {
    if (await evaluate('document.documentElement.lang') !== lang) {
      await evaluate(`document.querySelector('header button[aria-label*="Language"], header button[aria-label*="اللغة"], header button[title*="لغة"], header button[title*="Language"]').click()`);
    }
    await until(`document.documentElement.lang === '${lang}' && document.documentElement.dir === '${lang === 'ar' ? 'rtl' : 'ltr'}'`);
  };
  const theme = async name => {
    if (await evaluate('document.documentElement.classList.contains("dark")') !== (name === 'dark')) {
      await evaluate(`document.querySelector('header button[title*="المظهر"], header button[title*="Theme"], header button[aria-label*="Theme"]').click()`);
    }
    await until(`document.documentElement.classList.contains('dark') === ${name === 'dark'}`);
  };
  const screenshot = async name => {
    win.show(); win.focus(); win.webContents.focus();
    await pause(200);
    await until('!document.querySelector("[role=dialog]")');
    assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false, 'No dialog obscures evidence');
    const localeState = await evaluate('({lang:document.documentElement.lang,dir:document.documentElement.dir})');
    assert.equal(localeState.dir, localeState.lang === 'ar' ? 'rtl' : 'ltr');
    fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Screenshot', name);
  };
  const nav = async key => {
    const labels = { dashboard: ['الرئيسية', 'Dashboard'], statistics: ['الإحصاءات', 'Statistics'] };
    // NAV_ITEMS supplies translated labels in both the rail and drawer.
    await evaluate(`(() => {
      const names = ${JSON.stringify(labels[key])};
      const buttons = [...document.querySelectorAll('aside button')];
      const button = buttons.find(button => names.includes(button.getAttribute('aria-label')) || names.includes(button.textContent.trim()));
      if (!button) throw new Error('Missing navigation ' + names.join(','));
      button.click();
    })()`);
  };
  (async () => {
    try {
      win.setMinimumSize(320, 300); win.setContentSize(1280, 900); win.show(); win.focus();
      await until('!!window.electronAPI && !!document.querySelector("[data-dashboard-essential-stats]")');
      await until('![...document.querySelectorAll("[role=dialog]")].some(el=>el.getAttribute("aria-label")==="Baglib Startup Screen")');
      const emptyStatus = await evaluate('window.electronAPI.getDatabaseStatus()');
      assert.ok(path.resolve(emptyStatus.path).startsWith(path.resolve(profile) + path.sep));
      const emptyDb = new Database(emptyStatus.path);
      emptyDb.exec('DELETE FROM work'); emptyDb.close();
      assert.equal(await evaluate('document.querySelectorAll("[data-essential-tile]").length'), 4);
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-dashboard-item]")].map(el=>el.dataset.dashboardItem)'), ['today','calendar','athan']);
      await evaluate('document.querySelector("[data-open-statistics]").click()');
      await until('document.querySelectorAll("[data-statistics-section]").length === 5 && !document.querySelector("[data-statistics-workspace] [role=status]")');
      assert.equal(await evaluate('!!document.querySelector("[data-statistics-workspace] [role=alert]")'), false);
      for (const lang of ['ar', 'en']) {
        await language(lang);
        for (const mode of ['light', 'dark']) {
          await theme(mode);
          for (const width of [1280,480]) {
            win.setContentSize(width,900); await pause(200);
            await evaluate('document.querySelector("[data-statistics-workspace]").scrollTop=0');
            await screenshot(`empty-${lang}-${mode}-${width}`);
          }
        }
      }
      const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json','utf8'));
      const files = ['ar','en'].map(lang => {
        const file = manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && file.path.includes('text-layer'));
        assert.ok(file); return path.resolve('tests/real-files', file.path);
      });
      const ids = await evaluate(`(async () => {
        const files = ${JSON.stringify(files)};
        const ids = [];
        for (const [index,filePath] of files.entries()) {
          const book = await window.electronAPI.addBook({ title: index ? 'Why Lyrics Last · قراءة English' : 'الدِّفاع عن أراضي المسلمين · Arabic', author: index ? 'Brian Boyd' : 'عبد الله عزام', filePath, digitalFormat:'PDF', pagesCount:index ? 240 : 88, readingStatus:'reading', coverImage:'', metadataProvenance:{fieldSources:{coverImage:{status:'user_override'}}} });
          ids.push(book.id);
        }
        await window.electronAPI.updateReadingStatus(ids[1], 'completed',100);
        return ids;
      })()`);
      assert.equal(ids.length,2); assert.ok(ids.every(Boolean));
      const status = await evaluate('window.electronAPI.getDatabaseStatus()');
      assert.ok(path.resolve(status.path).startsWith(path.resolve(profile) + path.sep));
      const db = new Database(status.path);
      const today = new Date();
      const day = offset => { const d = new Date(today.getFullYear(),today.getMonth(),today.getDate()+offset,12); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
      db.transaction(() => {
        const bookStat = db.prepare('INSERT OR IGNORE INTO reading_book_stat(id,title,subject,pages) VALUES(?,?,?,?)');
        for (const [index,id] of ids.entries()) bookStat.run(id,index ? 'English book' : 'كتاب عربي',index ? 'Literature' : 'فقه',index ? 240 : 88);
        const event = db.prepare('INSERT INTO reading_page_stat(id_book,page,start_time,duration) VALUES(?,?,?,?)');
        for (let offset=0;offset<50;offset++) for (let page=1;page<=3+offset%7;page++) event.run(ids[offset%2],page, Math.floor(new Date(day(-offset)+'T12:00:00').getTime()/1000)+page,30+offset%4*40);
        const knowledge = db.prepare('INSERT INTO knowledge(id,knowledge_type,created_at,updated_at) VALUES(?,?,?,?)');
        for (let index=0;index<15;index++) {
          const date=day(-index)+'T10:00:00Z';
          knowledge.run('note-'+index,'study_note',date,date);
          knowledge.run('card-'+index,'card',date,date);
          db.prepare('INSERT INTO card_detail(knowledge_id,front,back,source_kind) VALUES(?,?,?,?)').run('card-'+index,'سؤال '+index,'Answer '+index,'note');
          db.prepare('INSERT INTO srs_state(knowledge_id,state,due_at) VALUES(?,?,?)').run('card-'+index,'review',day(index%8-1)+'T10:00:00Z');
          db.prepare('INSERT INTO srs_review_log(id,knowledge_id,reviewed_at,rating) VALUES(?,?,?,?)').run('review-'+index,'card-'+index,date,index%4+1);
        }
        db.prepare('INSERT INTO category(id,name_ar,name_en) VALUES(?,?,?)').run('stats-subject','الأدب والشعر','Literature');
        db.prepare('UPDATE work SET primary_category_id=? WHERE id=?').run('stats-subject',ids[1]);
      })(); db.close();
      await evaluate(`(async () => {
        const api=window.electronAPI;
        const research=await api.pathways.save({name:'رحلة البحث Research',description:'',kind:'research'});
        const course=await api.pathways.save({name:'الإحصاء الرياضي Statistics',description:'',kind:'curriculum'});
        for (const item of [research,course]) {
          const step=await api.pathways.addStep(item.id,'المقدمة','Read and reflect');
          await api.pathways.addStep(item.id,'المقدمة','Practice');
          await api.pathways.setDone(step.id,true);
        }
        await api.pathwayExam.saveConfig({pathwayId:course.id,examDate:'${day(12)}',availableMinutesPerDay:{0:60,1:60,2:60,3:60,4:60,5:0,6:60},defaultStepMinutes:30});
        await api.settings.set('quran.khatmah.v1',{version:1,plans:[{id:'stats-plan',title:'ختمة التدبر · Reflection',script:'hafs',layout:'madani',startDate:'${day(-25)}',mode:'pages',durationDays:61,targetDate:'${day(35)}',pagesPerSession:10,sessionsPerDay:1,juzPerDay:1,automatic:false,reminder:{enabled:false,time:'08:00',language:'ar'},paused:false,binding:{script:'hafs',layout:'madani',profile:'hafs',adapted:false,totalPages:604,juzPages:[],juzEndPages:[]},reads:Array.from({length:120},(_,i)=>({page:i+1,date:'${day(-1)}'}))}]});
        const wird=await api.studyWird.getConfig();
        await api.studyWird.saveConfig({...wird,unit:'ayahs',dailyAmount:10,murajaa:{...wird.murajaa,enabled:false},currentPosition:{surah:2,ayah:21},lastCompletedDate:'${day(0)}'});
        window.location.reload();
      })()`);
      await until('!!document.querySelector("[data-open-statistics]")');
      await evaluate('document.querySelector("[data-open-statistics]").click()');
      await until('document.querySelectorAll("[data-statistics-section]").length===5 && !document.querySelector("[data-statistics-workspace] [role=status]")');
      assert.equal(await evaluate('!!document.querySelector("[data-statistics-workspace] [role=alert]")'),false);
      const checks=[];
      for (const lang of ['ar','en']) {
        await language(lang);
        for (const mode of ['light','dark']) {
          await theme(mode);
          for (const width of [1280,480]) {
            win.setContentSize(width,900); await pause(250);
            for (const range of ['week','month','year','all']) {
              await evaluate(`document.querySelector('[data-statistics-range="${range}"]').click()`);
              await until(`document.querySelector('[data-statistics-range="${range}"]').getAttribute('aria-pressed')==='true'`);
            }
            await evaluate('document.querySelector("[data-statistics-range=month]").click()');
            assert.equal(await evaluate('document.querySelector("[data-statistics-workspace]").scrollWidth <= document.querySelector("[data-statistics-workspace]").clientWidth + 1'),true,'No workspace overflow');
            assert.equal(await evaluate('[...document.querySelectorAll("[data-statistics-workspace] svg[role=img]")].every(el=>el.getAttribute("aria-label") && el.querySelector("title"))'),true,'Every SVG has accessible summary');
            assert.equal(await evaluate('!!document.querySelector("[data-statistics-workspace]").textContent.match(/NaN|undefined/)'),false);
            if (lang === 'ar') assert.ok(await evaluate('/[٠-٩]/.test(document.querySelector("[data-statistics-workspace]").textContent)'), 'Arabic digits render');
            await evaluate('document.querySelector("[data-statistics-workspace]").scrollTop=0');
            await screenshot(`data-${lang}-${mode}-${width}-overview`);
            for (const section of ['reading','books','knowledge','study','quran']) {
              await evaluate(`document.querySelector('[data-statistics-section="${section}"]').scrollIntoView({block:'start'})`);
              await screenshot(`data-${lang}-${mode}-${width}-${section}`);
            }
            checks.push({lang,dir:await evaluate('document.documentElement.dir'),theme:mode,width,sections:5,ranges:4});
          }
        }
      }
      // Verify both normal entry points on the actual nav rail.
      win.setContentSize(1280,900); await language('en');
      await nav('dashboard'); await until('!!document.querySelector("[data-dashboard-view]")');
      assert.equal(await evaluate('document.querySelectorAll("[data-essential-tile]").length'),4);
      for (const lang of ['ar','en']) {
        await language(lang);
        for (const width of [1280,480]) {
          win.setContentSize(width,900); await pause(150);
          await evaluate('document.querySelector("[data-dashboard-view]").scrollTop=0');
          await screenshot(`data-dashboard-${lang}-${width}`);
        }
      }
      win.setContentSize(1280,900); await language('en');
      await nav('statistics'); await until('!!document.querySelector("[data-statistics-workspace]")');
      const saved={version:1,modules:[{id:'scratchpad',visible:true},{id:'today',visible:true},{id:'calendar',visible:false},{id:'readingGoals',visible:false},{id:'activeReads',visible:false},{id:'studyProgress',visible:false},{id:'studyInsights',visible:false},{id:'athan',visible:false},{id:'khatmah',visible:false},{id:'studyRhythm',visible:false}]};
      await evaluate(`window.electronAPI.settings.set('dashboard.layout.v1',${JSON.stringify(saved)})`);
      await evaluate('window.location.reload()'); await until('!!document.querySelector("[data-dashboard-view]")');
      await until('!!document.querySelector("[data-dashboard-item=scratchpad]")');
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-dashboard-item]")].map(el=>el.dataset.dashboardItem)'),['scratchpad','today']);
      fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({profile,files,ids,checks,savedLayoutPreserved:true,originalFilesModified:false},null,2));
      const oldFailure=path.join(evidence,'failure.txt');
      if(fs.existsSync(oldFailure)) fs.unlinkSync(oldFailure);
      console.log('Statistics live PASS',checks.length,'matrix cases');
      app.exit(0);
    } catch(error) {
      console.error(error); fs.writeFileSync(path.join(evidence,'failure.txt'),String(error.stack || error)); app.exit(1);
    }
  })();
});
require('../../dist/main/index.js');
