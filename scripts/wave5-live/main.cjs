const {app,dialog,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const directory=process.env.BAGLIB_WAVE5_LIVE_DIR;
app.setPath('userData',directory);
const opened=[];
shell.openExternal=async url=>{opened.push(url);};
dialog.showSaveDialog=async(_,options)=>({canceled:false,filePath:path.join(directory,path.basename((options||_).defaultPath))});
const pause=duration=>new Promise(resolve=>setTimeout(resolve,duration));
const labels={
  ar:{nav:'المسارات',name:'اسم المسار',template:'قالب',create:'إنشاء المسار',linkTitle:'عنوان الرابط',linkUrl:'عنوان الموقع',addLink:'إضافة رابط',pin:'تثبيت',step:'خطوة جديدة',addStep:'إضافة خطوة',bib:'تصدير BibTeX',md:'تصدير قائمة مراجع',ai:'موضوع المنهج',draft:'مسودة بالذكاء الاصطناعي',search:'مركز الاكتشاف والبحث',sources:'القرآن والسنة والشعر',quran:'القرآن الكريم',frequency:'تكرار الألفاظ',sunnah:'السنة النبوية',insights:'الموضوعات والإحصاءات',subjects:'ابحث في الموضوعات',stats:'الإحصاءات',beside:'بجوار الحديث',kinds:['مشروع بحث','منهج دراسي'],down:'نقل لأسفل',islamweb:'إسلام ويب',freqSearch:'ابحث عن جذر أو لفظ'},
  en:{nav:'Pathways',name:'Pathway name',template:'Template',create:'Create pathway',linkTitle:'Link title',linkUrl:'Web address',addLink:'Add link',pin:'Pin',step:'New step',addStep:'Add step',bib:'Export BibTeX',md:'Export reference list',ai:'Curriculum subject',draft:'Draft with AI',search:'Discovery Hub',sources:'Quran, Sunnah and poetry',quran:'Quran',frequency:'Word frequency',sunnah:'Sunnah',insights:'Subjects and statistics',subjects:'Search subjects',stats:'Statistics',beside:'Beside the hadith',kinds:['Research project','Curriculum'],down:'Move down',islamweb:'Islamweb',freqSearch:'Search a root or lemma'},
};
const outline='# البداية\nقراءة المقدمة\n# التعمق\nدراسة المسائل';
const stub=http.createServer((request,response)=>{
  let body='';request.on('data',chunk=>{body+=chunk;});
  request.on('end',()=>{
    const fail=body.includes('stub-fail');
    response.setHeader('Content-Type','application/json');
    response.end(JSON.stringify({message:{content:fail?'# heading only':outline},models:[]}));
  });
});
let started=false;
app.on('browser-window-created',(_,owner)=>{
  if(started)return;started=true;
  const evaluate=code=>owner.webContents.executeJavaScript(code,true).catch(error=>{throw new Error(`${error.message}: ${code.slice(0,200)}`);});
  const until=async(code,tries=200)=>{for(let index=0;index<tries;index++){try{if(await evaluate(code))return;}catch{}await pause(300);}throw new Error(`Timed out: ${code}`);};
  const press=text=>evaluate(`(()=>{const items=[...document.querySelectorAll('button')];const item=items.find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)});if(!item)throw new Error('no button '+${JSON.stringify(text)});item.click();})()`);
  const fill=(label,value)=>evaluate(`(()=>{const element=[...document.querySelectorAll('input,textarea,select')].find(item=>item.getAttribute('aria-label')===${JSON.stringify(label)});if(!element)throw new Error('no field '+${JSON.stringify(label)});const proto=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const shot=async name=>{await pause(500);owner.webContents.invalidate();await pause(300);await fs.promises.writeFile(path.join(directory,`${name}.png`),(await owner.webContents.capturePage()).toPNG());};
  const noOverflow=async()=>assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),'page overflows sideways');
  (async()=>{
    await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
    await until('!!window.electronAPI?.pathways && !!document.querySelector("footer")');
    const db=new Database(path.join(directory,'data','baglib.db'));
    db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('ai_settings',?,datetime('now'))").run(JSON.stringify({enabled:true,provider:'ollama',ollamaModel:'stub',ollamaEndpoint:`http://127.0.0.1:${stub.address().port}`}));
    db.prepare("INSERT INTO work(id,title) VALUES('wave5-book','فتح الباري')").run();db.close();
    const results=[];
    for(const language of ['ar','en']){
      const L=labels[language];const result={language};
      owner.setContentSize(1280,900);
      await evaluate(`localStorage.setItem('baglib-lang','${language}')`);await owner.loadURL('http://localhost:3000');
      await until('!!window.electronAPI?.pathways && !!document.querySelector("footer")');
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(1500);

      // KEY-248 and KEY-249 through the real view
      await press(L.nav);await until(`[...document.querySelectorAll('input')].some(item=>item.getAttribute('aria-label')===${JSON.stringify(L.name)})`);
      assert.equal(await evaluate("document.querySelector('[dir]').dir"),language==='ar'?'rtl':'ltr');
      await fill(L.name,`بحث ${language}`);await fill(L.template,'research');
      await until("document.querySelector('textarea').value.includes('#')");
      await press(L.create);await until(`document.querySelector('h2')?.textContent===${JSON.stringify(`بحث ${language}`)}`);
      const list=await evaluate('window.electronAPI.pathways.list()');
      const research=list.find(item=>item.name===`بحث ${language}`);assert.equal(research.kind,'research');assert.equal(research.steps,8);
      await fill(L.linkTitle,'مقال عن الموضوع');await fill(L.linkUrl,'https://example.com/مقال');await press(L.addLink);
      await until(`[...document.querySelectorAll('button')].some(b=>b.textContent==='مقال عن الموضوع')`);
      await press(L.pin);await until(`window.electronAPI.pathways.get('${research.id}').then(row=>row.items.some(item=>item.pinned))`);
      await evaluate(`window.electronAPI.pathways.addItem({pathwayId:'${research.id}',section:'',kind:'resource',reference:'book:wave5-book',title:'فتح الباري'})`);
      await fill(L.step,'خطوة مضافة');await press(L.addStep);await until(`document.body.textContent.includes('خطوة مضافة')`);
      await evaluate("document.querySelector('main input[type=checkbox]').click()");
      await until(`document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='1'`);
      const before=(await evaluate(`window.electronAPI.pathways.get('${research.id}')`)).items.map(item=>item.id);
      await press(L.down);
      await until(`window.electronAPI.pathways.get('${research.id}').then(row=>row.items.map(item=>item.id).join()!==${JSON.stringify(before.join())})`);
      const detail=await evaluate(`window.electronAPI.pathways.get('${research.id}')`);
      assert.equal(detail.items.filter(item=>item.pinned).length,1);assert.equal(detail.done,1);assert.notDeepEqual(detail.items.map(item=>item.id),before);
      await press(L.bib);await until(`document.querySelector('main [role=status]')`);
      const bib=fs.readFileSync(path.join(directory,`بحث ${language}.bib`),'utf8');assert.match(bib,/فتح الباري/u);assert.match(bib,/url = \{https:\/\/example.com/u);
      await press(L.md);await pause(400);assert.match(fs.readFileSync(path.join(directory,`بحث ${language}.md`),'utf8'),/مقال عن الموضوع/u);
      await noOverflow();await shot(`pathways-${language}-1280`);
      owner.setContentSize(480,1000);await pause(500);await noOverflow();await shot(`pathways-${language}-480`);owner.setContentSize(1280,900);
      const tasks=await evaluate('window.electronAPI.planner.list()');
      const open=tasks.find(task=>task.title===(language==='ar'?'تحديد نطاق البحث':'Set the scope'));assert.ok(open);
      await evaluate(`window.electronAPI.planner.save({...${JSON.stringify(open)},expectedUpdatedAt:${JSON.stringify(open.updatedAt)},status:'completed'})`);
      assert.equal((await evaluate(`window.electronAPI.pathways.get('${research.id}')`)).done,2);
      result.pathways={steps:detail.steps,planner:true,bibtex:true,markdown:true};

      await fill(L.ai,'أصول الفقه');await press(L.draft);
      await until(`document.querySelector('textarea').value.includes('قراءة المقدمة')`);
      await fill(L.name,`منهج ${language}`);await press(L.create);await until(`document.querySelector('h2')?.textContent===${JSON.stringify(`منهج ${language}`)}`);
      assert.equal((await evaluate('window.electronAPI.pathways.list()')).find(item=>item.name===`منهج ${language}`).kind,'curriculum');
      await fill(L.ai,'stub-fail');await press(L.draft);await until("document.querySelector('[role=alert]')");
      result.aiDraft={draft:true,refusedEmpty:true};

      // KEY-250
      await press(L.search);await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(L.sources)})`);
      await press(L.sources);
      await evaluate(`(()=>{const input=document.querySelector('input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'الرحمن الرحيم');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await until("[...document.querySelectorAll('.fixed button')].filter(b=>b.querySelector('bdi')).length>0");
      await until(`document.querySelector('.fixed').textContent.includes('صحيح')||document.querySelectorAll('.fixed button span[lang=ar]').length>0`);
      const plain=await evaluate("document.querySelectorAll('.fixed button .font-reading').length");assert.ok(plain>0);
      await evaluate(`(()=>{const input=document.querySelector('input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'الرَّحْمَٰنِ الرَّحِيمِ');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await pause(1800);
      const marked=await evaluate("document.querySelectorAll('.fixed button .font-reading').length");assert.ok(marked>0);
      const hadiths=await evaluate("window.electronAPI.sunnah.search({text:'الرحمن الرحيم'}).then(result=>result.data.length)");assert.ok(hadiths>0);
      await press(L.islamweb);await pause(200);assert.ok(opened[opened.length-1].startsWith('https://www.islamweb.net/ar/index.php?page=websearch&stxt=%D8'));
      await shot(`search-${language}-1280`);
      result.search={quranPlain:plain,quranWithMarks:marked,hadiths,site:opened[opened.length-1].slice(0,60)};
      await evaluate("document.querySelector('.fixed button .font-reading').closest('button').click()");
      await until("!document.querySelector('.fixed input[type=text]')");

      // KEY-252
      await until('!!document.querySelector("[data-quran-reader]")');
      await press(L.frequency);await until(`[...document.querySelectorAll('input')].some(item=>item.getAttribute('aria-label')===${JSON.stringify(L.freqSearch)})`);
      await fill(L.freqSearch,'رحم');
      await until(`document.querySelector('ol')?.textContent.includes(${JSON.stringify(language==='ar'?'٣٣٩':'339')})`);
      const roots=await evaluate("window.electronAPI.quran.frequency({family:'root',text:'رحم'}).then(result=>result.data)");
      assert.equal(roots.rows.find(row=>row.text.replace(/\s/g,'')==='رحم').stated,339);
      const hamd=(await evaluate("window.electronAPI.quran.frequency({family:'root',text:'حمد'}).then(result=>result.data)")).rows.find(row=>row.text.replace(/\s/g,'')==='حمد');
      assert.deepEqual([hamd.stated,hamd.count],[63,68]);
      const lemma=await evaluate("window.electronAPI.quran.frequency({family:'lemma',limit:5})");
      const surah=await evaluate("window.electronAPI.quran.frequency({family:'root',surah:112,limit:5}).then(result=>result.data)");assert.ok(surah.total>0&&surah.rows.every(row=>row.stated===undefined));
      await evaluate("document.querySelector('ol button').click()");await until("document.querySelector('ol div button')");
      await shot(`frequency-${language}-1280`);await noOverflow();
      result.frequency={rahm:339,hamd:[hamd.stated,hamd.count],lemma:lemma.ok?lemma.data.distinct:'missing',surah112:surah.total};

      // KEY-251 in the real Quran view
      await evaluate(`document.querySelector('nav button').click()`);
      await until('!!document.querySelector("[data-quran-reader] [data-surah][data-aya]")');
      const mouse=kind=>`(()=>{const word=document.querySelector('[data-quran-reader] [data-surah][data-aya]');const box=word.getBoundingClientRect();word.dispatchEvent(new MouseEvent('${kind}',{bubbles:true,clientX:box.left+box.width/2,clientY:box.top+box.height/2}));})()`;
      await evaluate(mouse('click'));
      await until('!!document.querySelector("[data-quran-inspector-layer] [data-personal-commentary]")');
      await evaluate(`document.querySelector('[data-quran-inspector-layer] [data-personal-commentary]').open=true`);
      await until('!!document.querySelector("[data-quran-inspector-layer] [data-personal-commentary] textarea")');
      await evaluate(`(()=>{const area=document.querySelector('[data-quran-inspector-layer] [data-personal-commentary] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'تأملي في الآية ${language}');area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await evaluate("[...document.querySelectorAll('[data-quran-inspector-layer] [data-personal-commentary] button')].find(b=>!b.disabled&&b.className.includes('p-2')).click()");
      await until('!!document.querySelector("[data-quran-inspector-layer] [data-commentary-entry]")');
      await shot(`ayah-commentary-${language}-1280`);
      result.ayahCommentaryForm=true;
      await evaluate(`document.querySelector('#quran-inspector-title').closest('aside').querySelector('header button').click()`);await pause(400);
      await evaluate(mouse('dblclick'));
      await until('!!document.querySelector("[data-quran-study-panel]")');
      await until(`document.querySelector('[data-quran-study-panel]').textContent.includes('QUL')`);
      await shot(`connections-${language}-1280`);
      result.connectionSource=true;

      // KEY-253 and KEY-254 on the real corpus
      await evaluate(`document.querySelector('aside button[aria-label=${JSON.stringify(L.sunnah)}]').click()`);await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(L.insights)})`);
      await press(L.insights);await until('!!document.querySelector(".sunnah-insights")');
      await fill(L.subjects,'الصلاة');await until("document.querySelectorAll('.sunnah-subjects > li').length>0");
      const stall=await evaluate(`(async()=>{let worst=0;let last=performance.now();const timer=setInterval(()=>{const now=performance.now();worst=Math.max(worst,now-last);last=now;},20);const start=performance.now();const ping=[];const pinger=(async()=>{for(;;){const t=performance.now();const list=await window.electronAPI.pathways.list().catch(()=>null);ping.push(performance.now()-t);if(window.__statsDone)break;await new Promise(r=>setTimeout(r,50));}})();const out=await window.electronAPI.sunnah.statistics();window.__statsDone=true;await pinger;clearInterval(timer);return {ms:performance.now()-start,worstPing:Math.max(...ping),hadiths:out.data.totals.hadiths,chain:out.data.totals.chainLinks};})()`);
      assert.equal(stall.hadiths,73325);assert.equal(stall.chain,325841);
      await press(L.stats);await until("!!document.querySelector('.sunnah-stats tbody tr')");
      await shot(`stats-${language}-1280`);
      await evaluate("document.querySelector('.sunnah-subjects button')?.click()");
      result.statistics=stall;
      await press(L.insights).catch(()=>{});
      await until("document.querySelectorAll('.sunnah-research').length>0");
      await evaluate("document.querySelector('.sunnah-research').open=true");
      await until("!!document.querySelector('.sunnah-research-tabs')");
      await until(`[...document.querySelectorAll('.sunnah-research button')].some(b=>b.textContent.includes(${JSON.stringify(L.beside)}))||!!document.querySelector('.sunnah-research-empty')`);
      const hasCommentary=await evaluate(`[...document.querySelectorAll('.sunnah-research button')].some(b=>b.textContent.includes(${JSON.stringify(L.beside)}))`);
      if(hasCommentary){
        await press(L.beside);await until("!!document.querySelector('.sunnah-beside')");
        const columns=await evaluate("getComputedStyle(document.querySelector('.sunnah-beside')).gridTemplateColumns.split(' ').length");assert.equal(columns,2);
        assert.ok(await evaluate("document.querySelector('.sunnah-research-citation strong').textContent.length>0"));
        await evaluate("document.querySelector('.sunnah-beside').scrollIntoView()");
        await shot(`shrouh-${language}-1280`);
        owner.setContentSize(480,1000);await pause(500);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.sunnah-beside')).gridTemplateColumns.split(' ').length"),1);
        await evaluate("document.querySelector('.sunnah-beside').scrollIntoView()");
        await noOverflow();await shot(`shrouh-${language}-480`);owner.setContentSize(1280,900);
      }
      await evaluate("document.querySelector('.sunnah-research [data-personal-commentary]').open=true");
      await until("!!document.querySelector('[data-personal-commentary] textarea')");
      await evaluate(`(()=>{const area=document.querySelector('[data-personal-commentary] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'تأملي في الحديث ${language}');area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await evaluate("[...document.querySelectorAll('[data-personal-commentary] button')].find(b=>!b.disabled&&b.className.includes('p-2')).click()");
      await until("!!document.querySelector('[data-commentary-entry]')");
      result.shrouh={hasCommentary,sideBySide:hasCommentary};result.hadithCommentaryForm=true;
      results.push(result);console.log(JSON.stringify(result));
    }
    assert.equal((await evaluate("window.electronAPI.pathways.list()")).length,4);
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({directory,passed:true}));stub.close();app.quit();
  })().catch(error=>{console.error(error);fs.writeFileSync(path.join(directory,'failure.txt'),String(error.stack||error));owner.webContents.capturePage().then(image=>fs.writeFileSync(path.join(directory,'failure.png'),image.toPNG())).finally(()=>app.exit(1));});
});
require('../../dist/main/index.js');
