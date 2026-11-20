const { app } = require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const profile=process.env.BAGLIB_KEY435_PROFILE,evidence=process.env.BAGLIB_KEY435_EVIDENCE;
assert.equal(path.dirname(profile),fs.realpathSync('.baglib-data'));
app.setPath('userData',profile);app.setAppPath(process.cwd());
process.on('uncaughtException',e=>{console.error(e);app.exit(1)});
process.on('unhandledRejection',e=>{console.error(e);app.exit(1)});
setTimeout(()=>{console.error('KEY-435 hard timeout');app.exit(1)},200000).unref();
const labels=require(path.join(profile,'labels.cjs')).translations;
const requests=[];
const fake=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{try{
 const payload=JSON.parse(body),system=payload.messages[0].content,prompt=payload.messages[1].content;requests.push({system,prompt});
 let user;try{user=JSON.parse(prompt)}catch{}
 const ar=system.includes('Arabic');const source=user?.sources?.[0];
 const answer=source?(system.includes('draft flashcards')?{answer:'',abstained:false,citations:[],cards:[{front:ar?'سؤال عربي Question':'English question سؤال',back:'Answer جواب',source:source.id,quote:source.text.slice(0,30)}]}:{answer:ar?'إجابة تجريبية من المصدر.':'A stubbed answer from the source.',abstained:false,citations:[{source:source.id,quote:source.text.slice(0,30)}]}):ar?'إجابة تجريبية [1]':'Stubbed answer [1]';
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message:{content:typeof answer==='string'?answer:JSON.stringify(answer)}}));
 }catch(e){console.error(e);app.exit(1)}})});
