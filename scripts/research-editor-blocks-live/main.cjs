const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const profile=process.env.BAGLIB_KEY366_PROFILE,evidence=process.env.BAGLIB_KEY366_EVIDENCE;
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
   const title=language==='ar'?'كتاب اقتباس KEY366':'Book quote KEY366';
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
 const records=[];
 for(const language of ['ar','en']){
  await lang(language);const t=labels[language];
  await click('[data-nav-item=notes-editor]');await until('window.__baglibResearchEditor?.ready',true);
  await input('[aria-label='+JSON.stringify(t.manuscriptNew)+']','KEY-366 '+language);await click('.manuscript-list form button[type=submit]');
  await until('!!document.querySelector("[data-manuscript-tree]")');
  await input('[aria-label='+JSON.stringify(t.manuscriptChapterNew)+']','Mixed بحث '+language);await click('[data-manuscript-tree] form button[type=submit]');
  await until('!!document.querySelector("[data-document-id]")');
  const id=await evaluate('document.querySelector("[data-document-id]").dataset.documentId');
  await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name');await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`,true);
  const cases=language==='ar'?[['ayah','آية','الله'],['hadith','حديث','الأعمال بالنيات'],['verse','شعر','الله'],['book-quote','كتاب',books[0].title]]:[['ayah','quran','Allah'],['hadith','hadith','intentions'],['verse','poetry','love'],['book-quote','book',books[1].title]];
  for(const [kind,alias,query] of cases){
    await focus();
    if(kind==='ayah'){await win.webContents.debugger.sendCommand('Input.insertText',{text:'Before suffix'});for(let n=0;n<6;n++)await key('ArrowLeft','ArrowLeft');}
    await shot(language+'-'+kind+'-before-slash');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'/',code:'Slash',text:'/'});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'/',code:'Slash'});await pause(200);
    await until('!!document.querySelector("baglib-slash-menu")',true);
    await win.webContents.debugger.sendCommand('Input.insertText',{text:alias});await pause(250);
    const filtered=await edit(`(()=>{const m=document.querySelector('baglib-slash-menu');return {query:m?.query,items:m?.items?.map(i=>i.name)}})()`);
    assert.ok(filtered.items?.length>0,'alias filters to BagLib items '+JSON.stringify(filtered));
    await shot(language+'-'+kind+'-slash');
    await key('Enter','Enter');await until('!!document.querySelector("baglib-source-search")',true);
    await win.webContents.debugger.sendCommand('Input.insertText',{text:query});
    await until('document.querySelector("baglib-source-search")?.results?.length>0',true);
    await edit('document.querySelector("baglib-source-search").updateComplete');
    const found=await edit('document.querySelector("baglib-source-search").results');
    assert.ok(found.length<=8);assert.equal(found[0].kind,kind);
    assert.equal(await edit('document.querySelector("baglib-source-search").selected'),0,'typing keeps the first result selected until the pointer moves');
    let chosen = kind === 'verse' ? found.findIndex(r=>r.props.verses.length>=2) : kind === 'hadith' ? found.findIndex(r=>r.props.grade) : 0;
    if(chosen<0) chosen=0;
    const hovered=await edit('document.querySelector("baglib-source-search").selected');
    for(let move=hovered;move>chosen;move--)await key('ArrowUp','ArrowUp');
    for(let move=hovered;move<chosen;move++)await key('ArrowDown','ArrowDown');
    const picked=found[await edit('document.querySelector("baglib-source-search").selected')];
    if(kind==='verse') assert.ok(picked.props.verses.length>=2,'multi-verse passage');
    await shot(language+'-'+kind+'-results');
    await key('Enter','Enter');await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('baglib:${kind}').length===1`,true);
    if(kind==='ayah'){await pause(200);await win.webContents.debugger.sendCommand('Input.insertText',{text:'Mixed \u0639\u0650\u0644\u0645 '});const paragraphs=await edit('window.__baglibResearchEditor.editor.doc.getModelsByFlavour("affine:paragraph").map(m=>m.props.text.toString())');assert.ok(paragraphs.includes('Before '),'prefix stays before source');assert.ok(paragraphs.some(text=>text.includes('suffix')&&text.includes('Mixed')),'typing resumes with suffix after source');}
    records.push({language,kind,alias,query,filtered,props:picked.props});
  }
  // Preserve ordinary BlockSuite slash actions alongside the four BagLib commands.
  await focus();
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'/',code:'Slash',text:'/'});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'/',code:'Slash'});
  await until('!!document.querySelector("baglib-slash-menu")',true);await win.webContents.debugger.sendCommand('Input.insertText',{text:'Heading 2'});await pause(200);
  await key('Enter','Enter');await until('window.__baglibResearchEditor.editor.doc.getModelsByFlavour("affine:paragraph").some(m=>m.props.type==="h2")',true);
  // Real reference/range search, Arabic numerals included.
  const range=await evaluate(`window.__baglibResearchEditorBridge.sources.search('ayah',${JSON.stringify(language==='ar'?'٢:٢٥٥-٢٥٧':'2:255-257')},'re366-range-${language}')`);
  assert.equal(range.length,1);assert.equal(range[0].props.url,'quran:hafs:2:255-257');
  await evaluate('window.__baglibResearchEditorBridge.explicitSave()');
  const saved=await evaluate(`window.electronAPI.manuscripts.document(${JSON.stringify(id)})`);
  const original=await edit('window.__baglibResearchEditor.snapshot()');
  assert.deepEqual(JSON.parse(saved.snapshot),original);
  const exported=await edit('window.__baglibResearchEditor.exportSources()');
  fs.writeFileSync(path.join(evidence,language+'-snapshot-export.json'),JSON.stringify({exported,original,records},null,2));
  for(const record of records.filter(r=>r.language===language)){assert.ok(exported.markdown.includes(record.props.url),'Markdown url '+record.props.url);assert.ok(exported.html.includes(record.props.url));}
  assert.ok(exported.html.includes('dir="rtl"'));assert.ok(exported.html.includes('<table'));
  fs.writeFileSync(path.join(evidence,language+'-export.md'),exported.markdown);fs.writeFileSync(path.join(evidence,language+'-export.html'),exported.html);
  await shot(language+'-all-blocks');
  await evaluate('location.reload()');await pause(1200);await until('!!document.querySelector("[data-nav-item=notes-editor]")');await click('[data-nav-item=notes-editor]');
  await until('window.__baglibResearchEditor?.ready',true);
  const after=await evaluate(`window.electronAPI.manuscripts.document(${JSON.stringify(id)})`);assert.equal(after.snapshot,saved.snapshot);
  await click('[data-manuscript-id='+JSON.stringify(after.manuscript_id)+'] .manuscript-name');
  await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name');await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`,true);
  assert.deepEqual(await edit('window.__baglibResearchEditor.snapshot()'),JSON.parse(saved.snapshot));
  const Database=require('better-sqlite3');const db=new Database(path.join(profile,'data/baglib.db'),{readonly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM manuscript_link WHERE document_id=?').get(id).n,4);db.close();
  await shot(language+'-reloaded');
  await edit(`(()=>{const doc=window.__baglibResearchEditor.editor.doc;doc.deleteBlock(doc.getModelsByFlavour('baglib:hadith')[0]);})()`);
  await evaluate('window.__baglibResearchEditorBridge.explicitSave()');
  const check=new Database(path.join(profile,'data/baglib.db'),{readonly:true});assert.equal(check.prepare('SELECT count(*) AS n FROM manuscript_link WHERE document_id=?').get(id).n,3);check.close();
  // Undo deletion before verifying actual reader navigation.
  await edit('window.__baglibResearchEditor.editor.doc.undo()');await evaluate('window.__baglibResearchEditorBridge.explicitSave()');
  for(const record of records.filter(r=>r.language===language)){
    const url=record.props.url;
    await edit(`document.querySelector('baglib-'+${JSON.stringify(record.kind)}+' a').click()`);
    if(record.kind==='ayah'){const ref=url.split(':');await until(`document.querySelector('[data-nav-item=quran][aria-current=page]') && document.body.innerText.includes(${JSON.stringify(ref[2]+':'+ref[3])})`);}
    if(record.kind==='hadith'){const ref=url.split(':').slice(3).join(':');await until(`!!document.querySelector('[data-hadith-id='+${JSON.stringify(JSON.stringify(ref))}+']')`);}
    if(record.kind==='verse'){const ref=url.split(':');await until(`!!document.querySelector('[data-poetry-id="'+${JSON.stringify(ref[2])}+'"][data-poetry-reference="'+${JSON.stringify(ref[3]+':'+ref[4])}+'"]')`);}
    if(record.kind==='book-quote') await until(`!!document.querySelector('[data-reader-source="'+${JSON.stringify(record.props.sourceId)}+'"][data-reader-page="'+${JSON.stringify(String(record.props.page))}+'"]')`);
    await shot(language+'-'+record.kind+'-reader');
    await click('[data-nav-item=notes-editor]');await until('window.__baglibResearchEditor?.ready',true);
    await click('[data-manuscript-id='+JSON.stringify(after.manuscript_id)+'] .manuscript-name');
    await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name');await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`,true);
  }
 }
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({pass:2,fail:0,records,errors,realFiles:books,originalFilesModified:false},null,2));
 assert.deepEqual(errors,[],'renderer errors');console.log('KEY-366 native 2/2 pass, 8 blocks via native slash typing');
 win.webContents.debugger.detach();app.exit(0);
}
require(path.resolve('dist/main/index.js'));
