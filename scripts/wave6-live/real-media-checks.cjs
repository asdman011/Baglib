const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function importReal(context) {
  const { evaluate, until, nav, openQueue, realFiles } = context;
  assert.equal(realFiles.videos.length, 2, 'Both real language samples are registered');
  await nav('lectures');
  await until("[...document.querySelectorAll('header button')].some(button=>button.textContent.includes('إضافة'))");
  openQueue.push(realFiles.videos.map(file => file.filename));
  await evaluate("[...document.querySelectorAll('header button')].find(button=>button.textContent.includes('إضافة')).click()");
  await until('window.electronAPI.lectures.list().then(rows=>rows.length===2)');
  return evaluate('window.electronAPI.lectures.list()');
}
async function open(context, lecture, language) {
  await context.load(language); await context.nav('lectures');
  await context.until("!!document.querySelector('ul button')");
  await context.evaluate(`(()=>{const row=document.querySelector('[data-lecture-row="${lecture.id}"] [data-lecture-select]');const fallback=[...document.querySelectorAll('ul button')].find(button=>button.querySelector('span')?.textContent===${JSON.stringify(lecture.title)});(row||fallback).click();})()`);
  await context.until("document.querySelector('[data-lecture-player]')?.readyState>=2");
  assert.ok(await context.evaluate("document.querySelector('video').videoWidth>0 && document.querySelector('video').duration>20"));
}
async function playback(context) {
  const advanced = await context.evaluate("(async()=>{const v=document.querySelector('video');v.muted=true;v.currentTime=.1;await v.play();await new Promise(resolve=>setTimeout(resolve,500));v.pause();return v.currentTime>.2;})()");
  assert.ok(advanced, 'Real video plays decoded frames');
}
async function subtitles(context, lecture, language) {
  const filename = path.join(context.media, `${lecture.id}-${language}.${language==='ar'?'srt':'vtt'}`);
  fs.writeFileSync(filename, language === 'ar'
    ? '\uFEFF1\r\n00:00:00,000 --> 00:00:10,000\r\nالعِلْم النافع English\r\n\r\n2\r\n00:00:10,000 --> 00:00:20,000\r\nالمقطع الثاني'
    : 'WEBVTT\n\n00:00.000 --> 00:10.000\nWelcome العربية\n\n00:10.000 --> 00:20.000\nSecond cue');
  context.openQueue.push([filename]);
  await context.evaluate("document.querySelector('[data-load-subtitles]').click()");
  await context.until(`window.electronAPI.lectures.subtitles('${lecture.id}').then(value=>value?.path===${JSON.stringify(filename)})`);
  return filename;
}
async function runPlayer(context) {
  const lectures = await importReal(context);
  const controls = require('./player-checks.cjs');
  for (const sample of context.realFiles.videos) {
    const lecture = lectures.find(row=>row.path===sample.filename); assert.ok(lecture);
    for (const language of ['ar','en']) {
      await open(context, lecture, language); await playback(context);
      const result = await controls({ ...context, language, video: true, shot: name=>context.shot(`real-${sample.lang}-${name}`) });
      assert.equal(result.pip, 'entered and exited');
      console.log(JSON.stringify({ realPlayer: sample.lang, interface: language, result }));
    }
  }
}
async function runCaptions(context) {
  const lectures = await importReal(context);
  for (const sample of context.realFiles.videos) {
    const lecture = lectures.find(row=>row.path===sample.filename); assert.ok(lecture);
    for (const language of ['ar','en']) {
      await open(context, lecture, language); await playback(context);
      const chosen = await subtitles(context, lecture, language);
      for (const layout of ['overlay','study']) {
        await context.evaluate(`localStorage.setItem('baglib.lectures.layout','${layout}')`);
        await open(context, lecture, language);
        if (layout === 'overlay') await context.evaluate("document.querySelector('[data-toggle-transcript]').click()");
        await context.until("document.querySelectorAll('[data-transcript-cue]').length===2");
        await context.evaluate("(()=>{const v=document.querySelector('video');v.pause();v.currentTime=.3;v.dispatchEvent(new Event('timeupdate'));})()");
        await context.until(`document.querySelector('[data-lecture-subtitle]')?.textContent.includes(${JSON.stringify(language==='ar'?'العِلْم':'Welcome')})`);
        assert.equal(await context.evaluate("document.querySelector('[data-lecture-subtitle]').dir"), language==='ar'?'rtl':'ltr');
        await context.evaluate("document.querySelector('[data-lecture-captions]').click()");
        await context.until("!document.querySelector('[data-lecture-subtitle]')");
        await context.evaluate("document.querySelector('[data-lecture-controls]').dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true}))");
        await context.until("!!document.querySelector('[data-lecture-subtitle]')");
        await context.evaluate("document.querySelector('[data-transcript-cue=\"1\"] [data-transcript-seek]').click()");
        await context.until("document.querySelector('video').currentTime>=10");
        await context.evaluate("document.querySelector('video').pause()");
        await context.until("document.querySelector('[data-transcript-cue=\"1\"]').getAttribute('aria-current')==='true'");
        const search = language==='ar'?'البحث في التفريغ النصي':'Search transcript';
        await context.fill(search, language==='ar'?'العلم':'Welcome');
        await context.until("document.querySelectorAll('[data-transcript-cue]').length===1");
        await context.fill(search, '');
        for (const width of [1280,480]) {
          context.owner.setContentSize(width,900);
          await context.evaluate("document.querySelector('[data-lecture-controls]').scrollIntoView({block:'center'})");
          await context.shot(`real-captions-${sample.lang}-${language}-${layout}-${width}`);
          await context.evaluate("document.querySelector('[data-lecture-transcript-slot]').scrollIntoView({block:'center'})");
          await context.shot(`real-transcript-${sample.lang}-${language}-${layout}-${width}`);
          assert.ok(await context.evaluate('document.documentElement.scrollWidth<=innerWidth'));
        }
      }
      assert.equal((await context.evaluate(`window.electronAPI.lectures.subtitles('${lecture.id}')`)).path, chosen);
      await context.evaluate("document.querySelector('[data-transcript-note]').click()");
      await context.until(`document.querySelector('[data-note-side-panel]')?.dataset.noteTarget==='media:${lecture.id}:0'`);
      await context.evaluate("(()=>{const field=document.querySelector('[data-note-panel-editor]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Real transcript note');field.dispatchEvent(new Event('input',{bubbles:true}));})()");
      await context.evaluate("document.querySelector('[data-note-panel-save]').click()");
      await context.until(`window.electronAPI.studyNotes.list().then(rows=>rows.some(note=>note.content.includes('media:${lecture.id}:0')&&note.content.includes('Real transcript note')))`);
    }
  }
}
module.exports = { importReal, open, playback, subtitles, runPlayer, runCaptions };
