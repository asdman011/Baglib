// KEY-170 native acceptance: real installed tafsirs, local derived missing-ayah fault, no downloads.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const directory = path.resolve(process.env.BAGLIB_KEY170_DIR);
assert.equal(path.dirname(directory),path.resolve('.baglib-data'));
assert.ok(path.basename(directory).startsWith('KEY-170-live-'));
app.setPath('userData',directory);
app.setAppPath(path.resolve(__dirname,'../..'));
const packsRoot=path.join(directory,'quran','packs');
const packs=fs.readdirSync(packsRoot).flatMap(id=>{
  const file=path.join(packsRoot,id,'manifest.json');
  return fs.existsSync(file)?[JSON.parse(fs.readFileSync(file,'utf8')).pack]:[];
}).filter(pack=>pack.resource.category==='tafsir');
console.log(JSON.stringify({installedTafsirs:packs.map(p=>({id:p.id,resource:p.resource.id,title:p.resource.title}))}));
// Fault only the disposable derived database. Original and copied installed packs stay unchanged.
let faultPack;
if(packs.length>=2){
  faultPack=packs[0];
  const derived=path.join(directory,'quran','derived',createHash('sha256').update(`${faultPack.digest}:reader-v1:tafsir`).digest('hex')+'.sqlite');
  fs.mkdirSync(path.dirname(derived),{recursive:true});
  if(!fs.existsSync(derived))fs.copyFileSync(path.join(packsRoot,faultPack.id,'0.sqlite'),derived);
  const db=new Database(derived);
  try{db.pragma('user_version = 1');db.prepare('DELETE FROM tafsir WHERE ayah_key=?').run('1:3');}finally{db.close();}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let started=false;
app.on('browser-window-created',(_,owner)=>{
  if(started)return;started=true;
  const rendererErrors=[];let blocked=0;
  owner.webContents.on('console-message',(_event,level,message)=>{if(level>=3)rendererErrors.push(message.slice(0,500));});
  owner.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
    const hostname=new URL(details.url).hostname;
    const local=hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]';
    if(!local)blocked++;
    callback({cancel:!local});
  });
  const evaluate=code=>owner.webContents.executeJavaScript(code,true);
  const until=async(code,tries=180)=>{for(let i=0;i<tries;i++){try{if(await evaluate(code))return;}catch{}await pause(200);}throw Error('Timed out: '+code);};
  const shot=async name=>{await pause(300);owner.webContents.invalidate();await pause(250);fs.writeFileSync(path.join(process.env.BAGLIB_KEY170_EVIDENCE,name+'.png'),(await owner.webContents.capturePage()).toPNG());};
  const setInput=async value=>evaluate(`(()=>{const e=document.querySelector('[data-quran-search] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  owner.webContents.on('did-finish-load',()=>{evaluate("window.electronAPI?.settings.set('onboarding.v1',{seen:true})").catch(()=>{});});
  (async()=>{
    const matrix=[];
    for(const language of ['ar','en'])for(const width of [1280,480]){
      owner.setContentSize(1280,900);
      for(let i=0;i<180&&(!owner.webContents.getURL().startsWith('http://localhost:3000')||owner.webContents.isLoading());i++)await pause(200);
      await owner.loadURL('http://localhost:3000');await evaluate(`localStorage.setItem('baglib-lang','${language}')`);await owner.loadURL('http://localhost:3000');
      await until("!!window.electronAPI && !!document.querySelector('footer')");await pause(600);
      assert.equal(await evaluate('document.documentElement.dir'),language==='ar'?'rtl':'ltr');
      const online=await owner.webContents.session.fetch('https://example.com').then(()=>true,()=>false);assert.equal(online,false,'external network blocked');
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button[aria-label]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language==='ar'?'البحث في القرآن':'Search Quran')});if(!b)throw Error('Search missing');b.click();})()`);
      await until("!!document.querySelector('[data-quran-search] input')");await setInput('1:1');await until("!!document.querySelector('[data-quran-reference]')");
      await evaluate("document.querySelector('[data-quran-reference]').click()");await until("!!document.querySelector('[data-quran-workspace]')");
      if(!await evaluate("!!document.querySelector('[data-islamic-reader-panel]')"))await evaluate("document.querySelector('[data-reader-panel-toggle]').click()");
      await until("!!document.querySelector('[data-islamic-reader-panel] [role=tab]')");
      await evaluate("document.querySelector('[data-islamic-reader-panel] [role=tab]').click()");
      await until("!!document.querySelector('[data-tafsir-compare-toggle]')");await evaluate("document.querySelector('[data-tafsir-compare-toggle]').click()");
      await until("!!document.querySelector('[data-tafsir-compare]') && [...document.querySelectorAll('[data-tafsir-column]')].every(e=>e.dataset.loaded==='true') && !!document.querySelector('[data-tafsir-column]')");
      owner.setContentSize(width,900);await pause(600);
      const count=await evaluate("document.querySelectorAll('[data-tafsir-column]').length");assert.equal(count,Math.min(2,packs.length));
      const columns=await evaluate("[...document.querySelectorAll('[data-tafsir-column]')].map(e=>({id:e.dataset.tafsirColumn,dir:e.dir,lang:e.lang,body:!!e.querySelector('[data-tafsir-body]'),range:e.querySelector('[data-tafsir-range]')?.textContent,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,overflow:e.scrollWidth>e.clientWidth+1}))");
      for(const c of columns){assert.equal(c.dir,'rtl');assert.equal(c.lang,'ar');assert.equal(c.body,true);assert.equal(c.overflow,false);assert.ok(c.range);}
      if(count>=2){if(width===480)assert.ok(columns[1].y>columns[0].y);else assert.ok(Math.abs(columns[1].x-columns[0].x)>100);}
      await shot('comparison-'+language+'-'+width);
      for(const ayah of [2,3]){
        await evaluate("document.querySelector('[data-tafsir-next]').click()");
        await until(`document.querySelector('[data-tafsir-compare]')?.dataset.reference==='1:${ayah}' && [...document.querySelectorAll('[data-tafsir-column]')].every(e=>e.dataset.loaded==='true')`);
        if(ayah===2)assert.equal(await evaluate("document.querySelectorAll('[data-tafsir-body]').length"),count);
      }
      if(faultPack){
        assert.equal(await evaluate("document.querySelectorAll('[data-tafsir-unavailable]').length"),1);
        assert.equal(await evaluate(`document.querySelector('[data-tafsir-column="${faultPack.id}"] [data-tafsir-unavailable]').textContent`),language==='ar'?'غير متاح لهذه الآية':'Not available for this ayah');
        assert.equal(await evaluate("document.querySelectorAll('[data-tafsir-body]').length"),count-1);
      }
      await shot('missing-ayah-'+language+'-'+width);
      await evaluate("document.querySelector('[data-tafsir-previous]').click()");await until("document.querySelector('[data-tafsir-compare]')?.dataset.reference==='1:2' && [...document.querySelectorAll('[data-tafsir-column]')].every(e=>e.dataset.loaded==='true')");
      assert.equal(await evaluate("document.querySelectorAll('[data-tafsir-body]').length"),count);
      // Seed a reversed choice through the same settings mechanism, reopen and confirm it is retained.
      const ids=columns.map(c=>c.id).reverse();
      await evaluate(`window.electronAPI.settings.set('quran.tafsir.compare.v1.hafs',${JSON.stringify(ids)})`);
      await evaluate("document.querySelector('[data-tafsir-compare-toggle]').click()");await pause(150);await evaluate("document.querySelector('[data-tafsir-compare-toggle]').click()");
      await until("!!document.querySelector('[data-tafsir-column]') && [...document.querySelectorAll('[data-tafsir-column]')].every(e=>e.dataset.loaded==='true')");
      assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-tafsir-column]')].map(e=>e.dataset.tafsirColumn)"),ids);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true);
      if(count<2)assert.equal(await evaluate("!!document.querySelector('[data-tafsir-few]')"),true);
      matrix.push({language,width,columns:count,offline:true,passed:true});console.log(JSON.stringify(matrix.at(-1)));
    }
    assert.ok(blocked>=4);assert.deepEqual(rendererErrors,[],'zero renderer errors');
    console.log(JSON.stringify({passed:matrix.length,matrix,rendererErrors:rendererErrors.length,blockedRequests:blocked,derivedFault:faultPack?.id}));app.quit();
  })().catch(async error=>{console.error(error);console.error(JSON.stringify({rendererErrors}));try{await shot('failure');}finally{app.exit(1);}});
});
require('../../dist/main/index.js');