let started=false;
app.on('browser-window-created',(_,win)=>{if(started)return;started=true;const errors=[];
 win.webContents.on('console-message',(_,level,msg)=>{if(level>=3)errors.push(msg)});
 win.webContents.once('did-finish-load',()=>run(win,errors).catch(async e=>{console.error(e);fs.writeFileSync(path.join(evidence,'failure.txt'),e.stack+'\n'+JSON.stringify(errors));try{fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG())}catch{}app.exit(1)}));
});
async function run(win,errors){
 win.setSize(1440,1000);win.webContents.setBackgroundThrottling(false);
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const evaluate=code=>Promise.race([win.webContents.executeJavaScript(code,true),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Evaluation timeout')),15000);t.unref()})]);
 const until=async code=>{for(let i=0;i<180;i++){try{if(await evaluate(code))return}catch{}await pause(120)}throw Error('Timeout '+code+'\n'+await evaluate('document.body.innerText.slice(-1500)'))};
 const click=async selector=>{await until('!!document.querySelector('+JSON.stringify(selector)+')');await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await pause(180)};
 const setValue=async(selector,value)=>{await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}))})()');await pause(150)};
 const shot=async name=>{win.showInactive();win.webContents.invalidate();await pause(500);fs.writeFileSync(path.join(evidence,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
 await evaluate('window.electronAPI.settings.set("onboarding.v1",{seen:true})');
 const manifest=JSON.parse(fs.readFileSync('tests/real-files/manifest.json','utf8'));const files=['ar','en'].map(lang=>manifest.files.find(f=>f.kind==='pdf'&&f.lang===lang&&f.textLayer==='yes'));
 for(const file of files){assert.ok(file);await evaluate('window.electronAPI.importDigitalFile({filePath:'+JSON.stringify(path.resolve('tests/real-files',file.path))+'})')}
 const books=await evaluate('window.electronAPI.getAllBooks()');
 const note=await evaluate('window.electronAPI.studyNotes.save({title:"KEY435 مصدر Source",content:"عِلْمٌ mixed Arabic English source text for review and recall.",aliases:[],tags:[]})');assert.ok(note.id);
 const records=[];
 for(const lang of ['ar','en']){
  const t=labels[lang];await evaluate('(async()=>{await window.electronAPI.settings.set("workspace.tabs.v1",null);await window.electronAPI.settings.set("workspace.closed.v1",null);localStorage.setItem("baglib-lang",'+JSON.stringify(lang)+')})()');await evaluate('location.reload()');await pause(900);await until('document.documentElement.lang==='+JSON.stringify(lang)+' && !!document.querySelector("[data-assistant-fab]")');
  assert.equal(await evaluate('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');
  await evaluate('window.electronAPI.ai.saveSettings({enabled:true,provider:"ollama",ollamaEndpoint:"http://127.0.0.1:'+fake.address().port+'",ollamaModel:"stub",translationProvider:"llm"})');
  const book=books.find(b=>b.filePath===path.resolve('tests/real-files',files[lang==='ar'?0:1].path));assert.ok(book);
  app.emit('open-url',{preventDefault(){}},'baglib:book:'+book.id+'@'+book.sourceId+'#p=1');await until('!!document.querySelector("[data-reader-source]")');
  const annotationCount=(await evaluate('window.electronAPI.getAnnotations('+JSON.stringify(book.id)+')')).length;
  const legacy=await evaluate('window.electronAPI.ai.executeTool('+JSON.stringify({bookId:book.id,bookTitle:book.title,currentPage:1,tool:'structured_summary',surroundingContext:'Mixed عِلْمٌ text',saveAsNote:true})+')');assert.equal(legacy.savedNoteId,undefined);assert.equal((await evaluate('window.electronAPI.getAnnotations('+JSON.stringify(book.id)+')')).length,annotationCount);
  await click('button[title='+JSON.stringify(t.backToLibrary)+']');await until('!document.querySelector("[data-reader-source]")');await click('[data-nav-item=notes]');
  await evaluate('window.dispatchEvent(new CustomEvent("baglib:open-assistant",{detail:{sources:[{target:"note:'+note.id+'",label:"Source مصدر"}]}}))');await until('!!document.querySelector("[data-assistant-panel]")');
  assert.equal(await evaluate('document.querySelector("[data-ai-recall-nudge]").textContent'),t.aiRecallNudge);
  await setValue('[data-research-ai-input]','Explain عِلْمٌ');await click('[data-assistant-panel] button[type=submit]');await until('!!document.querySelector("[data-assistant-panel] [data-ai-principles-notice]")');
  assert.ok(await evaluate('document.querySelector("[data-assistant-panel] [data-ai-principles-notice]").textContent.includes('+JSON.stringify(t.aiGeneratedMarker)+')'));
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('chat-'+lang);
  await click('[data-assistant-save-note]');await until('!!document.querySelector("[data-note-editor-pane] [data-study-note-editor] .cm-content")');await until('document.querySelector("[data-note-editor-pane] [data-study-note-editor] .cm-content").textContent.includes('+JSON.stringify(t.aiGeneratedMarker)+')');
  await click('[data-assistant-study-tools]');await until('!!document.querySelector("[data-study-assistant]")');await setValue('[data-assistant-question]','Explain عِلْمٌ');const turnsBefore=await evaluate('document.querySelectorAll("[data-assistant-turn]").length');await click('[data-assistant-ask]');await until('document.querySelectorAll("[data-assistant-turn]").length>'+turnsBefore+' && !document.querySelector("[data-assistant-latest][data-assistant-pending]")');await until('!!document.querySelector("[data-assistant-latest] [data-ai-principles-notice]")');await shot('study-'+lang);
  const cardTurns=await evaluate('document.querySelectorAll("[data-assistant-turn]").length');await click('[data-assistant-task-option=cards]');await until('document.querySelectorAll("[data-assistant-turn]").length>'+cardTurns+' && !document.querySelector("[data-assistant-latest][data-assistant-pending]")');await until('!!document.querySelector("[data-assistant-latest] [data-assistant-card-add]")');const before=await evaluate('window.electronAPI.knowledgeCards.list({})');await click('[data-assistant-latest] [data-assistant-card-add]');await until('!!document.querySelector("[data-assistant-latest] [data-assistant-card-state=added]")');const after=await evaluate('window.electronAPI.knowledgeCards.list({})');const items=after.items??after;fs.writeFileSync(path.join(evidence,'card-debug.json'),JSON.stringify({lang,marker:t.aiGeneratedMarker,items},null,2));assert.ok(items.some(c=>c.back.includes(t.aiGeneratedMarker)));assert.equal(items.length,(before.items??before).length+1);await shot('cards-'+lang);
  await click('[data-study-assistant] header button');
  records.push({lang,realFile:files[lang==='ar'?0:1].path,readerOpened:true,noUnreviewedSave:true,generatedNoteDraft:true,reviewedCardMarker:true,notice:true,recallNudge:true});
 }
 assert.ok(requests.every(r=>r.system.includes('Never issue a religious ruling or fatwa')));assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({records,requests:requests.length,errors},null,2));console.log('KEY-435 LIVE PASS',JSON.stringify(records));fake.close();app.exit(0);
}
fake.listen(0,'127.0.0.1',()=>require(path.resolve('dist/main/index.js')));
