const { app, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_PLANNER_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const nativeNotifications = [];
const nativeShow = Notification.prototype.show;
Notification.prototype.show = function () { nativeNotifications.push(this); return nativeShow.call(this); };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;
app.on('browser-window-created', (_, window) => {
  if (started) return; started = true;
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && /uncaught|hydration|error/iu.test(message)) errors.push(message); });
  window.webContents.on('did-finish-load', () => { window.webContents.executeJavaScript("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  const waitFor = async code => {
    for (let attempt = 0; attempt < 220; attempt++) { try { if (await evaluate(code)) return; } catch {} await pause(250); }
    throw new Error(`Timed out: ${code}`);
  };
  const field = async (selector, value) => {
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    await evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});if(!field)throw Error('Missing field');const proto=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
    await pause(100);
  };
  const key = async (modifiers = []) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers });
    await pause(200);
  };
  const shot = async name => { await pause(250); fs.writeFileSync(path.join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG()); };
  (async () => {
    await waitFor('!!window.electronAPI?.planner && !!document.querySelector("footer")');
    const results = [];
    for (const language of ['ar', 'en']) {
      await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','${language==='ar'?'dark':'light'}')`);
      await window.loadURL('http://localhost:3000');
      await waitFor('!!window.electronAPI?.planner && !!document.querySelector("footer")');
      const subject = language === 'ar' ? 'الإحصاء' : 'Statistics';
      await evaluate(`window.electronAPI.planner.save({title:'Subject seed',description:'',status:'open',startDate:null,dueDate:null,priority:0,sortOrder:0,references:[],subject:${JSON.stringify(subject)}})`);
      await evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(button=>button.getAttribute('aria-label')===${JSON.stringify(language==='ar'?'مخطط الدراسة':'Study planner')}).click()`);
      await waitFor('!!document.querySelector("[data-study-planner]") && !!document.querySelector("[data-planner-task]")');
      assert.equal(await evaluate("document.querySelector('[data-study-planner]').dir"),language==='ar'?'rtl':'ltr');
      const today = await evaluate("(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()");
      const title = `${subject} — مُراجعة Review ${language}`;
      await field('[data-planner-quick-title]', title);
      await evaluate("document.querySelector('[data-planner-quick-title]').focus()");
      await key(['control']);
      await waitFor("document.activeElement===document.querySelector('[data-planner-quick-description]')");
      await field('[data-planner-quick-description]', 'وصف Description');
      await key();
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).some(task=>task.title===${JSON.stringify(title)}))()`);
      let saved = (await evaluate('window.electronAPI.planner.list()')).find(task=>task.title===title);
      assert.equal(saved.description, 'وصف Description'); assert.equal(saved.dueDate,today); assert.equal(saved.subject,subject);
      // Create and rename an empty group, keeping it through the existing settings boundary.
      await evaluate("document.querySelector('[data-planner-new-group]').click()");
      await field('[data-planner-management-name]',`Group ${language}`);
      await evaluate("document.querySelector('[data-planner-management]').requestSubmit()");
      await waitFor(`!!document.querySelector('[data-planner-group-edit="Group ${language}"]')`);
      await evaluate(`document.querySelector('[data-planner-group-edit="Group ${language}"]').click()`);
      await field('[data-planner-management-name]',`Study ${language}`);
      await field('[data-planner-management-order]','0');
      await evaluate("document.querySelector('[data-planner-management]').requestSubmit()");
      await waitFor(`!!document.querySelector('[data-planner-group-edit="Study ${language}"]')`);
      // Enter alone creates a title-only task. Due/list/repeat menu values reach persistence.
      await evaluate("document.querySelector('[data-planner-new-list]').click()");
      await field('[data-planner-management-name]', `QA ${language}`);
      await evaluate("document.querySelector('[data-planner-management]').requestSubmit()");
      await waitFor(`(async()=> (await window.electronAPI.planner.lists()).some(list=>list.name==='QA ${language}'))()`);
      const list = (await evaluate('window.electronAPI.planner.lists()')).find(item=>item.name===`QA ${language}`);
      await field('[data-planner-quick-title]', `Daily ${language}`);
      await evaluate("document.querySelector('[data-planner-quick-add] [data-planner-list-menu] summary').click()");
      await evaluate(`document.querySelector('[data-planner-quick-add] [data-planner-list="${list.id}"]').click()`);
      await evaluate("document.querySelector('[data-planner-quick-add] [data-planner-repeat-menu] summary').click();document.querySelector('[data-planner-quick-add] [data-planner-repeat=daily]').click()");
      await evaluate("document.querySelector('[data-planner-quick-title]').focus()"); await key();
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).some(task=>task.title==='Daily ${language}'))()`);
      const daily = (await evaluate('window.electronAPI.planner.list()')).find(task=>task.title===`Daily ${language}`);
      assert.equal(daily.description,'');assert.equal(daily.listId,list.id); assert.equal(daily.recurrence.kind,'daily');
      await evaluate(`document.querySelector('[data-task-id="${daily.id}"] input[type=checkbox]').click()`);
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).filter(task=>task.title==='Daily ${language}').length===2)()`);
      // Preset due/reminder menus and custom recurrence persist their selected values.
      await field('[data-planner-quick-title]',`Presets ${language}`);
      for (const width of [1280,480]) {
        window.setContentSize(width,900); await pause(150);
        await evaluate("document.querySelector('[data-planner-quick-title]').scrollIntoView({block:'center'})");
        assert.equal(await evaluate("(()=>{const p=document.querySelector('[data-study-planner]');return p.scrollWidth<=p.clientWidth+1})()"),true);
          for (const menu of ['list','due','reminder','repeat']) {
            await evaluate(`document.querySelector('[data-planner-quick-add] [data-planner-${menu}-menu] summary').click()`);
            await pause(100);
            assert.equal(await evaluate("document.querySelectorAll('[data-planner-quick-add] details[open]').length"),1);
            assert.ok(await evaluate("document.querySelector('[data-planner-quick-row]').getBoundingClientRect().height<=52"));
            await shot(`menus-${menu}-${language}-${width}`);
          }
          window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); await pause(100);
          assert.equal(await evaluate("document.querySelectorAll('[data-planner-quick-add] details[open]').length"),0);
          await evaluate("document.querySelector('[data-planner-quick-add] [data-planner-due-menu] summary').click()");
          await evaluate("document.querySelector('[data-planner-quick-title]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
          assert.equal(await evaluate("document.querySelectorAll('[data-planner-quick-add] details[open]').length"),0);
      }
      window.setContentSize(1280,900);
      await evaluate("document.querySelectorAll('[data-planner-quick-add] [data-planner-due-menu] button')[1].click();document.querySelectorAll('[data-planner-quick-add] [data-planner-reminder-menu] button')[1].click()");
      await evaluate("document.querySelector('[data-planner-quick-add] [data-planner-repeat-menu] summary').click();document.querySelector('[data-planner-quick-add] [data-planner-repeat=custom]').click()");
      await field('[data-planner-quick-add] [data-planner-repeat-menu] input[type=number]','2');
      await field('[data-planner-quick-add] [data-planner-repeat-menu] select[aria-label]','weeks');
      await evaluate("document.querySelectorAll('[data-planner-quick-add] [data-planner-repeat-menu] input[type=checkbox]')[1].click();document.querySelector('[data-planner-quick-title]').focus()");
      await key();
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).some(task=>task.title==='Presets ${language}'))()`);
      const preset = (await evaluate('window.electronAPI.planner.list()')).find(task=>task.title===`Presets ${language}`);
      assert.equal(preset.reminderAt.slice(0,10),preset.dueDate);assert.equal(preset.reminderAt.slice(11),'09:00');assert.notEqual(preset.dueDate,today);
      assert.deepEqual(preset.recurrence,{kind:'custom',interval:2,unit:'weeks',weekdays:[1]});
      // Rename/reorder a list and move it into the group through the management form.
      await evaluate(`document.querySelector('[data-planner-list-id="${list.id}"]').click();`);
      await pause(150);
      await evaluate("document.querySelector('[data-planner-edit-list]').click()");
      await field('[data-planner-management-name]',`Renamed ${language}`);
      await field('[data-planner-management-group]',`Study ${language}`);
      await field('[data-planner-management-order]','0');
      await evaluate("document.querySelector('[data-planner-management]').requestSubmit()");
      await waitFor(`(async()=> (await window.electronAPI.planner.lists()).some(row=>row.id==='${list.id}'&&row.name==='Renamed ${language}'&&row.groupName==='Study ${language}'&&row.sortOrder===0))()`);
      await evaluate("document.querySelector('[data-planner-all]').click()");
      // Open task details, schedule an overdue reminder and wait for main's real scheduler.
      await evaluate(`document.querySelector('[data-task-id="${saved.id}"] [data-planner-edit]').click()`);
      await waitFor("!!document.querySelector('[data-planner-details]')");
      const reminder = await evaluate("(()=>{const d=new Date(Date.now()-120000);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')})()");
      await field('[data-planner-detail-reminder]',reminder);
      await evaluate("document.querySelector('[data-planner-detail-save]').click()");
      await evaluate(`window.electronAPI.athan.setNotificationContext({focused:false,language:'${language}'})`);
      await waitFor(`(async()=> (await window.electronAPI.athan.notificationHistory()).some(record=>record.taskId==='${saved.id}'))()`);
      const record = (await evaluate('window.electronAPI.athan.notificationHistory()')).find(item=>item.taskId===saved.id);
      assert.equal(record.status,'new');
      assert.ok(nativeNotifications.some(notification=>notification.body===title),'native Windows notification show invoked');
      await evaluate("document.querySelector('[data-planner-details] button').click()");
      const native = nativeNotifications.find(notification=>notification.body===title);
      native.emit('click');
      await waitFor(`document.querySelector('[data-planner-detail-title]')?.value===${JSON.stringify(title)}`);
      // A picked book infers its subject, and the user can clear or override it.
      await field('[data-planner-detail-subject]','');
      await field('[data-study-link-picker] input:not([type])','/books ');
      await waitFor("!!document.querySelector('[data-study-link-picker] .max-h-44 button')");
      await evaluate("document.querySelector('[data-study-link-picker] .max-h-44 button').click()");
      await waitFor("!!document.querySelector('[data-planner-detail-subject]').value");
      await field('[data-planner-detail-subject]','');
      await evaluate("document.querySelector('[data-planner-detail-save]').click()");
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).find(task=>task.id==='${saved.id}').subject==='')()`);
      await field('[data-planner-detail-subject]',subject);
      await evaluate("document.querySelector('[data-planner-detail-save]').click()");
      await waitFor(`(async()=> (await window.electronAPI.planner.list()).find(task=>task.id==='${saved.id}').subject===${JSON.stringify(subject)})()`);
      // Subject filtering and Arabic normalization, with original labels retained.
      await field('[data-planner-subject-filter]',subject);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-planner-task]')).every(row=>row.textContent.includes(${JSON.stringify(subject)}))`),true);
      await field('[data-planner-start] input[type=search]', language==='ar'?'احصاء':'statistics');
      assert.ok(await evaluate("document.querySelectorAll('[data-planner-task]').length>0"));
      await field('[data-planner-start] input[type=search]','');
      for (const width of [1280,480]) {
        window.setContentSize(width,900); await pause(300);
        assert.equal(await evaluate("(()=>{const panel=document.querySelector('[data-study-planner]');return panel.scrollWidth<=panel.clientWidth+1})()"),true,`overflow ${language}/${width}`);
        await evaluate("document.querySelector('[data-study-planner]').scrollTop=0"); await shot(`panes-${language}-${width}`);
      }
      await evaluate("document.querySelector('[data-planner-calendar-open]').click()");
      await waitFor("document.querySelector('[data-planner-calendar-dialog]').open");
      await field('[data-planner-calendar-scope]','unscheduled');
      assert.ok(await evaluate("document.querySelector('[data-planner-day-tasks]').textContent.includes('Subject seed')"));
      await field('[data-planner-calendar-scope]','scheduled');
      await field('[data-planner-calendar-scope]','all');
      for (const calendar of ['gregorian','hijri']) for (const period of ['week','month','year']) {
        await field('[data-planner-calendar]',calendar);await field('[data-planner-period]',period);
        assert.ok(await evaluate("document.querySelectorAll('[data-planner-calendar-grid] time').length>0"));
      }
      await field('[data-planner-period]','month');
      for (const width of [1280,480]) {window.setContentSize(width,900);await pause(200);await shot(`calendar-${language}-${width}`);}
      await evaluate("document.querySelector('[data-planner-calendar-dialog]').close()");
      await field('[data-planner-subject-filter]','');
      // Confirmed list deletion retains its tasks, and group deletion retains the default list.
      await evaluate(`document.querySelector('[data-planner-list-id="${list.id}"]').click()`);
      await pause(100); await evaluate("document.querySelector('[data-planner-edit-list]').click()");
      await evaluate("window.confirm=()=>{window.__plannerConfirmed=true;return true};document.querySelector('[data-planner-management-delete]').click()");
      await waitFor(`(async()=> !(await window.electronAPI.planner.lists()).some(row=>row.id==='${list.id}'))()`);
      assert.equal(await evaluate('window.__plannerConfirmed'),true);
      assert.ok((await evaluate('window.electronAPI.planner.list()')).filter(task=>task.title===`Daily ${language}`).every(task=>task.listId==='tasks'));
      await evaluate(`document.querySelector('[data-planner-group-edit="Study ${language}"]').click()`);
      await evaluate("document.querySelector('[data-planner-management-delete]').click()");
      await waitFor(`!document.querySelector('[data-planner-group-edit="Study ${language}"]')`);
      await evaluate("document.querySelector('[data-planner-all]').click()"); await pause(100);
      // Opening a notification for a removed task consumes its target without a reload loop.
      await evaluate("sessionStorage.setItem('baglib.planner.open-task','deleted-task');window.dispatchEvent(new Event('baglib:open-task'))");
      await waitFor("sessionStorage.getItem('baglib.planner.open-task')===null && !!document.querySelector('[data-study-planner] [role=alert]')");
      await evaluate("document.querySelector('[data-study-planner] [role=alert] button').click()");
      await waitFor("!document.querySelector('[data-study-planner] [role=alert]')");
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
      assert.ok((await evaluate('window.electronAPI.planner.list()')).some(task => task.title === title));
      await evaluate(`window.electronAPI.settings.set('dashboard.study.rhythm.v1',{enabled:false,prayers:false,minutes:15,zikr:'',wird:'',launch:true,intentionAr:'طلاب عمل لا طلاب علم',intentionEn:'Seekers of doing, not knowing'})`);
      await window.loadURL('http://localhost:3000');
      await waitFor('document.querySelector("[data-study-snooze]")?.open');
      assert.ok(await evaluate(`document.querySelector('[data-study-snooze]').textContent.includes(${JSON.stringify(language === 'ar' ? 'طلاب عمل لا طلاب علم' : 'Seekers of doing, not knowing')})`));
      await evaluate('document.querySelector("[data-study-snooze] button").click()');
      await waitFor('!document.querySelector("[data-study-snooze]").open');
      await evaluate(`(async () => {const saved=await window.electronAPI.settings.get('dashboard.study.rhythm.v1');await window.electronAPI.settings.set('dashboard.study.rhythm.v1',{...saved,launch:false});})()`);

      results.push({ language, quickEnter:true, descriptionKeyboard:true, lists:true, groups:true, renameReorderDelete:true, presetMenus:true, customRepeat:true, repeat:true, reminderNativeShow:true, simulatedNativeClick:true, subject:true, bookInference:true, subjectClearOverride:true, missingNotificationTarget:true, calendars:6, widths:[1280,480], rhythm:true });
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ passed:true, results, rendererErrors:errors })); app.quit();
  })().catch(async error => {console.error(error);try {await shot('failure');} finally {app.exit(1);}});
});
require('../../dist/main/index.js');
