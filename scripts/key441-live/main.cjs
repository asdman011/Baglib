const { app } = require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const profile=process.env.BAGLIB_KEY441_PROFILE,evidence=process.env.BAGLIB_KEY441_EVIDENCE;
assert.equal(path.dirname(profile),fs.realpathSync('.baglib-data'));
app.setPath('userData',profile);app.setAppPath(process.cwd());
process.on('uncaughtException',e=>{console.error(e);app.exit(1)});
process.on('unhandledRejection',e=>{console.error(e);app.exit(1)});
setTimeout(()=>{console.error('KEY-441 hard timeout');app.exit(1)},200000).unref();
const labels=require(path.join(profile,'labels.cjs')).translations;

const requests=[];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const address=String(url);
 if (['api-free.deepl.com','api.deepl.com','translation.googleapis.com','translate.googleapis.com','translate.api.cloud.yandex.net'].includes(new URL(address).hostname)) {
  assert.equal(init?.redirect,'error');requests.push({endpoint:address.split('?')[0],text:JSON.parse(init.body||'{}')});
  if(address.includes('translate_a'))return Response.json([[['Public ترجمة translation']]]);
  return Response.json(address.includes('translation.googleapis')?{data:{translations:[{translatedText:'ترجمة Translation عِلْمٌ'}]}}:{translations:[{text:'ترجمة Translation عِلْمٌ'}]});
 }
 throw Error('Unexpected network access in privacy live run');
};
let started=false;
app.on('browser-window-created',(_,win)=>{if(started)return;started=true;const errors=[];
 win.webContents.on('console-message',(_,level,msg)=>{if(level>=3)errors.push(msg)});
 win.webContents.once('did-finish-load',()=>run(win,errors).catch(async e=>{console.error(e);fs.writeFileSync(path.join(evidence,'failure.txt'),e.stack+'\n'+JSON.stringify(errors));try{fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG())}catch{}app.exit(1)}));
});
async function run(win,errors){
 await win.loadURL('app://-/');
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
 const records=[];
 for(const lang of ['ar','en']){
  const t=labels[lang];await evaluate('(async()=>{await window.electronAPI.settings.set("workspace.tabs.v1",null);await window.electronAPI.settings.set("workspace.closed.v1",null);localStorage.setItem("baglib-lang",'+JSON.stringify(lang)+')})()');await evaluate('location.reload()');await pause(900);await until('document.documentElement.lang==='+JSON.stringify(lang)+' && !!document.querySelector("[data-assistant-fab]")');
  assert.equal(await evaluate('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');
  const file=files[lang==='ar'?0:1],book=books.find(b=>b.filePath===path.resolve('tests/real-files',file.path));assert.ok(book);
  await evaluate('window.electronAPI.ai.saveSettings({enabled:true,provider:"ollama",translationProvider:"deepl",translationApiKey:"stub:fx",translationConsent:null,googlePublicTranslation:false})');
  app.emit('open-url',{preventDefault(){}},'baglib:book:'+book.id+'@'+book.sourceId+'#p=1');await until('!!document.querySelector("[data-reader-source]")');
  const extracted=await evaluate('window.electronAPI.extractPdfText('+JSON.stringify(path.resolve('tests/real-files',file.path))+')');
  fs.writeFileSync(path.join(evidence,'extract-shape-'+lang+'.json'),JSON.stringify(extracted).slice(0,1500));
  const text=typeof extracted==='string'?extracted:extracted?.text||extracted?.pages?.map(p=>p.text).join(' ');assert.ok(text?.trim(),'real PDF text extracted');
  await click('[data-pdf-header-more]');await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent.trim()==='+JSON.stringify(t.aiAssistantTitle)+').click()');
  await until('Array.from(document.querySelectorAll("textarea")).some(e=>e.placeholder==='+JSON.stringify(t.aiChatQueryPlaceholder)+')');
  await setValue('textarea[placeholder='+JSON.stringify(t.aiChatQueryPlaceholder)+']',text.slice(0,250)+' عِلْمٌ English');
  const byText=async label=>{await evaluate('(()=>{const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+');if(!b)throw Error("Missing button");b.click()})()');await pause(250)};
  await byText(t.aiToolTranslation);const before=requests.length;await byText(t.aiExecuteActionBtn);await until('!!document.querySelector("[data-reader-ai-consent]")');assert.equal(requests.length,before);
  assert.ok(await evaluate('document.querySelector("[data-reader-ai-consent]").textContent.includes("https://api-free.deepl.com/v2/translate")'));
  await shot('consent-'+lang);await byText(t.assistantConsentCancel);assert.equal(requests.length,before);
  await byText(t.aiExecuteActionBtn);await until('!!document.querySelector("[data-reader-ai-consent]")');await byText(t.assistantConsentAllow);await until('document.body.innerText.includes("Translation عِلْمٌ")');assert.equal(requests.length,before+1);
  await click('button[title='+JSON.stringify(t.aiSettingsBtn)+']');await until('!!document.querySelector("[data-translation-revoke]")');await click('[data-translation-revoke]');assert.ok(!(await evaluate('window.electronAPI.ai.getSettings()')).translationConsent);await shot('settings-'+lang);
  // Dedicated IPC cannot bypass revocation or input validation.
  const denied=await evaluate('window.electronAPI.ai.translate({text:"private"})');assert.equal(denied.error,'permission-denied');assert.equal(denied.translatedText,'');
  const invalid=await evaluate('window.electronAPI.ai.translate(null)');assert.equal(invalid.error,'invalid-request');assert.equal(requests.length,before+1);
  // Select Google in persisted settings and verify the public service remains explicitly off.
  await evaluate('window.electronAPI.ai.saveSettings({translationProvider:"google",translationApiKey:"",translationConsent:null,googlePublicTranslation:false})');
  assert.equal((await evaluate('window.electronAPI.ai.translate({text:"private"})')).error,'not-configured');assert.equal(requests.length,before+1);
  await click('[role=dialog] button[aria-label='+JSON.stringify(t.close)+']');await click('[data-pdf-header-more]');await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent.trim()==='+JSON.stringify(t.aiAssistantTitle)+').click()');await pause(200);await click('button[title='+JSON.stringify(t.aiSettingsBtn)+']');await until('!!document.querySelector("[data-google-public]")');assert.equal(await evaluate('document.querySelector("[data-google-public]").checked'),false);assert.ok(await evaluate('document.querySelector("[data-translation-privacy]").textContent.includes('+JSON.stringify(t.aiTranslationPublicGoogle)+')'));await shot('public-google-'+lang);
  await click('[role=dialog] button[aria-label='+JSON.stringify(t.close)+']');await click('[data-pdf-header-more]');await evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).find(e=>e.textContent.trim()==='+JSON.stringify(t.aiAssistantTitle)+').click()');await pause(200);await evaluate('window.electronAPI.ai.saveSettings({translationProvider:"yandex",translationApiKey:"stub-key"})');await byText(t.aiToolTranslation);await byText(t.aiExecuteActionBtn);await until('!!document.querySelector("[data-reader-ai-consent]")');assert.ok(await evaluate('document.querySelector("[data-reader-ai-consent]").textContent.includes("translate.api.cloud.yandex.net")'));await byText(t.assistantConsentCancel);assert.equal(requests.length,before+1);
  records.push({lang,file:file.path,cancelSentNothing:true,consentBeforeContent:true,revocation:true,directIpcGuard:true,publicGoogleDefaultOff:true});
 }
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({records,requests:requests.length,errors},null,2));console.log('KEY-441 LIVE PASS',JSON.stringify(records));app.exit(0);
}
require(path.resolve('dist/main/index.js'));
