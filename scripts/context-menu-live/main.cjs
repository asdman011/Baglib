const { app, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_KEY316_DIR;
const evidence = process.env.BAGLIB_KEY316_EVIDENCE;
app.setPath('userData',directory);
app.setAppPath(path.resolve(__dirname,'../..'));
app.setAsDefaultProtocolClient=()=>{throw Error('Protocol registration forbidden in live checks');};
const nativeMenus=[];
const nativeEvents=[];
const buildMenu=Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate=template=>{
  const snapshot=template.map(item=>({role:item.role,label:item.label}));
  const menu=buildMenu(template);
  if(template.some(item=>item.role==='paste')) {
    nativeMenus.push(snapshot);
    // Verify the production native template without opening an OS popup or touching the system clipboard.
    menu.popup=()=>{};
  }
  return menu;
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let started=false;
app.on('browser-window-created',(_,win)=>{
  if(started)return;
  started=true;
  win.webContents.on('context-menu',(_event,params)=>nativeEvents.push({editable:params.isEditable,input:params.inputFieldType,x:params.x,y:params.y}));
  const results=[];
  const errors=[];
  win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});
  const evaluate=script=>win.webContents.executeJavaScript(script,true);
  win.webContents.on('did-finish-load', () => { evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  const until=async(script,timeout=60000)=>{
    const end=Date.now()+timeout;
    while(Date.now()<end){try{if(await evaluate(script))return;}catch{}await sleep(150);}
    throw Error('Timeout '+script+'\n'+await evaluate('document.body.innerText.slice(-1800)'));
  };
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key=async(keyCode,modifiers=[])=>{win.show();win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await sleep(150);};
  const shot=async name=>{await sleep(250);fs.writeFileSync(path.join(evidence,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  const navigate = async id => {
    await key('Escape');
    await click(`[data-nav-item="${id.startsWith('notes-') ? 'notes' : id}"]`);
    if (id.startsWith('notes-')) {
      await until('!!document.querySelector("[data-notes-tab]")');
      await click(`[data-notes-tab="${id.slice(6)}"]`);
    }
    await sleep(250);
  };
  const study=async target=>{await key('Escape');win.webContents.send('study:navigate',target);await sleep(300);};
  const context=async(selector,mode='mouse',edge=false)=>{
    console.log('MENU',selector,mode);
    if(!selector.includes('textLayer')&&!selector.includes('.prose'))await key('Escape');
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing surface');e.scrollIntoView({block:'center'});e.focus({preventScroll:true});})()`);
    if(mode==='keyboard')await key('F10',['shift']);
    else if(mode==='touch'){
      await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',clientX:r.x+Math.min(r.width/2,20),clientY:r.y+Math.min(r.height/2,20)}));})()`);
      await until('document.querySelectorAll("[data-baglib-menu]").length===1',10000);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}))`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,pointerType:'touch'}))`);
    }else{
      await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:${edge?'window.innerWidth-2':'r.x+r.width/2'},clientY:${edge?'window.innerHeight-2':'r.y+Math.min(r.height/2,30)'}}));})()`);
    }
    await until('document.querySelectorAll("[data-baglib-menu]").length===1');
    const bounds=await evaluate(`(()=>{const e=document.querySelector('[data-baglib-menu]'),r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,dir:e.dir,items:[...e.querySelectorAll('[data-menu-action]')].map(b=>b.dataset.menuAction)}})()`);
    assert.ok(bounds.x>=7&&bounds.y>=7&&bounds.right<=bounds.width-7&&bounds.bottom<=bounds.height-7,JSON.stringify(bounds));
    return bounds;
  };
  const choose=async id=>{await click(`[data-baglib-menu] [data-menu-action="${id}"]`);await sleep(200);};
  const assertActions=async ids=>{const actual=await evaluate(`[...document.querySelectorAll('[data-baglib-menu] [data-menu-action]')].map(e=>e.dataset.menuAction)`);for(const id of ids)assert.ok(actual.includes(id),'Missing action '+id);};
  const clipboard=()=>evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.key316Clipboard=text}}})`);
  (async()=>{
    win.setMinimumSize(320,400);win.setContentSize(1280,900);win.show();win.focus();win.webContents.focus();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    const files=JSON.parse(fs.readFileSync(path.join(directory,'inputs.json')));
    await evaluate(`window.electronAPI.settings.set('save.policy.v1',{mode:'manual',intervalMinutes:2})`);
    for(const file of files)await evaluate(`window.electronAPI.addBook(${JSON.stringify({id:file.id,title:file.title,author:'مُؤَلِّف Author',workType:'book',bookType:'digital',digitalFormat:file.kind==='pdf'?'PDF':'EPUB',filePath:file.filename,categories:[],tags:[],lendingHistory:[],readingStatus:'unread'})})`);
    const note=await evaluate(`window.electronAPI.studyNotes.save({title:'KEY316 عِلْم Note',content:'مُراجعة Knowledge linked note',aliases:[],tags:[]})`);
    const board=await evaluate(`window.electronAPI.boards.save({id:'key316-board',title:'KEY316 Board لوحة',preset:'blank',items:[{id:'key316-item',kind:'card',x:0,y:0,w:220,h:130,text:'عِلْم Knowledge',color:'amber',target:'note:${note.id}',label:'KEY316 Note'}],edges:[],expectedRevision:0})`);
    const chapter=await evaluate(`window.electronAPI.sunnah.chapter('Bukhari',1)`);
    assert.ok(chapter.ok&&chapter.data.hadiths.length,'Copied Sunnah available');
    const hadith=chapter.data.hadiths[0];
    for(const lang of ['ar','en'])for(const theme of ['light','dark'])for(const width of [1280,480]){
      const tag=`${lang}-${theme}-${width}`;
      if(process.env.BAGLIB_KEY316_CASE && process.env.BAGLIB_KEY316_CASE!==tag)continue;
      console.log('CASE',tag);
      win.setContentSize(width,900);
      await evaluate(`localStorage.setItem('baglib-lang','${lang}');localStorage.setItem('baglib-theme','${theme}')`);
      await win.loadURL('http://localhost:3000');
      await until(`document.documentElement.lang==='${lang}' && !!document.querySelector('footer')`);
      await clipboard();
      await navigate('library');
      await until('!!document.querySelector("[data-library-book-card]")');
      const bookBounds=await context('[data-library-book-card]','mouse',true);
      await assertActions(['read','last','details','metadata','category','tags','physical','wishlist','lend','duplicates','folder','export','delete']);
      await shot('01-library-edge-'+tag);
      assert.equal(bookBounds.dir,lang==='ar'?'rtl':'ltr');
      await context('[data-library-book-card]','keyboard');await shot('02-library-keyboard-'+tag);
      await context('[data-library-book-card]','touch');await key('Escape');
      await click('[data-library-book-card] [data-card-menu-button]');await until('!!document.querySelector("[data-baglib-menu]")');
      assert.equal(await evaluate('document.querySelector("[data-baglib-menu]").parentElement===document.body'),true);
      await shot('03-overflow-portal-'+tag);await key('Escape');
      // The native editor menu must keep localized cut/copy/paste roles.
      await evaluate(`[...document.querySelectorAll('main input')].find(e=>!['hidden','file','checkbox'].includes(e.type)&&e.getBoundingClientRect().width>20).focus()`);
      await sleep(350);
      const input=await evaluate(`(()=>{const e=[...document.querySelectorAll('main input')].find(e=>!['hidden','file','checkbox'].includes(e.type)&&e.getBoundingClientRect().width>20),r=e.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);if(document.elementFromPoint(x,y)!==e)throw Error('Native input is obscured');return{x,y}})()`);
      win.webContents.sendInputEvent({type:'mouseDown',button:'right',...input,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'right',...input,clickCount:1});
      await sleep(550);assert.ok(nativeMenus.length);assert.ok(nativeMenus.at(-1).some(item=>item.role==='paste'&&item.label));
      await key('Escape');
      // Notes, saved card, and board item use actual workspace entry points.
      await study('note:'+note.id);await until(`!!document.querySelector('[data-study-note="${note.id}"]')`);
      await context(`[data-study-note="${note.id}"]`,'mouse');await assertActions(['open','copy','export','srs','delete']);await shot('04-note-'+tag);
      await key('Escape');await context(`[data-study-note="${note.id}"]`,'keyboard');await key('Escape');await context(`[data-study-note="${note.id}"]`,'touch');
      const before=await evaluate('window.electronAPI.knowledgeCards.list()');
      await choose('srs');await until(`document.querySelectorAll('[data-baglib-menu]').length===0`);
      await until(`window.electronAPI.knowledgeCards.list().then(cards=>cards.some(card=>card.sourceRef==='note:${note.id}'&&card.memorizing))`);
      const after=await evaluate('window.electronAPI.knowledgeCards.list()');
      assert.equal(after.length,before.length+(before.some(card=>card.sourceRef==='note:'+note.id)?0:1));
      await navigate('notes-cards');await until('!!document.querySelector("[data-saved-card]")');
      await context('[data-saved-card]','keyboard');await assertActions(['edit','review','srs','copy','delete']);await shot('05-card-'+tag);await context('[data-saved-card]','mouse');await key('Escape');await context('[data-saved-card]','touch');await key('Escape');
      await navigate('notes-boards');await until('!!document.querySelector("[data-boards-entry]")');
      await click(`[data-boards-entry="${board.id}"] button`);await until('!!document.querySelector("[data-board-item]")');
      await context('[data-board-item]','touch');await assertActions(['open','copy','edit','delete']);await shot('06-board-'+tag);await context('[data-board-item]','mouse');await key('Escape');await context('[data-board-item]','keyboard');await key('Escape');
      // Quran and hadith menus operate on installed text in private pack copies.
      await study('quran:hafs:1:1');await until('!!document.querySelector(".mushaf-svg-surface [data-surah][data-aya]")');
      await context('.mushaf-svg-surface [data-surah][data-aya]','mouse');await assertActions(['copy','copyPlain','copyReference','share','tafsir','translation','note','comment','srs','bookmark','play','link']);await shot('07-quran-'+tag);
      await choose('copyReference');await until('!!window.key316Clipboard');assert.match(await evaluate('window.key316Clipboard'),/\[1:1\]/);
      await context('.mushaf-svg-surface [data-surah][data-aya]','keyboard');await choose('srs');await sleep(250);
      await context('.mushaf-svg-surface [data-surah][data-aya]','touch');await key('Escape');
      await study(`sunnah:Bukhari:1:${hadith.id}`);await until('!!document.querySelector("[data-hadith-id]")');
      await context('[data-hadith-id]','mouse');await assertActions(['copy','copyFull','share','comment','srs','commentary','link']);await shot('08-hadith-'+tag);
      await choose('srs');await sleep(300);
      await context('[data-hadith-id]','keyboard');await key('Escape');await context('[data-hadith-id]','touch');await key('Escape');
      await navigate('bayan');await until('!!document.querySelector("article h2 button")');await click('article h2 button');await until('!!document.querySelector("[data-poetry-row]")');
      await context('[data-poetry-row]','mouse');await assertActions(['copy','copy-line','share','saveNote','srs']);await shot('09-poetry-'+tag);await choose('srs');await sleep(250);
      await context('[data-poetry-row]','keyboard');await key('Escape');await context('[data-poetry-row]','touch');await key('Escape');
      // Help is driven by the registry and shortcuts pause in the note editor.
      await evaluate('document.activeElement?.blur()');await key('?');await until('!!document.querySelector("[data-shortcut-registry]")');await shot('10-shortcuts-'+tag);await key('Escape');
      for(const file of files){
        const page = file.kind === 'pdf' ? (file.lang === 'en' ? 200 : 2) : 1;
        if(file.kind==='pdf')await evaluate(`window.electronAPI.knowledge.save({id:'key316-pin-${file.id}',actor:'reader',workId:'${file.id}',type:'note',noteContent:'عِلْم Knowledge pin',location:JSON.stringify({page:${page},shape:'pin',color:'amber',box:{x:45,y:30,width:2,height:2}})})`);
        await study('book:'+file.id+'#p='+page);
        await until('!!document.querySelector("[data-reader-content]")');
        if(file.kind==='pdf'){
          await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage==='${page}' && [...document.querySelectorAll('.textLayer span')].some(e=>e.textContent.trim().length>3)`);
          const textSelector = `[data-page-number="${page}"] .textLayer span`;
          await until(`[...document.querySelectorAll(${JSON.stringify(textSelector)})].some(e=>e.textContent.trim().length>3)`);
          await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(textSelector)})].find(e=>e.textContent.trim().length>3);e.dataset.key316Selection='true';const range=document.createRange();range.selectNodeContents(e);const s=window.getSelection();s.removeAllRanges();s.addRange(range);e.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
          await until('!!document.querySelector("[data-reader-study]")');
          await context('.textLayer [data-key316-selection]','mouse');await assertActions(['explain','practice','review','note','colors','copy','search','dictionary']);await shot('11-reader-selection-'+file.lang+'-'+tag);
          await choose('colors');await until('document.querySelectorAll("[data-baglib-menu]").length===2');await shot('12-reader-submenu-'+file.lang+'-'+tag);await key('Escape');await key('Escape');
          await context('.textLayer [data-key316-selection]','keyboard');await assertActions(['copy','colors']);await key('Escape');
          await context('.textLayer [data-key316-selection]','touch');await assertActions(['copy','colors']);await key('Escape');
          await evaluate('window.getSelection()?.removeAllRanges()');
          await key('Escape');
          await until('!!document.querySelector("[data-mark-id]")');
          await context('[data-mark-id]','mouse');await assertActions(['edit','colors','comment','delete']);await shot('15-reader-mark-'+file.lang+'-'+tag);
          await choose('edit');await until('!!document.querySelector("[data-mark-text]")');await key('Escape');
          await context('[data-mark-id]','mouse');await choose('edit');await until('!!document.querySelector("[data-mark-text]")');
          await evaluate(`(()=>{const e=document.querySelector('[data-mark-id]'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.x,clientY:r.y}));})()`);
          await until('document.querySelectorAll("[data-baglib-menu]").length===1');await assertActions(['edit','colors','comment','delete']);await key('Escape');
          await context('[data-mark-id]','keyboard');await key('Escape');await context('[data-mark-id]','touch');await key('Escape');
        } else {
          await until('!!document.querySelector("[data-epub-marks-status]")');
          for(let page=0;page<12;page++){
            if(await evaluate("[...document.querySelectorAll('.prose p')].some(e=>e.textContent.trim().length>30)"))break;
            await evaluate("(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}))");await sleep(500);
          }
          await evaluate("(()=>{const e=[...document.querySelectorAll('.prose p')].find(e=>e.textContent.trim().length>30);const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(node.textContent.trim().length>5)break;}if(!node)throw Error('No EPUB body text');const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(25,node.length));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);e.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()");
          await until('!!document.querySelector("[data-reader-study]")');
          await context('.prose p','mouse');await assertActions(['explain','practice','review','note','colors','copy','search','dictionary']);await shot('13-epub-'+tag);await key('Escape');
          await context('.prose p','keyboard');await assertActions(['copy','colors']);await key('Escape');
          await context('.prose p','touch');await assertActions(['copy','colors']);await key('Escape');
        }
      }
      // Navigation and empty-workspace menus remain available without replacing input editing.
      await navigate('library');await context('[data-nav-item="notes"]','mouse');await shot('14-navigation-'+tag);await context('[data-nav-item="notes"]','keyboard');await key('Escape');await context('[data-nav-item="notes"]','touch');await key('Escape');await context('main','mouse');await key('Escape');
      const cards=await evaluate('window.electronAPI.knowledgeCards.list()');
      assert.ok(cards.some(card=>card.sourceKind==='hadith'&&card.memorizing));
      results.push({tag,bookBounds,nativeEditing:true,notesSrs:true,corpusSrs:true,surfaces:10});
      fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({results,nativeMenus,errors},null,2));
    }
    console.log('KEY-316 live pass',results.length);
    app.exit(0);
  })().catch(async error=>{console.error(error);await shot('failure').catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:String(error),errors,nativeMenus,nativeEvents},null,2));app.exit(1);});
});
require('../../dist/main/index.js');
