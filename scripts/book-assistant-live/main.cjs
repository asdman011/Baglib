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
  const answer={answer:gap?'':quote,abstained:gap,citations:gap?[]:[{source:source.id,quote}]};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message:{content:JSON.stringify(answer)}}));
  console.log(JSON.stringify({lang:ar?'ar':'en',sources:user.sources.length,mode:user.question}));
 });
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let started=false;
app.on('browser-window-created',(_,win)=>{
 if(started)return;started=true;win.webContents.setBackgroundThrottling(false);
 const evaluate=code=>win.webContents.executeJavaScript(code,true);
 win.webContents.on('did-finish-load', () => { evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
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
 const ask=async()=>{await click('[data-assistant-ask]');await until('!document.querySelector("[data-assistant-ask]").disabled');await until('!!document.querySelector("[data-assistant-answer],[data-assistant-error],[data-assistant-abstained]")');};
 (async()=>{
  win.setContentSize(1280,900);win.show();win.focus();win.webContents.focus();
  const port=await new Promise(resolve=>fake.listen(0,'127.0.0.1',()=>resolve(fake.address().port)));
  await until('!!window.electronAPI && !!document.querySelector("footer")');
  await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(lang)})`);win.reload();await until('!!document.querySelector("footer")');
  await evaluate(`window.electronAPI.ai.saveSettings({enabled:true,provider:'ollama',ollamaEndpoint:'http://127.0.0.1:${port}',ollamaModel:'fake'})`);
  for(const file of files)await evaluate(`window.electronAPI.addBook(${JSON.stringify({id:file.id,title:`عِلْم Science — ${file.id}`,bookType:'digital',digitalFormat:file.format,filePath:file.path})})`);
  win.reload();await until('!!document.querySelector("footer")');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  const books=await evaluate('window.electronAPI.getAllBooks()'), results=[];
  const request=(target,question='Explain')=>({task:'qa',question,language:lang,allowRemote:false,notes:[],books:[],passages:[{target,label:'Spoofed label',text:'FORGED_RENDERER_TEXT'}]});
  for(const width of [1280,480]){
   win.setContentSize(width,900);
   for(const file of files.filter(f=>f.format==='PDF'&&!f.id.startsWith('scan'))){
    const book=books.find(b=>b.id===file.id),target=`book:${book.id}@${book.sourceId}#p=${file.page}`;
    await selectionExplain(book,file.page);await ask();
    assert.equal(await evaluate('document.querySelector("[data-assistant-error]")?.dataset.assistantError'),undefined);
    assert.equal(await evaluate('document.querySelector("[data-assistant-citation]")?.dataset.assistantCitation'),target);
    assert.ok(requests.at(-1).sources[0].text.length>100);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await evaluate("document.querySelector('[data-assistant-citation]').scrollIntoView({block:'center'})");await shot(`${file.id}-citation-${width}`);
    await click('[data-assistant-citation]');await until('!document.querySelector("[data-study-assistant]")');
    await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)}&&document.querySelector('[data-reader-page]')?.dataset.readerPage==='${file.page}'`);
    results.push({width,file:file.id,target,reopened:true,mainTextLength:requests.at(-1).sources[0].text.length});
    await closeReader();
   }
   // Scan through the visible book-page picker: typed failure, no provider call, then explicit page navigation.
   const scan=books.find(b=>b.id==='scan-ar');
   await click('[data-nav-item="notes"]');
   await until('!!document.querySelector("[data-notes-assistant]")');await click('[data-notes-assistant]');await until('!!document.querySelector("[data-study-assistant]")');
   await setValue('[data-assistant-book]',scan.id,'HTMLSelectElement');
   await until('document.querySelectorAll("[data-study-assistant] input[type=number]").length===2');
   await setValue('[data-study-assistant] input[type=number]',2,'HTMLInputElement');
   await setValue('[data-study-assistant] input[type=number]:last-child',2,'HTMLInputElement');
   // Both page controls are the last child of their own label; explicitly set the second.
   await evaluate("(()=>{const e=document.querySelectorAll('[data-study-assistant] input[type=number]')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await setValue('[data-assistant-question]','Explain');const sent=requests.length;await ask();
   assert.equal(await evaluate('document.querySelector("[data-assistant-error]")?.dataset.assistantError'),'no-text-layer');assert.equal(requests.length,sent);
   await evaluate("document.querySelector('[data-assistant-ocr]').scrollIntoView({block:'center'})");await shot(`scan-no-text-${width}`);
   await click('[data-assistant-ocr]');await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(scan.sourceId)}&&document.querySelector('[data-reader-page]')?.dataset.readerPage==='2'`);
   assert.equal(requests.length,sent);await closeReader();results.push({width,file:'scan-ar',error:'no-text-layer',ocrNavigation:true,providerCalls:0});
  }
  const book=books.find(b=>b.id==='pdf-ar'),target=`book:${book.id}@${book.sourceId}#p=2`;
  const invoke=body=>evaluate(`window.electronAPI.studyAssistant.ask(${JSON.stringify(body)})`);
  for(const [target,error] of [[`book:${book.id}@missing#p=2`,'missing-source'],[`book:${book.id}@${book.sourceId}#p=99999`,'missing-page']]){
   const sent=requests.length;const result=await invoke(request(target));assert.equal(result.error,error);assert.equal(requests.length,sent);
  }
  const trusted=await invoke({...request(target),passages:[],readerSource:{target,label:'Spoofed',text:'FORGED_RENDERER_TEXT'}});assert.ok(trusted.ok);assert.ok(!JSON.stringify(requests.at(-1)).includes('FORGED_RENDERER_TEXT'));
  const fabricated=await invoke(request(target,'__fabricate__'));assert.equal(fabricated.error,'invalid-output');
  const gap=await invoke(request(target,'__gap__'));assert.ok(gap.ok&&gap.data.abstained);
  // Render the gap message using the real assistant and local provider.
  win.setContentSize(480,900);await selectionExplain(book,2);await setValue('[data-assistant-question]','__gap__');await ask();
  assert.equal(await evaluate('document.querySelector("[data-assistant-abstained]").textContent'),lang==='ar'?'غير مشمول بالمادة المختارة.':'Not covered by the selected material.');
  await evaluate("document.querySelector('[data-assistant-abstained]').scrollIntoView({block:'center'})");await shot('gap-480');await closeAssistant();await closeReader();
  // EPUB Explain still runs on file-derived CFI text (native selection, no synthetic source text).
  const epub=books.find(b=>b.id==='epub-en');
  app.emit('open-url',{preventDefault(){}},`baglib:book:${epub.id}@${epub.sourceId}`);await until('!!document.querySelector("[data-study-epub-page]")');
  for(let i=0;i<15;i++){
   if(await evaluate("[...document.querySelectorAll('[data-study-epub-page] p')].some(e=>e.textContent.trim().length>40)"))break;
   win.webContents.sendInputEvent({type:'keyDown',keyCode:'PageDown'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'PageDown'});await pause(700);
  }
  await evaluate("(()=>{const root=[...document.querySelectorAll('[data-study-epub-page] p')].find(e=>e.textContent.trim().length>40);const range=document.createRange();range.selectNodeContents(root);window.getSelection().removeAllRanges();window.getSelection().addRange(range);root.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()");
  await until('!!document.querySelector("[data-reader-study=explain]")');await click('[data-reader-study=explain]');await until('!!document.querySelector("[data-study-assistant]")');await ask();
  assert.ok(await evaluate('!!document.querySelector("[data-assistant-citation][data-assistant-citation*=cfi]")'));
  fs.writeFileSync(path.join(evidence,`${lang}-checks.json`),JSON.stringify({passed:true,results,forgeryRefused:true,missingRefused:true,gap:true,epub:true,requests},null,2));
  fake.close();app.quit();
 })().catch(async error=>{console.error(error);fs.writeFileSync(path.join(evidence,`${lang}-failure.txt`),String(error.stack));await shot('failure').catch(()=>{});fake.close();app.exit(1);});
});
require('../../dist/main/index.js');
