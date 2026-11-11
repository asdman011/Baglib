const { app } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const profile=process.env.BAGLIB_SELECTION_PROFILE, evidence=process.env.BAGLIB_SELECTION_EVIDENCE, lang=process.env.BAGLIB_SELECTION_LANG;
const files=JSON.parse(process.env.BAGLIB_SELECTION_FILES);
app.setPath('userData',profile); app.setAppPath(path.resolve(__dirname,'../..'));
app.setAsDefaultProtocolClient=()=>{throw new Error('No protocol registration in live check');};
const requests=[];
const fake=http.createServer((req,res)=>{
 let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{
  const input=JSON.parse(body),user=JSON.parse(input.messages[1].content);requests.push(user);
  const source=user.sources[0], ar=input.messages[0].content.includes('Arabic');
  const quote=user.question==='__fabricate__'?'FABRICATED QUOTE NOT IN THIS BOOK':source.text.trim().slice(0,180);
  const gap=user.question==='__gap__';
  const answer=user.claims?{verdicts:[...user.claims.map((claim,i)=>({claim:i,status:'supported',quote:source.text.trim().slice(0,180)}))]}:{answer:gap?'':quote,abstained:gap,citations:gap?[]:[{source:source.id,quote}]};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message:{content:JSON.stringify(answer)}}));
  console.log(JSON.stringify({lang:ar?'ar':'en',sources:user.sources.length,mode:user.question}));
 });
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let started=false;
app.on('browser-window-created',(_,win)=>{
 if(started)return;started=true;win.webContents.setBackgroundThrottling(false);
 const evaluate=code=>win.webContents.executeJavaScript(code,true).catch(error=>{throw new Error(code+' :: '+error.message);});
 const until=async code=>{for(let i=0;i<300;i++){try{if(await evaluate(code))return;}catch{}await pause(200);}throw new Error('Timeout '+code);};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const setValue=(selector,value,kind='HTMLTextAreaElement')=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${kind}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${kind==='HTMLSelectElement'?'change':'input'}',{bubbles:true}));})()`);
 const shot=async name=>{win.show();win.focus();win.webContents.focus();await pause(600);fs.writeFileSync(path.join(evidence,`${lang}-${name}.png`),(await win.webContents.capturePage()).toPNG());};
 const closeAssistant=()=>evaluate("document.querySelector('[data-study-assistant]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 const closeReader=async()=>{await evaluate(`document.querySelector('button[title=${JSON.stringify(lang==='ar'?'العودة للمكتبة':'Back to Library')} ]')?.click()`);await until('!document.querySelector("[data-reader-source]")');};
 const open=async(book,page)=>{
  app.emit('open-url',{preventDefault(){}},`baglib:book:${book.id}@${book.sourceId}#p=${page}`);
  await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)}`);
  await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage==='${page}'`);
  await pause(600);
 };
 const selectionExplain=async(book,page)=>{
  await open(book,page);
  await until(`[...document.querySelectorAll('.pdf-page-container[data-page-number="${page}"] .textLayer span')].some(e=>e.textContent.trim().length>4)`);
  await evaluate(`(()=>{const root=document.querySelector('.pdf-page-container[data-page-number="${page}"] .textLayer');const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())&&n.textContent.trim().length<5){} const range=document.createRange();range.selectNodeContents(n);root.scrollIntoView({block:'center'});window.getSelection().removeAllRanges();window.getSelection().addRange(range);root.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  await until('!!document.querySelector("[data-reader-study=explain]")');await click('[data-reader-study=explain]');
  await until('!!document.querySelector("[data-assistant-reader-source]")');
 };

 (async()=>{
  win.setContentSize(1280,900);win.show();win.focus();win.webContents.focus();
  const port=await new Promise(resolve=>fake.listen(0,'127.0.0.1',()=>resolve(fake.address().port)));
  await until('!!window.electronAPI && !!document.querySelector("footer")');
  await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(lang)})`);win.reload();await until('!!document.querySelector("footer")');
  await evaluate(`window.electronAPI.ai.saveSettings({enabled:true,provider:'ollama',ollamaEndpoint:'http://127.0.0.1:${port}',ollamaModel:'fake'})`);
  for(const file of files)await evaluate(`window.electronAPI.addBook(${JSON.stringify({id:file.id,title:'عِلْم Science — '+file.id,bookType:'digital',digitalFormat:'PDF',filePath:file.path})})`);
  win.reload();await until('!!document.querySelector("footer")');
  const books=await evaluate('window.electronAPI.getAllBooks()'),results=[];
  const invoke=input=>evaluate(`window.electronAPI.studyAssistant.explainBack(${JSON.stringify(input)})`);
  const close=async()=>{await evaluate("document.querySelector('[data-explain-back] header button').click()");await until('!!document.querySelector("[data-study-assistant]")');};
  const notesAssistant=async()=>{
   await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
   await until(`(()=>{if(document.querySelector('[data-notes-assistant]'))return true;document.querySelector('[data-nav-item="notes"]')?.click();return false;})()`);
   await click('[data-notes-assistant]');await until('!!document.querySelector("[data-study-assistant]")');
  };
  const checkUi=async(target,width,label)=>{
   await click('[data-assistant-explain-back]');await until('!!document.querySelector("[data-explain-back]")');
   const seed=await invoke({target,summary:'Reading helps.',language:lang,allowRemote:false,text:'FORGED_SOURCE'});assert.ok(seed.ok,JSON.stringify(seed));
   const resumed=await evaluate(`window.electronAPI.studyAssistant.resumeExplainBack(${JSON.stringify(seed.data.id)})`);assert.ok(resumed.ok);assert.equal(resumed.data.summary,'Reading helps.');
   const text=requests.at(-1).sources[0].text;
   const claim=text.trim().slice(0,Math.min(70,text.length)).replace(/[\r\n.!?؟؛;]+/g,' ').trim();
   // Use one exact phrase where possible; the second claim is intentionally outside the passage.
   const summary=claim+'.\n'+(lang==='ar'?'القمر مصنوع من الجبن Science.':'The moon is made of cheese عِلْم.');
   await setValue('[data-explain-summary]',summary);await click('[data-explain-check]');
   await until('!!document.querySelector("[data-explain-claim]" ) || !!document.querySelector("[data-explain-error]")');
   assert.equal(await evaluate('document.querySelector("[data-explain-error]")?.dataset.explainError'),undefined);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   assert.ok(await evaluate('document.querySelector("[data-explain-save]").disabled'));
   const count=await evaluate('document.querySelectorAll("[data-explain-claim]").length');assert.equal(count,2);
   // Outside claim is downgraded despite malicious provider sending supported with an unrelated real quote.
   assert.equal(await evaluate('document.querySelectorAll("[data-explain-claim]")[1].querySelectorAll("p")[1].textContent'),lang==='ar'?'لا يدعمه المقطع':'Unsupported by the passage');
   await shot(label+'-claims-'+width);
   await evaluate("document.querySelector('[data-explain-decision]').focus()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
   assert.ok(await evaluate('!!document.activeElement.closest("[data-explain-back]")'));
   // Correct the first verdict, accept the others explicitly.
   await setValue('[data-explain-decision="0"]','supported','HTMLSelectElement');
   for(let i=1;i<count;i++)await click('[data-explain-accept="'+i+'"]');
   await click('[data-explain-save]');await until('!!document.querySelector("[data-explain-saved]")');
   await evaluate("document.querySelector('[data-explain-saved]').scrollIntoView({block:'center'})");await shot(label+'-saved-'+width);
   const attempts=await evaluate(`window.electronAPI.knowledgeCards.listAttempts({sourceRef:${JSON.stringify(target)}})`);
   assert.equal(attempts[0].result,'partial');assert.equal(attempts[0].checkMethod,'judgment');assert.equal(attempts[0].questionKind,'explain_back');
   const again=await evaluate(`window.electronAPI.studyAssistant.acceptExplainBack({id:${JSON.stringify(attempts[0].id)},decisions:${JSON.stringify(Array(count).fill('supported'))}})`);assert.equal(again.error,'attempt-changed');
   results.push({label,width,target,judgedOnce:true,mixedDirection:true,keyboard:true});
   await close();
  };
  for(const width of [1280,480]){
   win.setContentSize(width,900);
   for(const file of files.filter(f=>!f.id.startsWith('scan'))){
    const book=books.find(b=>b.id===file.id),target=`book:${book.id}@${book.sourceId}#p=${file.page}`;
    await selectionExplain(book,file.page);await checkUi(target,width,file.id);await closeAssistant();await closeReader();
   }
   await notesAssistant();await setValue('[data-assistant-book]','scan-ar','HTMLSelectElement');await until('!!document.querySelector("[data-study-assistant] input[type=number]")');
   await setValue('[data-study-assistant] input[type=number]',2,'HTMLInputElement');await click('[data-assistant-explain-back]');await until('!!document.querySelector("[data-explain-back]")');
   await setValue('[data-explain-summary]','ملخص عِلْم Science.');const sent=requests.length;await click('[data-explain-check]');await until('!!document.querySelector("[data-explain-error]")');
   assert.equal(await evaluate('document.querySelector("[data-explain-error]").dataset.explainError'),'no-text-layer');assert.equal(requests.length,sent);await shot('scan-'+width);await close();await closeAssistant();
   await notesAssistant();await setValue('[data-assistant-passage-search]','الله','HTMLInputElement');
   await until('Array.from(document.querySelectorAll("[data-assistant-passage-option]")).some(e=>e.dataset.assistantPassageOption.startsWith("quran:"))');
   const target=await evaluate('Array.from(document.querySelectorAll("[data-assistant-passage-option]")).find(e=>e.dataset.assistantPassageOption.startsWith("quran:")).dataset.assistantPassageOption');
   await click('[data-assistant-passage-option^="quran:"]');await checkUi(target,width,'quran');await closeAssistant();
  }
  // Resume a still-pending comparison from the visible practice history.
  await notesAssistant();await closeAssistant();
  // Since KEY-304 practice history sits in the Notes page's Cards tab.
  await click('[data-notes-tab="cards"]');
  await until('!!document.querySelector("[data-practice-history] button[data-explain-resume]")');
  await click('[data-explain-resume]');await until('!!document.querySelector("[data-explain-back] [data-explain-claim]")');await shot('history-resumed-480');
  assert.ok(!await evaluate('document.querySelector("[data-explain-check]")'));
  await evaluate("document.querySelector('[data-explain-back] header button').click()");
  assert.ok(!JSON.stringify(requests).includes('FORGED_SOURCE'));
  // Remote consent is rejected before connection; restore the fake local provider afterwards.
  await evaluate("window.electronAPI.ai.saveSettings({enabled:true,provider:'ollama',ollamaEndpoint:'https://example.invalid'})");
  const denied=await invoke({target:'quran:hafs:2:255',summary:'Reading helps.',language:lang,allowRemote:false});assert.equal(denied.error,'permission-denied');
  fs.writeFileSync(path.join(evidence,lang+'-checks.json'),JSON.stringify({passed:true,results,scanNoProvider:true,remoteDenied:true,forgedSourceDiscarded:true},null,2));fake.close();app.quit();
 })().catch(async error=>{console.error(error);fs.writeFileSync(path.join(evidence,lang+'-requests.json'),JSON.stringify(requests,null,2));fs.writeFileSync(path.join(evidence,lang+'-failure.txt'),String(error.stack));await shot('failure').catch(()=>{});fake.close();app.exit(1);});
});
require('../../dist/main/index.js');
