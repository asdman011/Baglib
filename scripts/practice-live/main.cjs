const {app}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const profile=process.env.BAGLIB_PRACTICE_PROFILE,evidence=process.env.BAGLIB_PRACTICE_EVIDENCE,lang=process.env.BAGLIB_PRACTICE_LANG;
const files=JSON.parse(process.env.BAGLIB_PRACTICE_FILES);app.setPath('userData',profile);app.setAppPath(path.resolve(__dirname,'../..'));
app.setAsDefaultProtocolClient=()=>{throw new Error('No protocol registration in live check');};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let started=false;
app.on('browser-window-created',(_,win)=>{
 if(started)return;started=true;
 const evaluate=code=>win.webContents.executeJavaScript(code,true);
 const until=async code=>{for(let i=0;i<300;i++){try{if(await evaluate(code))return;}catch{}await pause(200);}throw new Error(`Timeout: ${code}`);};
 const api=(method,input)=>evaluate(`window.electronAPI.knowledgeCards.${method}(${JSON.stringify(input)})`);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const shot=async name=>{win.show();win.focus();win.webContents.focus();await pause(600);fs.writeFileSync(path.join(evidence,`${lang}-${name}.png`),(await win.webContents.capturePage()).toPNG());};
 (async()=>{
  win.setContentSize(1280,900);win.show();win.focus();win.webContents.focus();
  await until('!!window.electronAPI&&!!document.querySelector("footer")');
  await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(lang)})`);win.reload();await until('!!window.electronAPI&&!!document.querySelector("footer")');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(1000);
  const file=files.find(f=>f.lang===lang);const id=`practice-book-${lang}`;
  let books=await evaluate('window.electronAPI.getAllBooks()');
  if(!books.some(b=>b.id===id))await evaluate(`window.electronAPI.addBook({id:${JSON.stringify(id)},title:${JSON.stringify('Practice — '+lang)},bookType:'digital',digitalFormat:'PDF',filePath:${JSON.stringify(file.path)}})`);
  books=await evaluate('window.electronAPI.getAllBooks()');const book=books.find(b=>b.id===id);assert.ok(book.sourceId);
  const sourceRef=require(path.join(evidence,'study-target.cjs')).bookStudyTarget(book,file.page);
  win.reload();await until('!!window.electronAPI&&!!document.querySelector("footer")');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(1000);
  await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(lang==='ar'?'سجل الملاحظات':'Notes Log')})?.click()`);
  await until('!!document.querySelector("[data-srs-review]")');
  const input={front:(lang==='ar'?'اختر النص المطابق للمقتطف: ':'Choose the matching passage: ')+file.passage,back:file.passage,sourceKind:'book',sourceRef,workId:id};
  const results=[];
  for(const width of [1280,480]) {
   win.setContentSize(width,900);await pause(500);
   for(const kind of ['choice','numeric','short','application','recall']){
    const payload=kind==='choice'?{options:[file.passage,'غير مطابق — Different'],correctIndex:0}:kind==='numeric'?{answer:3,tolerance:0.1,unit:lang==='ar'?'صفحات':'pages'}:kind==='recall'?null:{modelAnswer:file.passage};
    const front=kind==='numeric'?(lang==='ar'?'كم صفحة قُرئت في هذا المقتطف (١ إلى ٣)؟ ':'How many pages were sampled for this passage (1 to 3)? ')+file.passage:input.front;
    const card=await api('save',{...input,front:`${kind} ${width}: ${front}`,questionKind:kind,payload});
    await evaluate(`window.electronAPI.knowledgeCards.setMemorizing(${JSON.stringify(card.id)},true);window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'))`);
    await until(`document.querySelector('[data-srs-card]')?.dataset.srsCard===${JSON.stringify(card.id)}`);
    const root='[data-srs-review]';
    assert.equal(await evaluate(`document.querySelector('${root}').dir`),lang==='ar'?'rtl':'ltr');
    assert.equal(await evaluate(`document.querySelector('${root} [data-practice-reveal],${root} [data-srs-reveal]').disabled`),true);
    await click(`${root} input[name="${kind==='recall'?'srs-confidence':`confidence-${card.id}`} "]`.replace(' "]','"]')+'[value="3"]');
    if(kind==='recall'){
     await click(`${root} [data-srs-reveal]`);await until(`!!document.querySelector('${root} [data-srs-answer]')`);
    } else {
     if(kind==='choice')await click(`${root} input[name="choice-${card.id}"][value="1"]`);
     else await evaluate(`(()=>{const e=document.querySelector('${root} textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(kind==='numeric'?'٣':'إجابتي — My answer')});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
     await click(`${root} [data-practice-reveal]`);await until(`!!document.querySelector('${root} [data-practice-save]')`);
     if(kind==='choice')await evaluate(`(()=>{const e=document.querySelector('${root} select');e.value='reading';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
     if(kind==='application')await evaluate(`(()=>{const e=document.querySelector('${root} select');e.value='partial';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
     await click(`${root} [data-practice-save]`);await until(`!!document.querySelector('${root} [data-practice-saved]')`);
    }
    if(kind==='choice'||kind==='short'){
     await evaluate(`document.querySelector('${root} [data-practice-saved]').scrollIntoView({block:'center'})`);await shot(`${kind}-${width}`);
     assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    }
    await click(`${root} [data-srs-rating="3"]`);await until(`document.querySelector('[data-srs-card]')?.dataset.srsCard!==${JSON.stringify(card.id)}`);
    const attempts=await api('listAttempts',{knowledgeId:card.id});assert.equal(attempts.length,1);assert.equal(attempts[0].sourceRef,sourceRef);assert.equal(attempts[0].confidence,3);
    assert.equal(attempts[0].checkMethod,kind==='choice'||kind==='numeric'?'auto':kind==='short'?'judgment':'self');
    if(kind==='choice'){assert.equal(attempts[0].result,'incorrect');assert.equal(attempts[0].mistakeCategory,'reading');}
    if(kind==='numeric')assert.equal(attempts[0].result,'correct');
    if(kind==='short'){
      const judged=await api('judgeAttempt',{id:attempts[0].id,result:'partial',mistakeCategory:'definition'});assert.equal(judged.result,'partial');
      await assert.rejects(()=>api('judgeAttempt',{id:attempts[0].id,result:'correct'}));
    }
    await api('remove',card.id);const deleted=await api('listAttempts',{knowledgeId:card.id});assert.equal(deleted[0].deleted,true);
    results.push({width,kind,attempt:attempts[0]});
   }
  }
  await evaluate("window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'))");
  await until('!!document.querySelector("[data-practice-history]")');
  await evaluate("document.querySelector('[data-practice-history]').scrollIntoView({block:'start'})");await shot('history-480');
  // Drive the real saved-card editor, including kind-specific fields.
  const before=await api('list',{});
  await click('[data-saved-cards] > button');await until('!!document.querySelector("[data-question-editor]")');
  await evaluate(`(()=>{const form=document.querySelector('[data-question-editor]');const a=form.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(a,${JSON.stringify('Editor '+lang+' - '+file.passage)});a.dispatchEvent(new Event('input',{bubbles:true}));const s=form.querySelector('select');s.value='numeric';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`!!document.querySelector('[data-question-editor] input[type="number"]')`);
  await evaluate(`(()=>{const e=document.querySelector('[data-question-editor] input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'7');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate("document.querySelector('[data-question-editor]').scrollIntoView({block:'start'})");await shot('editor-480');
  await click('[data-question-editor] button[type="submit"]');await until('!document.querySelector("[data-question-editor]")');
  const created=(await api('list',{})).find(c=>!before.some(b=>b.id===c.id));assert.ok(created);assert.equal(created.questionKind,'numeric');assert.equal(created.payload.answer,7);
  // Edit the saved numeric card into a choice question through its actual editor.
  await evaluate(`Array.from(document.querySelector('[data-saved-card="${created.id}"]').querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(lang==='ar'?'\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0633\u0624\u0627\u0644':'Edit question')}).click()`);
  await until('!!document.querySelector("[data-question-editor]")');
  await evaluate("(()=>{const s=document.querySelector('[data-question-editor] select');s.value='choice';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until("document.querySelectorAll('[data-question-editor] textarea').length===3");
  await evaluate(`(()=>{const e=document.querySelectorAll('[data-question-editor] textarea')[2];Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(file.passage+'\nDifferent')});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('[data-question-editor] button[type="submit"]');await until('!document.querySelector("[data-question-editor]")');
  const edited=(await api('list',{})).find(c=>c.id===created.id);assert.equal(edited.questionKind,'choice');assert.equal(edited.payload.options[0],file.passage);assert.ok(edited.cardRevision>created.cardRevision);
  // Drive pending judgment in the retained-history UI.
  const pendingCard=await api('save',{...input,front:'Judgment '+lang+': '+file.passage,questionKind:'short',payload:{modelAnswer:file.passage}});
  const pending=await api('recordAttempt',{knowledgeId:pendingCard.id,cardRevision:pendingCard.cardRevision,answerText:'My answer',confidence:2,checkMethod:'judgment'});
  await evaluate("window.dispatchEvent(new CustomEvent('baglib:practice-recorded'))");
  await until('!!document.querySelector("[data-practice-history] form")');
  await evaluate("(()=>{const f=document.querySelector('[data-practice-history] form');const r=f.querySelector('[name=result]');r.value='incorrect';r.dispatchEvent(new Event('change',{bubbles:true}));const m=f.querySelector('[name=mistake]');m.value='method';m.dispatchEvent(new Event('change',{bubbles:true}));f.querySelector('button[type=submit]').click();})()");
  await until('!document.querySelector("[data-practice-history] form")');
  const judged=(await api('listAttempts',{knowledgeId:pendingCard.id}))[0];assert.equal(judged.result,'incorrect');assert.equal(judged.checkMethod,'judgment');assert.equal(judged.mistakeCategory,'method');assert.equal(judged.id,pending.id);
  await evaluate("(()=>{const h=document.querySelector('[data-practice-history]');Array.from(h.querySelectorAll('button')).at(-1).click();})()");
  await until('!!document.querySelector("[data-practice-history] [role=alertdialog]")');
  await evaluate("document.querySelector('[data-practice-history] [role=alertdialog]').scrollIntoView({block:'center'})");await shot('clear-confirm-480');
  await evaluate("document.querySelectorAll('[data-practice-history] [role=alertdialog] button')[1].click()");
  assert.ok((await api('listAttempts',{})).length>=10);
  // A history source action must reopen the exact real-file passage.
  await evaluate("document.querySelector('[data-practice-source]').click()");
  await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)} && document.querySelector('[data-reader-page]')?.dataset.readerPage===${JSON.stringify(String(file.page))}`);
  await until("!!document.querySelector('.textLayer span')");await shot('source-passage-480');
  fs.writeFileSync(path.join(evidence,`${lang}-checks.json`),JSON.stringify({passed:true,sourceRef,results},null,2));app.quit();
 })().catch(async error=>{console.error(error);fs.writeFileSync(path.join(evidence,`${lang}-failure.txt`),String(error.stack));fs.writeFileSync(path.join(evidence,`${lang}-failure.html`),await evaluate('document.body.innerHTML').catch(()=>''));await shot('failure').catch(()=>{});app.exit(1);});
});
require('../../dist/main/index.js');
