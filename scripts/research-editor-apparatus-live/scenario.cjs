const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function scenario({ win, evaluate, edit, until, shot, click, input, lang, focus, key, labels, books, evidence, pause }) {
 const records = [];
 for (const language of ['ar', 'en']) {
  await lang(language); const t = labels[language];
  await click('[data-nav-item=notes-editor]'); await until('window.__baglibResearchEditor?.ready', true);
  await input('[aria-label='+JSON.stringify(t.manuscriptNew)+']', 'KEY-367 '+language); await click('.manuscript-list form button[type=submit]');
  await until('!!document.querySelector("[data-manuscript-tree]")');
  await input('[aria-label='+JSON.stringify(t.manuscriptChapterNew)+']', 'عِلْم — Chapter '+language); await click('[data-manuscript-tree] form button[type=submit]');
  await until('!!document.querySelector("[data-document-id]")');
  const id = await evaluate('document.querySelector("[data-document-id]").dataset.documentId');
  await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name'); await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`, true);
  const types = ['ayah', 'hadith', 'verse', 'book-quote'];
  const queries = language === 'ar' ? ['٢:٢٥٥-٢٥٧', 'الأعمال بالنيات', 'الله', books[0].title] : ['2:255-257', 'intentions', 'love', books[1].title];
  for (let n=0; n<types.length; n++) {
   await focus();
   if (!n) await win.webContents.debugger.sendCommand('Input.insertText', {text: 'Before عِلْم suffix '});
   await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyDown',key:'/',code:'Slash',text:'/'});
   await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyUp',key:'/',code:'Slash'});
   await until('!!document.querySelector("baglib-slash-menu")',true);
   await win.webContents.debugger.sendCommand('Input.insertText', {text: language==='ar'?'توثيق':'cite'}); await pause(250);
   const menu = await edit('document.querySelector("baglib-slash-menu").items.map(i=>i.name)');
   assert.equal(menu.length,4,JSON.stringify(menu));
   for (let k=0;k<n;k++) await key('ArrowDown','ArrowDown');
   await key('Enter','Enter'); await until('!!document.querySelector("baglib-source-search")',true);
   await win.webContents.debugger.sendCommand('Input.insertText',{text:queries[n]});
   await until('document.querySelector("baglib-source-search")?.results?.length>0',true);
   const picked = await edit('document.querySelector("baglib-source-search").results[0]');
   assert.equal(picked.kind,types[n]);
   await key('Enter','Enter'); await until(`document.querySelectorAll('baglib-citation').length===${n+1}`,true);
   await pause(250); records.push({language,kind:types[n],props:picked.props});
   await win.webContents.debugger.sendCommand('Input.insertText',{text:' continued '+n+' '});
  }
  for (const [kind, query] of [['contents',language==='ar'?'المحتويات':'contents'],['bibliography',language==='ar'?'المراجع':'bibliography']]) {
   await focus();
   await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'/',code:'Slash',text:'/'});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'/',code:'Slash'});
   await until('!!document.querySelector("baglib-slash-menu")',true);
   await win.webContents.debugger.sendCommand('Input.insertText',{text:query});await pause(200);await key('Enter','Enter');
   await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('baglib:${kind}').length===1`,true);
  }
  await edit(`(()=>{ const e=window.__baglibResearchEditor.editor,d=e.doc,p=d.getModelsByFlavour('affine:paragraph')[0],parent=d.getParent(p); d.updateBlock(p,{type:'h1'});d.addBlock('affine:paragraph',{type:'h2',text:new p.props.text.constructor('عنوان — Methods')},parent); })()`);
  await until('document.querySelectorAll("baglib-generated-block").length===2',true);
  await pause(300);
  const state = await edit(`(()=>({markers:Array.from(document.querySelectorAll('baglib-citation button')).map(e=>e.innerText),bib:document.querySelector('baglib-generated-block[data-block-id]')?.innerText,footnotes:document.querySelector('baglib-footnote-list').shadowRoot.innerText}))()`);
  assert.deepEqual(state.markers,['1','2','3','4']);
  const initialExport = await edit('window.__baglibResearchEditor.exportSources()');
  for (let i=1;i<=4;i++) assert.ok(initialExport.markdown.includes('[^'+i+']:'),'four readable Markdown definitions');
  assert.ok(initialExport.markdown.includes('quran:hafs:2:255-257'));
  assert.ok(!initialExport.markdown.includes('"type":"url"'));
  const toolbar = 'document.querySelector("baglib-scholarly-toolbar").shadowRoot';
  await edit(toolbar+'.querySelector("button").click()'); await pause(100);
  assert.ok(await edit(toolbar+'.textContent.includes('+JSON.stringify(t.rePagePending)+')'));
  await edit(`(()=>{const r=${toolbar};r.querySelector('[name=style]').value='apa';r.querySelector('[name=placement]').value='inline';r.querySelector('[name=numbering]').value='page';r.querySelector('[name=headings]').checked=true;r.querySelector('form').requestSubmit();})()`);
  await until(toolbar+'.querySelector("[role=status]").textContent.includes('+JSON.stringify(t.reSaved)+')',true);
  await until('document.querySelectorAll("baglib-citation button sup").length===3',true);
  const inline = await edit('Array.from(document.querySelectorAll("baglib-citation button")).map(e=>e.innerText)');
  assert.ok(inline[0].includes(records.find(r=>r.language===language&&r.kind==='ayah').props.label));
  assert.deepEqual(inline.slice(1),['1','2','3']);
  for (const style of ['arabic','chicago','apa']) {
    await edit(`(()=>{const r=${toolbar};r.querySelector('[name=style]').value=${JSON.stringify(style)};r.querySelector('form').requestSubmit()})()`);
    await until(toolbar+'.host.saving===false && '+toolbar+'.querySelector("[role=status]").textContent.includes('+JSON.stringify(t.reSaved)+')',true);
    const text = await edit(`(()=>{const b=Array.from(document.querySelectorAll('baglib-generated-block')).find(b=>b.model.flavour==='baglib:bibliography');return (b.shadowRoot||b).querySelector('nav').innerText})()`);
    if(style==='apa') assert.ok(text.includes(t.reNoDate));
    else if(style==='chicago') assert.ok(text.includes('“'));
    else assert.ok(text.includes(' — '));
  }
  const generated = await edit('Array.from(document.querySelectorAll("baglib-generated-block")).map(e=>e.shadowRoot?.innerHTML||e.innerHTML)');
  assert.ok(generated.join('').includes('1.1')); assert.ok(generated.join('').includes(t.reNoDate));
  await edit(`(()=>{const b=Array.from(document.querySelectorAll('baglib-generated-block')).find(b=>b.model.flavour==='baglib:contents');(b.shadowRoot||b).querySelector('a').click();})()`);
  await until(`Array.from(document.querySelectorAll('affine-paragraph')).some(e=>e.dataset.headingNumber==='1'&&e.id.startsWith('baglib-heading-'))`,true);
  const headingDom = await edit(`Array.from(document.querySelectorAll('affine-paragraph')).map(e=>({id:e.id,block:e.getAttribute('data-block-id'),number:e.dataset.headingNumber,wrapper:e.querySelector('.affine-paragraph-rich-text-wrapper')?.outerHTML.slice(0,800)}))`);
  assert.ok(headingDom.some(e=>e.number==='1'&&e.id.startsWith('baglib-heading-')),JSON.stringify(headingDom));
  await shot(language+'-inline-apa-numbered');
  const original = await edit('window.__baglibResearchEditor.snapshot()');
  const exported = await edit('window.__baglibResearchEditor.exportSources()');
  assert.deepEqual(await edit('window.__baglibResearchEditor.snapshot()'),original,'exports leave canonical data unchanged');
  assert.ok(exported.markdown.includes('[^1]')); assert.ok(!exported.markdown.includes('"type":"url"'));
  assert.ok(exported.markdown.includes('<a id="baglib-heading-'));
  assert.ok(exported.html.includes('id="baglib-heading-'));
  assert.ok(exported.html.includes('href="#baglib-footnote-1"'));
  assert.ok(exported.html.includes('id="baglib-footnote-1"'));
  for (const record of records.filter(r=>r.language===language)) { assert.ok(exported.markdown.includes(record.props.url)); assert.ok(exported.html.includes(record.props.url)); }
  fs.writeFileSync(path.join(evidence,language+'-export.md'),exported.markdown);fs.writeFileSync(path.join(evidence,language+'-export.html'),exported.html);
  await evaluate('window.__baglibResearchEditorBridge.explicitSave()');
  const saved = await evaluate(`window.electronAPI.manuscripts.document(${JSON.stringify(id)})`);
  const stored = await evaluate(`window.electronAPI.manuscripts.list().then(rows=>JSON.parse(rows.find(r=>r.id===${JSON.stringify(saved.manuscript_id)}).settings_json))`);
  assert.deepEqual(stored,{citationStyle:'apa',quranPlacement:'inline',footnoteNumbering:'page',headingNumbering:true});
  const Database=require('better-sqlite3'),db=new Database(path.join(process.env.BAGLIB_KEY367_PROFILE,'data/baglib.db'),{readonly:true});
  assert.equal(db.prepare('SELECT count(*) AS n FROM manuscript_link WHERE document_id=?').get(id).n,4,'all four citations derive persisted backlinks');db.close();
  // Remove the first numbered note, then undo; numbering and bibliography are live projections.
  await edit(`(()=>{const d=window.__baglibResearchEditor.editor.doc,p=d.getModelsByFlavour('affine:paragraph').find(p=>p.props.text.toDelta().some(d=>d.attributes?.footnote?.reference.url.startsWith('sunnah:')));let offset=0;for(const delta of p.props.text.toDelta()){if(delta.attributes?.footnote?.reference.url.startsWith('sunnah:')){d.captureSync();p.props.text.delete(offset,delta.insert.length);d.captureSync();break;}offset+=delta.insert.length;}})()`);
  await until('document.querySelectorAll("baglib-citation button sup").length===2',true);
  assert.deepEqual(await edit('Array.from(document.querySelectorAll("baglib-citation button sup")).map(e=>e.innerText)'),['1','2']);
  assert.equal(await edit(`(()=>{const b=Array.from(document.querySelectorAll('baglib-generated-block')).find(b=>b.model.flavour==='baglib:bibliography');return (b.shadowRoot||b).querySelectorAll('li').length})()`),3);
  await edit('window.__baglibResearchEditor.editor.doc.undo()'); await until('document.querySelectorAll("baglib-citation button sup").length===3',true);
  // Native hover opens the custom source popup, with a readable full Arabic/Latin source.
  const outer=await evaluate('document.querySelector(".research-editor-frame").getBoundingClientRect().toJSON()');
  await edit('document.querySelector("baglib-citation").scrollIntoView({block:"center"})');await pause(200);
  await edit(`(()=>{const p=document.querySelector('affine-paragraph');p.std.selection.set([]);p.querySelector('rich-text').inlineEditor.focusStart();})()`);
  await pause(1000);
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1}); await pause(150);
  const box=await edit('document.querySelector("baglib-citation button").getBoundingClientRect().toJSON()');
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:outer.x+box.x+box.width/2,y:outer.y+box.y+box.height/2});
  await pause(800);
  const popupSelector = `Array.from(document.querySelectorAll('.blocksuite-portal')).map(p=>p.shadowRoot?.querySelector('baglib-citation-popup')).find(Boolean)`;
  await until('!!('+popupSelector+')',true);
  const popup=await edit('('+popupSelector+').shadowRoot.querySelector("section").innerText');
  assert.ok(popup.includes(records.find(r=>r.language===language&&r.kind==='ayah').props.text));
  assert.ok(await edit(`(()=>{const p=(${popupSelector}),r=p.shadowRoot.querySelector('button').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.classList.contains('blocksuite-portal')})()`),'popup reader button is visible above the editor/footer clipping boundary');
  await shot(language+'-citation-popup');
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});
  await evaluate('window.__baglibResearchEditorBridge.explicitSave()');
  await evaluate('location.reload()');await pause(1200);await until('!!document.querySelector("[data-nav-item=notes-editor]")');await click('[data-nav-item=notes-editor]');await until('window.__baglibResearchEditor?.ready',true);
  await click('[data-manuscript-id='+JSON.stringify(saved.manuscript_id)+'] .manuscript-name');await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name');await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`,true);
  await until('document.querySelectorAll("baglib-citation button sup").length===3',true);
  assert.deepEqual(await edit('window.__baglibResearchEditor.snapshot()'),original);
  await shot(language+'-reloaded');
  // Check each citation's actual reader destination through its rendered control.
  for (const record of records.filter(r=>r.language===language)) {
   await edit(`Array.from(document.querySelectorAll('baglib-citation')).find(e=>e.note.reference.url===${JSON.stringify(record.props.url)}).querySelector('button').click()`);
   if(record.kind==='ayah'){const ref=record.props.url.split(':');await until(`document.querySelector('[data-nav-item=quran][aria-current=page]') && document.body.innerText.includes(${JSON.stringify(ref[2]+':'+ref[3].split('-')[0])})`);}
   if(record.kind==='hadith'){const ref=record.props.url.split(':').slice(3).join(':');await until(`!!document.querySelector('[data-hadith-id='+${JSON.stringify(JSON.stringify(ref))}+']')`);}
   if(record.kind==='verse'){const ref=record.props.url.split(':');await until(`!!document.querySelector('[data-poetry-id="'+${JSON.stringify(ref[2])}+'"][data-poetry-reference="'+${JSON.stringify(ref[3]+':'+ref[4])}+'"]')`);}
   if(record.kind==='book-quote')await until(`!!document.querySelector('[data-reader-source="'+${JSON.stringify(record.props.sourceId)}+'"][data-reader-page="'+${JSON.stringify(String(record.props.page))}+'"]')`);
   await shot(language+'-'+record.kind+'-reader');
   await click('[data-nav-item=notes-editor]');await until('window.__baglibResearchEditor?.ready',true);await click('[data-manuscript-id='+JSON.stringify(saved.manuscript_id)+'] .manuscript-name');await click('[data-document-id='+JSON.stringify(id)+'] .manuscript-name');await until(`window.__baglibResearchEditor.editor.doc.id===${JSON.stringify(id)}`,true);
  }
 }
 return records;
};
