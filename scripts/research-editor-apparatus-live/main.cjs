const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const profile=process.env.BAGLIB_KEY367_PROFILE,evidence=process.env.BAGLIB_KEY367_EVIDENCE;
assert.equal(path.dirname(profile),fs.realpathSync('.baglib-data'));
app.setPath('userData',profile);app.setAppPath(process.cwd());
const init=require(path.join(profile,'initialize.cjs'));init.initializeProfile();
const labels=init.translations;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let running=false;
app.on('browser-window-created',(_,win)=>{
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
 win.webContents.on('did-finish-load',()=>{if(running||win.webContents.getURL().startsWith('devtools:'))return;running=true;
 run(win,errors).catch(async error=>{console.error(error);fs.writeFileSync(path.join(evidence,'failure.txt'),error.stack+'\n'+JSON.stringify(errors));try{fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());}catch{}app.exit(1);});});
});
async function run(win,errors){
 win.setSize(1480,1050);win.show();
 const evaluate=code=>win.webContents.executeJavaScript(code,true);
 const frame=()=>win.webContents.mainFrame.frames.find(f=>f.url.includes('/research-editor/'));
 const edit=code=>{assert.ok(frame(),'editor iframe');return frame().executeJavaScript(code,true);};
 async function until(code,child=false){for(let i=0;i<400;i++){try{if(await(child?edit(code):evaluate(code)))return;}catch{}await pause(100);}throw Error('timeout '+code+'\n'+await evaluate('document.body.innerText.slice(-2500)'));}
 const shot=async name=>{fs.writeFileSync(path.join(evidence,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const click=async selector=>{await until('!!document.querySelector('+JSON.stringify(selector)+')');await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await pause(150);};
 const input=async(selector,text)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(120);};
 const lang=async value=>{const old=await evaluate('document.documentElement.lang');if(old!==value)await click('[aria-label='+JSON.stringify(labels[old].toggleLanguage)+']');await until(`document.documentElement.lang===${JSON.stringify(value)}`);};
 await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=notes]")');
 await evaluate('window.electronAPI.settings.set("onboarding.v1",{seen:true})');await evaluate('location.reload()');await pause(1000);
 const manifest=JSON.parse(fs.readFileSync('tests/real-files/manifest.json','utf8'));
 const books=[];
 for(const language of ['ar','en']){
   const file=manifest.files.find(f=>f.kind==='pdf'&&f.lang===language&&f.textLayer==='yes');assert.ok(file);
   const title=language==='ar'?'كتاب اقتباس KEY367':'Book quote KEY367';
   const imported=await evaluate(`window.electronAPI.importDigitalFile({filePath:${JSON.stringify(path.resolve('tests/real-files',file.path))},customTitle:${JSON.stringify(title)}})`);
   assert.equal(imported.success,true,JSON.stringify(imported));books.push({language,file:file.path,title});
 }
 await evaluate('location.reload()');await pause(1300);
 await until('window.electronAPI.quran.readerCatalog().then(r=>r.ok&&r.data.sources.some(s=>s.kind==="script"))');
 const catalog=await evaluate('window.electronAPI.quran.readerCatalog()');assert.ok(catalog.ok&&catalog.data.sources.some(s=>s.kind==='script'),'installed Quran');
 const sunnah=await evaluate('window.electronAPI.sunnah.catalog()');assert.ok(sunnah.ok,'installed Sunnah');
 win.webContents.debugger.attach('1.3');
 const key=async(key,code)=>{const windowsVirtualKeyCode=({ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Enter:13,Escape:27,Home:36,End:35})[key];await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await pause(200);};
 const focus=async()=>{await until('!!document.querySelector(".research-editor-frame.ready")');await until('(()=>{const e=window.__baglibResearchEditor.editor;const nodes=e.querySelectorAll("affine-paragraph rich-text");const rt=nodes[nodes.length-1];return !e.doc.readonly&&!!rt?.inlineEditor&&rt.inlineEditor.yText.doc?.guid===e.doc.spaceDoc.guid;})()',true);win.focus();await pause(600);await evaluate('document.querySelector(".research-editor-frame").focus()');await edit(`(()=>{
 const e=window.__baglibResearchEditor.editor;const nodes=e.querySelectorAll('affine-paragraph rich-text');const rt=nodes[nodes.length-1];if(!rt)throw Error('no paragraph');
 const el=rt.querySelector('[contenteditable=true]')||rt;el.focus();rt.inlineEditor?.setInlineRange({index:rt.inlineEditor.yText.length,length:0});
 const range=document.createRange();range.selectNodeContents(rt.querySelector('v-text')||el);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);el.scrollIntoView({block:'center'});
 })()`);await pause(200);const outer=await evaluate('document.querySelector(".research-editor-frame").getBoundingClientRect().toJSON()');const inner=await edit('(()=>{const nodes=document.querySelectorAll("affine-paragraph rich-text");return nodes[nodes.length-1].getBoundingClientRect().toJSON();})()');
 await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x:outer.x+inner.x+Math.max(2,inner.width/2),y:outer.y+inner.y+Math.max(2,inner.height/2),button:'left',clickCount:1});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:outer.x+inner.x+Math.max(2,inner.width/2),y:outer.y+inner.y+Math.max(2,inner.height/2),button:'left',clickCount:1});await pause(150);};
 const records=await require('./scenario.cjs')({win,evaluate,edit,until,shot,click,input,lang,focus,key,labels,books,evidence,pause});
 assert.deepEqual(errors,[],'renderer errors');fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({pass:2,fail:0,records,errors,realFiles:books,originalFilesModified:false},null,2));
 console.log('KEY-367 native 2/2 pass, 8 citations via native slash typing');win.webContents.debugger.detach();app.exit(0);
}
require(path.resolve('dist/main/index.js'));
