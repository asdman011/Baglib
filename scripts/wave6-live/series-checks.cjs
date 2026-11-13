const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports = async context => {
  const { owner, evaluate, until, shot, load, nav, fill, media, files, directory, realFiles } = context;
  const real = require('./real-media-checks.cjs');
  const resumed = process.env.BAGLIB_WAVE6_SERIES_PHASE === 'restart';
  const expectedFile = path.join(directory,'series-expectations.json');
  let expected;
  if (resumed) expected=JSON.parse(fs.readFileSync(expectedFile,'utf8'));
  else {
    const template=files.find(file=>file.endsWith('.webm')); assert.ok(template);
    const extra=path.join(media,'Third lecture.webm'); fs.copyFileSync(template,extra);
    const lectures=await evaluate(`window.electronAPI.lectures.addPaths(${JSON.stringify([...realFiles.videos.map(row=>row.filename),extra])})`);
    await load('ar'); await nav('lectures'); await until("!!document.querySelector('[data-series-create-name]')");
    await fill('اسم السلسلة','سلسلة العلم / Real course'); await evaluate("document.querySelector('[data-series-create]').click()");
    await until('window.electronAPI.lectures.series.list().then(rows=>rows.length===1)');
    const [group]=await evaluate('window.electronAPI.lectures.series.list()');
    for(const lecture of lectures) {
      await evaluate(`(()=>{const field=document.querySelector('[data-lecture-row="${lecture.id}"] [data-series-assign]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(field,'${group.id}');field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(`window.electronAPI.lectures.series.list().then(rows=>rows[0].items.some(item=>item.workId==='${lecture.id}'))`);
    }
    await evaluate(`document.querySelector('[data-lecture-row="${lectures[0].id}"] [data-series-down]').click()`);
    await until(`window.electronAPI.lectures.series.list().then(rows=>rows[0].items[0].workId==='${lectures[1].id}')`);
    await evaluate(`(()=>{const data=new DataTransfer();data.setData('application/x-baglib-lecture','${lectures[2].id}');document.querySelector('[data-lecture-row="${lectures[1].id}"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
    await until(`window.electronAPI.lectures.series.list().then(rows=>rows[0].items[0].workId==='${lectures[2].id}')`);
    await evaluate(`window.electronAPI.lectures.series.reorder('${group.id}',${JSON.stringify(lectures.map(row=>row.id))})`);
    expected={id:group.id,lectures,order:lectures.map(row=>row.id)};
  }
  for(const language of ['ar','en']) {
    if(!resumed) {
      await evaluate(`window.electronAPI.lectures.series.update('${expected.id}',{autoplayNext:false})`);
      const first=expected.lectures[0],second=expected.lectures[1],third=expected.lectures[2];
      await real.open(context,first,language); await real.playback(context); await real.subtitles(context,first,language);
      if(await evaluate("document.querySelector('[data-lecture-controls]').dataset.lectureLayout")!=='study') await evaluate("document.querySelector('[data-lecture-layout-switch]').click()");
      await until("document.querySelectorAll('[data-transcript-cue]').length===2");
      await evaluate("document.querySelector('[data-transcript-cue=\"1\"] [data-transcript-seek]').click()");
      await until("document.querySelector('video').currentTime>=10"); await evaluate("document.querySelector('video').pause()");
      await evaluate("(()=>{const v=document.querySelector('video');v.currentTime=v.duration*.94;v.dispatchEvent(new Event('pause'));})()");
      await until(`window.electronAPI.lectures.progress('${first.id}').then(value=>value && !value.completed)`);
      await evaluate("(()=>{const v=document.querySelector('video');v.currentTime=v.duration*.96;v.dispatchEvent(new Event('pause'));})()");
      await until(`window.electronAPI.lectures.progress('${first.id}').then(value=>value?.completed)`);
      const end=()=>evaluate("(()=>{const v=document.querySelector('video');v.loop=false;v.muted=true;v.currentTime=v.duration-.1;return v.play();})()");
      await end(); await until("!!document.querySelector('[data-lecture-next]')");
      await pause(5200); assert.ok(await evaluate("!!document.querySelector('[data-lecture-next]')"));
      await evaluate("document.querySelector('[data-lecture-next-play]').click()");
      await until(`document.querySelector('video')?.src.endsWith(${JSON.stringify(encodeURIComponent(path.basename(second.path)))}) && document.querySelector('video').readyState>=2`);
      await real.playback(context);
      await evaluate(`document.querySelector('[data-lecture-series="${expected.id}"] [data-series-autoplay]').click()`);
      await until('window.electronAPI.lectures.series.list().then(rows=>rows[0].autoplayNext)');
      await real.open(context,first,language); await end(); await until("!!document.querySelector('[data-lecture-next-cancel]')");
      await evaluate("document.querySelector('[data-lecture-next-cancel]').click()"); await pause(5200);
      assert.ok(await evaluate("!!document.querySelector('[data-lecture-next]')"));
      await end();
      await until(`document.querySelector('video')?.src.endsWith(${JSON.stringify(encodeURIComponent(path.basename(second.path)))}) && document.querySelector('video').readyState>=2`,100);
      await end();
      await until(`document.querySelector('video')?.src.endsWith(${JSON.stringify(encodeURIComponent(path.basename(third.path)))}) && document.querySelector('video').readyState>=2`,100);
      await end(); await until('window.electronAPI.lectures.series.list().then(rows=>rows[0].items.every(item=>item.completed))');
      assert.equal(await evaluate("!!document.querySelector('[data-lecture-next]')"),false);
      await evaluate(`window.electronAPI.studyNotes.save(${JSON.stringify({title:'Series note',content:`[[media:${first.id}:1|طريقة تربية الطفل · 0:01]]
Real series note`,tags:[],aliases:[]})})`);
    }
    if (!resumed) {
      const temporary=await evaluate("window.electronAPI.lectures.series.create('Temporary / مؤقت')");
      await evaluate(`window.electronAPI.lectures.series.assign('${expected.lectures[2].id}','${temporary.id}')`);
      await load(language); await nav('lectures');
      await until(`!!document.querySelector('[data-lecture-series="${temporary.id}"]')`);
      await evaluate(`(()=>{const original=window.confirm;window.confirm=()=>true;try{document.querySelector('[data-lecture-series="${temporary.id}"] [data-series-delete]').click();}finally{window.confirm=original;}})()`);
      await until(`window.electronAPI.lectures.series.list().then(rows=>!rows.some(row=>row.id==='${temporary.id}'))`);
      assert.ok((await evaluate('window.electronAPI.lectures.list()')).some(row=>row.id===expected.lectures[2].id));
      await evaluate(`window.electronAPI.lectures.series.assign('${expected.lectures[2].id}','${expected.id}')`);
      const renamed='سلسلة العلم / Real course '+language;
      await evaluate(`(()=>{const input=document.querySelector('[data-lecture-series="${expected.id}"] [data-series-name]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(renamed)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await evaluate(`document.querySelector('[data-lecture-series="${expected.id}"] form').requestSubmit()`);
      await until(`window.electronAPI.lectures.series.list().then(rows=>rows[0].name===${JSON.stringify(renamed)})`);
      await nav('library'); await until("!!document.querySelector('[data-library-book-card]')");
      const title=expected.lectures[0].title;
      const menu=()=>evaluate(`[...document.querySelectorAll('[data-library-book-card]')].find(card=>card.getAttribute('aria-label')===${JSON.stringify(title)}).querySelector('[data-card-menu-button]').click()`);
      const label=language==='ar'?'إضافة إلى سلسلة':'Add to series';
      const picker=async()=>{await menu();await until(`[...document.querySelectorAll('[role=menuitem]')].some(item=>item.textContent.trim()===${JSON.stringify(label)})`);await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent.trim()===${JSON.stringify(label)}).click()`);await until("!!document.querySelector('[data-library-series-picker]')");};
      await picker();
      await until(`document.querySelector('[data-library-series-picker]').value==='${expected.id}'`);
      await evaluate("(()=>{const input=document.querySelector('[data-library-series-picker]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await evaluate("document.querySelector('[data-library-series-save]').click()");
      await until("!document.querySelector('[data-library-series-picker]')");
      await until('window.electronAPI.lectures.series.list().then(rows=>rows[0].items.length===2)');
      await picker();
      await evaluate(`(()=>{const input=document.querySelector('[data-library-series-picker]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'${expected.id}');input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await evaluate("document.querySelector('[data-library-series-save]').click()");
      await until("!document.querySelector('[data-library-series-picker]')");
      await until('window.electronAPI.lectures.series.list().then(rows=>rows[0].items.length===3)');
      await evaluate(`window.electronAPI.lectures.series.reorder('${expected.id}',${JSON.stringify(expected.order)})`);
    }
    await load(language); await nav('lectures'); await until("!!document.querySelector('[data-lecture-series-list]')");
    const [group]=await evaluate('window.electronAPI.lectures.series.list()');
    assert.deepEqual(group.items.map(row=>row.workId),expected.order); assert.equal(group.autoplayNext,true); assert.equal(group.items.filter(row=>row.completed).length,3);
    for(const width of [1280,480]) { owner.setContentSize(width,900); await shot(`real-series-${resumed?'restart':'seed'}-${language}-${width}`); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth')); }
    await nav('notes'); await until("!!document.querySelector('[data-notes-folder-tree] [data-notes-folder=\"lectures\"]')");
    await evaluate("(()=>{const root=document.querySelector('[data-notes-folder-tree] [data-notes-folder=\"lectures\"]');root.click();})()");
    const seriesPath='lectures/series-'+expected.id;
    await until(`!!document.querySelector('[data-notes-folder-tree] [data-notes-folder="${seriesPath}"]')`);
    await evaluate(`(()=>{const folder=document.querySelector('[data-notes-folder-tree] [data-notes-folder="${seriesPath}"]');folder.click();})()`);
    await until(`!!document.querySelector('[data-notes-folder-tree] [data-notes-folder="${seriesPath}/${expected.order[0]}"]')`);
    for(const width of [1280,480]) { owner.setContentSize(width,900); await shot(`real-series-notes-${resumed?'restart':'seed'}-${language}-${width}`); }
  }
  if(!resumed) fs.writeFileSync(expectedFile,JSON.stringify(expected));
};
