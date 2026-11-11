const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_KEY312_PROFILE;
const evidence = process.env.BAGLIB_KEY312_EVIDENCE;
const phase = process.env.BAGLIB_KEY312_PHASE;
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let started = false;
let language = 'ar';
app.on('browser-window-created', (_, win) => {
  assert.equal(started, false, 'Exactly one Electron window'); started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  win.webContents.on('did-finish-load', () => {
    void evaluate(`window.electronAPI.settings.set('onboarding.v1',{seen:true})`).catch(() => {});
  });
  const until = async (code, timeout = 90000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { try { if (await evaluate(`(async()=>(${code}))()`)) return; } catch {} await pause(200); }
    throw new Error('Timed out ' + code + '\n' + await evaluate('document.body.innerText.slice(-2600)'));
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => { await pause(300); fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const input = (selector, value, tag = 'HTMLInputElement') => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}));})()`);
  const escape = async () => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await pause(250); };
  const results = [];
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  (async () => {
    await until('!!window.electronAPI?.athan?.notificationHistory && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.settings.set('onboarding.v1',{seen:true})`);
    if (phase === 'restart') {
      const expected = JSON.parse(fs.readFileSync(path.join(evidence, 'expected-history.json'), 'utf8'));
      const actual = await evaluate('window.electronAPI.athan.notificationHistory()');
      for (const record of expected) {
        const saved = actual.find(item => item.id === record.id);
        assert.ok(saved); assert.equal(saved.status, record.status); assert.equal(saved.title, record.title);
      }
      assert.ok(actual.every((record, index) => index === 0 || record.createdAt <= actual[index - 1].createdAt));
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[data-notification-history-open]") && !document.querySelector("[data-first-run]")');
      await click('[data-notification-history-open]');
      await until(`document.querySelectorAll('[data-notification-id]').length>=${expected.length}`);
      await shot('restart-history');
      fs.writeFileSync(path.join(evidence, 'restart.json'), JSON.stringify({ passed: true, retained: expected.length }, null, 2));
      app.quit(); return;
    }
    for (language of ['ar', 'en']) for (const width of [1280, 480]) {
      const prefix = `${language}-${width}`;
      console.log('CASE', prefix);
      await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(language)});window.electronAPI.settings.set('shell.navPinned.v1',true)`);
      win.setContentSize(width, 900);
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[data-notification-history-open]") && !document.querySelector("[data-first-run]")');
      await pause(1500);
      await click('[data-nav-item="settings"]');
      await until('!!document.querySelector("[data-settings-directory]")');
      await click('[data-settings-entry="prayer"]');
      await until('!!document.querySelector("[data-prayer-reminder-settings]")');
      assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
      await input('[data-prayer-city]', `القاهرة Cairo ${prefix}`);
      await input('[data-prayer-madhab]', 'hanafi', 'HTMLSelectElement');
      await input('[data-prayer-sound="fajr"]', 'madinah-recorded', 'HTMLSelectElement');
      await input('[data-prayer-sound="isha"]', 'adhan-recorded', 'HTMLSelectElement');
      await input('[data-prayer-row="fajr"] input[type="number"]', '23');
      await click('[data-notification-add-custom]');
      await until(`!!document.querySelector('[data-dhikr-row]:last-of-type input[maxlength="200"]')`);
      await input('[data-dhikr-row]:last-of-type input[maxlength="200"]', `ذِكر Study ${prefix}`);
      // Test the actual timer with a near-future minute, independent of real prayer times.
      const target = new Date(Date.now() + 65000);
      const schedule = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: (await evaluate('window.electronAPI.athan.getState()')).coordinates.timezone }).format(target);
      await input('[data-dhikr-row]:last-of-type input[type="time"]', schedule);
      await click('[data-dhikr-row]:last-of-type input[type="checkbox"]');
      await evaluate('document.querySelector("[data-notification-save]").scrollIntoView({block:"center"})');
      await shot(prefix + '-dhikr-settings');
      await click('[data-notification-save]');
      await until(`(await window.electronAPI.athan.getState()).settings.manualLocation.cityName===${JSON.stringify(`القاهرة Cairo ${prefix}`)}`);
      const saved = (await evaluate('window.electronAPI.athan.getState()')).settings;
      assert.equal(saved.asrMethod, 'hanafi'); assert.equal(saved.audio.prayerSounds.fajr, 'madinah-recorded'); assert.equal(saved.audio.prayerSounds.isha, 'adhan-recorded'); assert.equal(saved.notifications.preReminderByPrayer.fajr, 23);
      await escape();
      await click('[data-settings-entry="prayer"]');
      await until('!!document.querySelector("[data-prayer-city]")');
      assert.equal(await evaluate('document.querySelector("[data-prayer-city]").value'), `القاهرة Cairo ${prefix}`);
      await shot(prefix + '-prayer-settings');
      assert.equal(await evaluate('document.querySelector("[role=dialog]").scrollWidth<=document.querySelector("[role=dialog]").clientWidth+1'), true);
      await escape();
      await until(`(await window.electronAPI.athan.notificationHistory()).some(record=>record.title===${JSON.stringify(`ذِكر Study ${prefix}`)} && record.status==='new')`, 100000);
      await until('!!document.querySelector("[data-feedback-toast]")');
      await shot(prefix + '-toast');
      await click('[data-notification-history-open]');
      await until(`!!document.querySelector('[data-notification-history]') && [...document.querySelectorAll('[data-notification-id]')].some(e=>e.textContent.includes(${JSON.stringify(`ذِكر Study ${prefix}`)}))`);
      const record = (await evaluate('window.electronAPI.athan.notificationHistory()')).find(item => item.title === `ذِكر Study ${prefix}`);
      await shot(prefix + '-history');
      await click(`[data-notification-id="${record.id}"] [data-notification-action="snooze"]`);
      await until('!!document.querySelector("[data-study-snooze][open]")');
      assert.equal((await evaluate('window.electronAPI.athan.notificationHistory()')).find(item => item.id === record.id).status, 'snoozed');
      await shot(prefix + '-snooze');
      await escape();
      await click('[data-notification-history-open]');
      await until(`!!document.querySelector('[data-notification-id="${record.id}"]')`);
      await click(`[data-notification-id="${record.id}"] [data-notification-action="done"]`);
      await until(`document.querySelector('[data-notification-id="${record.id}"]').dataset.notificationStatus==='done'`);
      await shot(prefix + '-done');
      await click(`[data-notification-id="${record.id}"] [data-notification-action="open"]`);
      await until(`!document.querySelector('[data-notification-history]') && document.querySelector('[data-nav-item="dashboard"][aria-current="page"]')`);
      // Both focus and quiet gates also apply to prayer test alerts and audio broadcasts.
      await evaluate(`window.electronAPI.athan.setNotificationContext({focused:true,language:${JSON.stringify(language)}})`);
      await evaluate('window.electronAPI.athan.triggerTestAlert("asr")');
      assert.equal((await evaluate('window.electronAPI.athan.notificationHistory()'))[0].status, 'suppressed');
      await evaluate(`window.electronAPI.athan.setNotificationContext({focused:false,language:${JSON.stringify(language)}})`);
      await evaluate(`window.electronAPI.athan.getState().then(s=>window.electronAPI.athan.updateSettings({notifications:{...s.settings.notifications,quietWindow:{enabled:true,start:'00:00',end:'00:00'}}}))`);
      await evaluate('window.electronAPI.athan.triggerTestAlert("asr")');
      assert.equal((await evaluate('window.electronAPI.athan.notificationHistory()'))[0].status, 'suppressed');
      await evaluate(`window.electronAPI.athan.getState().then(s=>window.electronAPI.athan.updateSettings({notifications:{...s.settings.notifications,quietWindow:{enabled:false,start:'22:00',end:'06:00'}},dhikrReminders:s.settings.dhikrReminders.map(item=>({...item,enabled:false}))}))`);
      results.push({ language, width, direction: language === 'ar' ? 'rtl' : 'ltr', settingsSave: true, schedule: true, snooze: true, done: true, open: true, focus: true, quiet: true });
      fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    }
    fs.writeFileSync(path.join(evidence, 'expected-history.json'), JSON.stringify(await evaluate('window.electronAPI.athan.notificationHistory()'), null, 2));
    app.quit();
  })().catch(async error => { console.error(error); await shot('failure').catch(() => {}); app.exit(1); });
});
require('../../dist/main/index.js');
