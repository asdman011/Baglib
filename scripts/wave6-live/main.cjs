const {app,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const directory=process.env.BAGLIB_WAVE6_LIVE_DIR;
const media=path.join(directory,'media');
const realFiles = JSON.parse(fs.readFileSync(path.join(directory, 'real-files.json'), 'utf8'));
app.setPath('userData',directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const openQueue=[];
dialog.showOpenDialog=async()=>{const next=openQueue.shift();return next?{canceled:false,filePaths:next}:{canceled:true,filePaths:[]};};
// Coursera stand-in: one token endpoint and a two-page report with another learner mixed in.
const coursera=http.createServer((request,response)=>{
  response.setHeader('Content-Type','application/json');
  if(request.url.startsWith('/oauth2/'))return response.end(JSON.stringify({access_token:'live-token'}));
  if(request.headers.authorization!=='Bearer live-token'){response.statusCode=401;return response.end('{}');}
  const first=request.url.includes('start=0');
  response.end(JSON.stringify(first?{elements:[{id:'1',contentId:'a',contentType:'Course',contentName:'Introduction to Islamic Finance',contentSlug:'islamic-finance',externalId:'learner@example.com',overallProgress:64,isCompleted:false},{id:'2',contentId:'b',contentType:'Course',externalId:'someone@example.com',overallProgress:10}],paging:{next:'2',total:3}}:{elements:[{id:'3',contentId:'c',contentType:'Specialization',contentName:'اللغة العربية',contentSlug:'arabic',email:'learner@example.com',overallProgress:100,isCompleted:true}],paging:{total:3}}));
});
const pause=duration=>new Promise(resolve=>setTimeout(resolve,duration));
const labels={
  ar:{lectures:'المحاضرات',add:'إضافة ملفات',speed:'السرعة',noteHere:'ملاحظة عند هذه اللحظة',shot:'لقطة إلى ملاحظة',section:'عنوان القسم',addSection:'قسم هنا',pathways:'المسارات',org:'رقم المؤسسة',learner:'بريدك أو معرّفك في المؤسسة',key:'مفتاح التطبيق',secret:'سر التطبيق',save:'حفظ بأمان',import:'استيراد التقدّم',library:'المكتبة',cover:'من صورة الغلاف',providers:'إعدادات مصادر البيانات',notes:'سجل الملاحظات'},
  en:{lectures:'Lectures',add:'Add files',speed:'Speed',noteHere:'Note at this moment',shot:'Screenshot to note',section:'Section title',addSection:'Section here',pathways:'Pathways',org:'Organisation ID',learner:'Your email or ID in the organisation',key:'App key',secret:'App secret',save:'Save securely',import:'Import progress',library:'Library',cover:'From cover photo',providers:'Provider Settings',notes:'Notes Log'},
};
let started=false;
app.on('browser-window-created',(_,owner)=>{
  if(started)return;started=true;
  const evaluate=code=>owner.webContents.executeJavaScript(code,true).catch(error=>{throw new Error(`${error.message}: ${code.slice(0,200)}`);});
  owner.webContents.on('did-finish-load', () => { evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until=async(code,tries=200)=>{for(let index=0;index<tries;index++){try{if(await evaluate(code))return;}catch{}await pause(300);}throw new Error(`Timed out: ${code}\n${await evaluate("document.body.innerText.slice(-1800)")}`);};
  const press=text=>evaluate(`(()=>{const item=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)}||b.title===${JSON.stringify(text)});if(!item)throw new Error('no button '+${JSON.stringify(text)});item.click();})()`);
  const nav=id=>evaluate(`document.querySelector('[data-nav-item="${id}"]').click()`);
  const fill=(label,value)=>evaluate(`(()=>{const element=[...document.querySelectorAll('input,textarea,select')].find(item=>item.getAttribute('aria-label')===${JSON.stringify(label)});if(!element)throw new Error('no field '+${JSON.stringify(label)});const proto=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const shot=async name=>{await pause(500);owner.webContents.invalidate();await pause(300);fs.writeFileSync(path.join(directory,`${name}.png`),(await owner.webContents.capturePage()).toPNG());};
  const load=async language=>{owner.setContentSize(1280,900);await evaluate(`localStorage.setItem('baglib-lang','${language}')`);await owner.loadURL('http://localhost:3000');await until('!!window.electronAPI?.lectures && !!document.querySelector("footer")');await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(1200);};
  const letters=text=>text.normalize('NFC').replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu,'').replace(/[^ء-يٱ-ۓ\s]/gu,' ').replace(/\s+/gu,' ').trim();
  const distance=(a,b)=>{let prev=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur.push(Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]!==b[j-1])));prev=cur;}return prev[b.length];};
  (async()=>{
    await new Promise(resolve=>coursera.listen(0,'127.0.0.1',resolve));
    process.env.BAGLIB_COURSERA_API=`http://127.0.0.1:${coursera.address().port}`;
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await load('ar');
    const results={formats:{}};
    for (const file of realFiles.pdfs) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: file.id, title: `Wave6 ${file.lang} real PDF`, bookType: 'digital', digitalFormat: 'PDF', workType: 'book', filePath: file.filename, categories: [], tags: [], lendingHistory: [] })})`);
    // Media the app's own Chromium can encode, so no sample files are downloaded.
    const recorded=await evaluate(`(async()=>{const out={};const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const g=canvas.getContext('2d');let frame=0;const timer=setInterval(()=>{g.fillStyle='hsl('+(frame++*12%360)+',70%,50%)';g.fillRect(0,0,320,180);g.fillStyle='#fff';g.font='40px Arial';g.fillText(String(frame),20,100);},40);
      for(const [name,type] of [['webm','video/webm;codecs=vp9'],['mp4','video/mp4;codecs=avc1'],['mkv','video/x-matroska;codecs=avc1']]){
        if(!MediaRecorder.isTypeSupported(type)){out[name]=null;continue;}
        const recorder=new MediaRecorder(canvas.captureStream(25),{mimeType:type});const chunks=[];recorder.ondataavailable=event=>chunks.push(event.data);
        await new Promise(resolve=>{recorder.onstop=resolve;recorder.start();setTimeout(()=>recorder.stop(),3000);});
        const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));out[name]=btoa(text);
      }
      clearInterval(timer);return out;})()`);
    const files=[path.join(media,'درس صوتي.mp3')];
    for(const [name,data] of Object.entries(recorded)){
      results.formats[name]=data?'recorded':'encoder unavailable';
      if(!data)continue;
      const file=path.join(media,`محاضرة.${name}`);fs.writeFileSync(file,Buffer.from(data,'base64'));files.push(file);
      if(name==='mp4'){fs.copyFileSync(file,path.join(media,'محاضرة.mov'));files.push(path.join(media,'محاضرة.mov'));}
    }
    for(const language of ['ar','en']){
      const L=labels[language];const result={language};
      await load(language);
      for (const file of realFiles.pdfs) {
        owner.webContents.send('study:navigate', 'book:' + file.id + '#p=' + file.page);
        await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage === '${file.page}' && [...document.querySelectorAll('.textLayer span')].some(span => span.textContent.trim().length > 2)`);
      }
      result.realPdfs = realFiles.pdfs.map(file => ({ lang: file.lang, page: file.page }));
      await nav('lectures');await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(L.add)})`);
      if(language==='ar'){
        openQueue.push([realFiles.unsupportedAudio]);await press(L.add);
        await pause(300);assert.equal((await evaluate('window.electronAPI.lectures.list()')).length,0,'WMA remains outside supported lecture formats');
        openQueue.push(files);await press(L.add);await until(`window.electronAPI.lectures.list().then(rows=>rows.length===${files.length})`);}
      const lectures=await evaluate('window.electronAPI.lectures.list()');
      assert.equal(await evaluate("document.querySelector('[dir]').dir"),language==='ar'?'rtl':'ltr');
      result.playable={};
      for(const lecture of lectures){
                const ext=path.extname(lecture.path);
        await evaluate(`[...document.querySelectorAll('ul button')].filter(b=>b.querySelector('span')?.textContent===${JSON.stringify(lecture.title)})[${JSON.stringify(lectures.filter(item=>item.title===lecture.title).indexOf(lecture))}].click()`);
        await until(`document.querySelector('[data-lecture-player]')?.src.endsWith(${JSON.stringify(encodeURIComponent(path.basename(lecture.path)))})`);
        const state=await evaluate(`new Promise(resolve=>{const v=document.querySelector('[data-lecture-player]');const done=()=>resolve({ready:v.readyState,duration:v.duration,error:v.error&&v.error.code,width:v.videoWidth});if(v.readyState>=1||v.error)return done();v.addEventListener('loadedmetadata',done,{once:true});v.addEventListener('error',done,{once:true});setTimeout(done,8000);})`);
        const played=state.ready>=1?await evaluate(`(async()=>{const v=document.querySelector('[data-lecture-player]');v.muted=true;await v.play().catch(()=>{});await new Promise(r=>setTimeout(r,900));v.pause();return v.currentTime;})()`):0;
        result.playable[ext]={metadata:state.ready>=1,error:state.error,width:state.width,played:played>0};
      }
      console.log(JSON.stringify({playable:result.playable,formats:results.formats}));
      // MP3 with chapters: sections from the file, speed, position, timestamp note and section editing.
      const mp3=lectures.find(item=>item.kind==='audio');
      assert.deepEqual(mp3.sections.map(item=>item.title).slice(0,2),['المقدمة','الباب الأول']);
      await evaluate(`[...document.querySelectorAll('ul button')].find(b=>b.querySelector('span')?.textContent===${JSON.stringify(mp3.title)}).click()`);
      await until(`document.querySelector('[data-lecture-player]')?.readyState>=1`);
      await evaluate(`[...document.querySelectorAll('ol button')].find(b=>b.textContent.includes('الباب الأول')).click()`);
      await until(`document.querySelector('[data-lecture-player]').currentTime>=2`);
      await fill(L.speed,'1.5');await evaluate("document.querySelector('[data-lecture-player]').pause()");await pause(600);
      const saved=await evaluate(`window.electronAPI.lectures.progress('${mp3.id}')`);
      assert.equal(saved.rate,1.5);assert.ok(saved.position>=2);
      await fill(L.section,`قسم ${language}`);await press(L.addSection);
      await until(`window.electronAPI.lectures.list().then(rows=>rows.find(r=>r.id==='${mp3.id}').sections.some(s=>s.title==='قسم ${language}'))`);
      await load(language);await nav('lectures');
      await until(`[...document.querySelectorAll('ul button')].some(b=>b.querySelector('span')?.textContent===${JSON.stringify(mp3.title)})`);
      await evaluate(`[...document.querySelectorAll('ul button')].find(b=>b.querySelector('span')?.textContent===${JSON.stringify(mp3.title)}).click()`);
      await until(`(()=>{const v=document.querySelector('[data-lecture-player]');return v&&v.readyState>=1&&v.playbackRate===1.5&&v.currentTime>=2})()`);
      result.resume={rate:1.5,position:saved.position};
      // KEY-337: the note button opens the note side panel beside the player (no jump to Notes) with a timestamped link;
      // saving it and following it seeks back.
      const panelNote=async(prefix,text)=>{
        await until(`!!document.querySelector('[data-note-side-panel]')?.dataset.noteTarget?.startsWith(${JSON.stringify(prefix)})`);
        assert.ok(await evaluate("!!document.querySelector('[data-lecture-player]')"),'the player stays on screen');
        await evaluate(`(()=>{const e=document.querySelector('[data-note-panel-editor]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await evaluate("document.querySelector('[data-note-panel-save]').click()");
        await until(`window.electronAPI.studyNotes.list().then(n=>n.some(x=>x.content.includes(${JSON.stringify(prefix)})&&x.content.includes(${JSON.stringify(text)})))`);
        const saved=(await evaluate('window.electronAPI.studyNotes.list()')).find(x=>x.content.includes(prefix)&&x.content.includes(text));
        await evaluate("document.querySelector('[data-note-side-panel] button[aria-label]').click()");
        return saved;
      };
      await press(L.noteHere);
      const note=await panelNote(`media:${mp3.id}:`,`فائدة ${language}`);
      const draft=note.content;
      result.timestampNote=draft.trim();
      // A video frame saved to a note shows as an image.
      const video=lectures.find(item=>item.kind==='video'&&result.playable[path.extname(item.path)]?.played);
      if(video){
        await nav('lectures');await until(`[...document.querySelectorAll('ul button')].some(b=>b.querySelector('span')?.textContent===${JSON.stringify(video.title)})`);
        await evaluate(`[...document.querySelectorAll('ul button')].filter(b=>b.querySelector('span')?.textContent===${JSON.stringify(video.title)})[${JSON.stringify(lectures.filter(item=>item.title===video.title).indexOf(video))}].click()`);
        await until(`document.querySelector('[data-lecture-player]')?.readyState>=2`);
        await evaluate("document.querySelector('[data-lecture-player]').currentTime=1");await pause(800);
        await shot(`lectures-${language}-1280`);
        owner.setContentSize(480,1000);await pause(500);assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'));await shot(`lectures-${language}-480`);owner.setContentSize(1280,900);
        await press(L.shot);
        const screenshotNote = await panelNote(`media:${video.id}:`,`لقطة ${language}`);
        assert.ok(screenshotNote.content.includes(`![[media:${video.id}:`),'the frame is embedded');
        await load(language);await nav('notes');
        await until(`!!document.querySelector('[data-study-note="${screenshotNote.id}"]')`);
        await evaluate(`document.querySelector('[data-study-note="${screenshotNote.id}"]').click()`);
        await until('!!document.querySelector("[data-note-preview-toggle]")');
        await evaluate("document.querySelector('[data-note-preview-toggle]').click()");
        await until(`[...document.querySelectorAll('[data-note-preview="${screenshotNote.id}"] img[data-lecture-shot]')].some(img=>img.complete&&img.naturalWidth>0)`);
        await shot(`note-shot-${language}-1280`);
        result.screenshotNote=true;
      }
      // Following the note's link opens the lecture at its moment.
      await load(language);await nav('notes');
      await until(`!!document.querySelector('[data-study-note="${note.id}"]')`);
      await evaluate(`document.querySelector('[data-study-note="${note.id}"]').click()`);
      await until('!!document.querySelector("[data-note-preview-toggle]")');
      await evaluate("document.querySelector('[data-note-preview-toggle]').click()");
      const seconds=Number(/media:[^:]+:(\d+)/u.exec(draft)[1]);
      await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes(${JSON.stringify(mp3.title)})&&b.textContent.includes(':'))`);
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(mp3.title)})&&b.textContent.includes(':')).click()`);
      await until(`(()=>{const v=document.querySelector('[data-lecture-player]');return v&&v.readyState>=1&&Math.abs(v.currentTime-${seconds})<1.5})()`);
      result.noteJump=seconds;
      void note;

      // KEY-257 through the panel, against the stand-in.
      await nav('pathways');await until("!!document.querySelector('[data-online-courses]')");
      await evaluate("document.querySelector('[data-online-courses]').open=true");
      await fill(L.org,'org-123');await fill(L.learner,'learner@example.com');await fill(L.key,'live-key');await fill(L.secret,'live-secret');
      await press(L.save);await until(`[...document.querySelectorAll('[data-online-courses] button')].some(b=>b.textContent.includes(${JSON.stringify(L.import)})&&!b.disabled)`);
      await press(L.import);await until("document.querySelectorAll('[data-online-courses] li').length===2");
      const stored=await evaluate("window.electronAPI.courses.account()");assert.equal(stored.saved,true);assert.equal(stored.secureStorage,true);
      assert.ok(!JSON.stringify(await evaluate("window.electronAPI.courses.snapshot()")).includes('live-secret'));
      await shot(`courses-${language}-1280`);
      result.coursera={courses:2,secureStorage:true};

      // KEY-259 cover photo, then KEY-260 address file through the provider settings it sits beside.
      await nav('library');await until('!!document.querySelector("[data-library-dialog=more-menu]")');
      await evaluate("document.querySelector('[data-library-dialog=more-menu]').click()");
      await until('!!document.querySelector("[role=menuitem]")');
      openQueue.push([path.join(media,'cover.png')]);
      await press(L.cover);
      await until(`[...document.querySelectorAll('input')].some(i=>i.value.includes('رياض'))`,400);
      const proposed=await evaluate(`[...document.querySelectorAll('input')].map(i=>i.value).filter(v=>v.includes('رياض')||v.includes('النووي'))`);
      result.cover=proposed;
      await shot(`cover-${language}-1280`);
      await evaluate("document.querySelector('[role=dialog] button svg.lucide-x').closest('button').click()");
      await until('!document.querySelector("[role=dialog]")');
      await evaluate("document.querySelector('[data-nav-item=settings]').click()");
      await until('!!document.querySelector("[data-settings-entry=providers]")');
      await evaluate("document.querySelector('[data-settings-entry=providers]').click()");
      await until("!!document.querySelector('[data-source-urls]')");
      openQueue.push([path.join(media,'sources.json')]);
      await evaluate(`[...document.querySelectorAll('[data-source-urls] button')][1].click()`);
      await until("document.querySelector('[data-source-urls]').textContent.includes('libgen.example')");
      await shot(`sources-${language}-1280`);
      await evaluate("window.electronAPI.sources.reset()");
      result.sourceFile=true;
      results[language]=result;console.log(JSON.stringify(result));
    }
    // KEY-258 Hub fix through the real pipeline call: an image-only verse page with the lines layout.
    await load('en');
    const started=Date.now();
    const run=await evaluate(`window.electronAPI.pdfEditor.executePipeline({filePaths:[${JSON.stringify(path.join(media,'verse.pdf'))}],pipelineConfig:{name:'ocr',singleTool:true,pipeline:[{operation:'/api/v1/misc/ocr-pdf',parameters:{languages:['ara'],layout:'lines',ocrType:'force-ocr',deskew:true}}]}})`);
    assert.equal(run.ok,true,JSON.stringify(run));
    const text=execFileSync(path.join(process.env.BAGLIB_WAVE6_POPPLER,'pdftotext.exe'),['-enc','UTF-8',run.data.outputPath,'-']).toString('utf8');
    const truth=letters(fs.readFileSync(path.join(media,'verse.txt'),'utf8'));const read=letters(text);
    const bag=words=>words.split(' ').reduce((map,word)=>map.set(word,(map.get(word)||0)+1),new Map());
    const expected=bag(truth),found=bag(read);let hits=0;for(const [word,count] of expected)hits+=Math.min(count,found.get(word)||0);
    // pdftotext lists each hemistich column on its own, so order-sensitive error overstates; word recall shows what is searchable.
    results.hubLines={letterCer:Math.round(distance(truth,read)/truth.length*1000)/10,wordRecall:Math.round(hits/truth.split(' ').length*1000)/10,seconds:(Date.now()-started)/1000};
    const scanBefore = fs.readFileSync(realFiles.scanSample);
    const originalScanText = execFileSync(path.join(process.env.BAGLIB_WAVE6_POPPLER,'pdftotext.exe'), ['-enc','UTF-8',realFiles.scanSample,'-']).toString('utf8');
    assert.equal(originalScanText.trim(), '', 'Real scanned sample starts without a text layer');
    const realOcr = await evaluate(`window.electronAPI.pdfEditor.executePipeline({filePaths:[${JSON.stringify(realFiles.scanSample)}],pipelineConfig:{name:'real-arabic-ocr',singleTool:true,pipeline:[{operation:'/api/v1/misc/ocr-pdf',parameters:{languages:['ara'],layout:'lines',ocrType:'force-ocr',deskew:true}}]}})`);
    assert.equal(realOcr.ok,true,JSON.stringify(realOcr));
    assert.notEqual(path.resolve(realOcr.data.outputPath),path.resolve(realFiles.scanSample));
    const realText = execFileSync(path.join(process.env.BAGLIB_WAVE6_POPPLER,'pdftotext.exe'), ['-enc','UTF-8',realOcr.data.outputPath,'-']).toString('utf8');
    assert.ok(letters(realText).length > 10, 'Real scanned Arabic page gains searchable text in a new output');
    assert.ok(fs.readFileSync(realFiles.scanSample).equals(scanBefore), 'Input scan sample unchanged');
    results.realScan = { searchableArabicCharacters: letters(realText).length, originalUnchanged: fs.readFileSync(realFiles.scanSample).equals(scanBefore) };
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({directory,passed:results}));coursera.close();app.quit();
  })().catch(error=>{console.error(error);fs.writeFileSync(path.join(directory,'failure.txt'),String(error.stack||error));owner.webContents.capturePage().then(image=>fs.writeFileSync(path.join(directory,'failure.png'),image.toPNG())).finally(()=>app.exit(1));});
});
require('../../dist/main/index.js');
