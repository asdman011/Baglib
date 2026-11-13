const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ebml = (id, body) => {
  const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(body.length) | (1n << 56n));
  return Buffer.concat([Buffer.from(id), size, body]);
};
function taggedWebm(bytes, title, speaker) {
  const vint = (at, marker) => {
    const length = Math.clz32(bytes[at]) - 23;
    let value = marker ? bytes[at] : bytes[at] & (255 >> length);
    for(let i=1;i<length;i++)value=value*256+bytes[at+i];
    return { value, length };
  };
  let at=0;
  while(at<bytes.length) {
    const id=vint(at,true),size=vint(at+id.length,false);
    if(id.value===0x18538067) {
      const tag=(name,value)=>ebml([0x67,0xc8],Buffer.concat([ebml([0x45,0xa3],Buffer.from(name)),ebml([0x44,0x87],Buffer.from(value))]));
      const tags=ebml([0x12,0x54,0xc3,0x67],ebml([0x73,0x73],Buffer.concat([tag('TITLE',title),tag('ARTIST',speaker),tag('DATE_RECORDED','2026-11-13')])));
      return Buffer.concat([bytes.subarray(0,at+id.length),Buffer.from([1,255,255,255,255,255,255,255]),tags,bytes.subarray(at+id.length+size.length)]);
    }
    at+=id.length+size.length+size.value;
  }
  throw new Error('Missing WebM Segment');
}
module.exports = async context => {
  const { owner, evaluate, until, shot, load, nav, media, files, realFiles } = context;
  const real = require('./real-media-checks.cjs');
  const template = files.find(file => file.endsWith('.webm'));
  assert.ok(template);
  const drop = async (selector, paths) => evaluate(`(()=>{const data=new DataTransfer();for(const filename of ${JSON.stringify(paths)}){const file=new File(['fixture'],filename.split(/[\\/]/).pop());data.items.add(file);Object.defineProperty(data.files[data.files.length-1],'path',{value:filename});}document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
  for (const language of ['ar', 'en']) {
    await load(language); await nav('lectures');
    await until("!!document.querySelector('[data-lecture-drop]')");
    for (const sample of realFiles.videos) {
      const selector = sample.lang === 'ar' ? '[data-lecture-drop]' : '[data-library-dialog=more-menu]';
      if (sample.lang === 'en') { await nav('library'); await until('!!document.querySelector("[data-library-dialog=more-menu]")'); }
      await drop(selector, [sample.filename]);
      await until(`window.electronAPI.lectures.list().then(rows=>rows.some(row=>row.path===${JSON.stringify(sample.filename)}))`);
      const lecture = (await evaluate('window.electronAPI.lectures.list()')).find(row=>row.path===sample.filename);
      const work = await evaluate(`window.electronAPI.getAllBooks().then(rows=>rows.find(row=>row.id==='${lecture.id}'))`);
      assert.equal(work.title, sample.lang==='ar'?'طريقة تربية الطفل':'A Plea for Balance');
      assert.equal(work.speaker, sample.lang==='ar'?'ايمن عبدالرحيم':undefined);
      assert.equal(work.digitalFormat,'mp4'); assert.ok(!work.publicationYear);
      await real.open(context, lecture, language); await real.playback(context); await real.subtitles(context, lecture, language);
      if (await evaluate("document.querySelector('[data-lecture-controls]').dataset.lectureLayout")!=='study') await evaluate("document.querySelector('[data-lecture-layout-switch]').click()");
      await until("document.querySelectorAll('[data-transcript-cue]').length===2");
      await evaluate("document.querySelector('[data-transcript-cue=\"1\"] [data-transcript-seek]').click()");
      await until("document.querySelector('video').currentTime>=10"); await evaluate("document.querySelector('video').pause()");
      for (const width of [1280,480]) { owner.setContentSize(width,900); await evaluate("document.querySelector('[data-lecture-controls]').scrollIntoView({block:'center'})"); await shot(`media-real-${sample.lang}-${language}-${width}`); }
      await load(language); await nav('lectures'); await until("!!document.querySelector('[data-lecture-drop]')");
    }
    const title = language === 'ar' ? 'المحاضرة العربية' : 'English Lecture';
    const speaker = language === 'ar' ? 'أحمد محمد' : 'John Smith';
    const single = path.join(media, language + '-tagged.webm'); fs.writeFileSync(single, taggedWebm(fs.readFileSync(template), title, speaker));
    await drop('[data-lecture-drop]', [single]);
    await until(`window.electronAPI.lectures.list().then(rows=>rows.some(row=>row.path===${JSON.stringify(single)}))`);
    let lectures = await evaluate('window.electronAPI.lectures.list()');
    const lecture = lectures.find(row => row.path === single);
    const work = await evaluate(`window.electronAPI.getAllBooks().then(rows=>rows.find(row=>row.id==='${lecture.id}'))`);
    assert.equal(work.workType, 'lecture'); assert.equal(work.digitalFormat, 'webm');
    assert.equal(work.title, title); assert.equal(work.speaker, speaker); assert.equal(work.recordingDate, '2026-11-13'); assert.ok(!work.publicationYear);
    const extra = ['A', 'B'].map(suffix => { const target = path.join(media, title + suffix + '.webm'); fs.copyFileSync(template, target); return target; });
    await nav('library'); await until('!!document.querySelector("[data-library-dialog=more-menu]")');
    await drop('[data-library-dialog=more-menu]', extra);
    await until(`window.electronAPI.lectures.list().then(rows=>${JSON.stringify(extra)}.every(file=>rows.some(row=>row.path===file)))`);
    const mixed = path.join(media, title + ' mixed.webm'); fs.copyFileSync(template, mixed);
    const pdf = realFiles.pdfs.find(file => file.lang === language);
    await drop('[data-library-dialog=more-menu]', [pdf.filename, mixed]);
    await until(`window.electronAPI.lectures.list().then(rows=>rows.some(row=>row.path===${JSON.stringify(mixed)}))`);
    await until(`window.electronAPI.getAllBooks().then(rows=>rows.some(row=>row.filePath===${JSON.stringify(pdf.filename)}))`, 400);
    await drop('[data-library-dialog=more-menu]', [realFiles.unsupportedAudio]);
    await until(`document.body.innerText.includes(${JSON.stringify(language === 'ar' ? 'صيغة الوسائط غير مدعومة' : 'Unsupported media format')})`);
    for (const width of [1280, 480]) {
      owner.setContentSize(width, 900); await shot(`media-library-${language}-${width}`);
    }
    // The common workspace opener is reached by the Library's visible row/card open action.
    await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-library-book-card]')].find(card=>card.getAttribute('aria-label')===${JSON.stringify(work.title)});if(!card)throw new Error('Missing lecture Work card');card.querySelector('[data-card-read-button]').click();})()`);
    await until("!!document.querySelector('[data-lecture-player]')");
    assert.ok((await evaluate("document.querySelector('[data-lecture-player]').src")).includes(encodeURIComponent(path.basename(single))));
    await nav('lectures'); await until("!!document.querySelector('[data-lecture-drop]')");
    await drop('[data-lecture-drop]', [realFiles.unsupportedAudio]);
    await until("!!document.querySelector('[data-lecture-drop-error]')");
    for (const width of [1280, 480]) {
      owner.setContentSize(width, 900); await shot(`media-lectures-${language}-${width}`);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    }
    await load(language); await nav('lectures');
    assert.ok((await evaluate('window.electronAPI.lectures.list()')).some(item => item.id === lecture.id));
  }
};
