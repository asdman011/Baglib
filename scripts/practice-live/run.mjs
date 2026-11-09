import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { build } from 'esbuild';
import pdf from 'pdf-parse/lib/pdf-parse.js';
const directory=fs.mkdtempSync(path.resolve('.baglib-data/key281-'));
const evidence=path.join(directory,'evidence');fs.mkdirSync(evidence);
await build({entryPoints:['src/shared/study-notes.ts'],outfile:path.join(evidence,'study-target.cjs'),bundle:true,platform:'node',format:'cjs'});
const manifest=JSON.parse(fs.readFileSync('tests/real-files/manifest.json','utf8'));
const files=[];
for(const lang of ['ar','en']) {
 const file=manifest.files.find(f=>f.kind==='pdf'&&f.lang===lang&&f.textLayer==='yes'&&f.bytes<2000000);
 assert.ok(file);const absolute=path.resolve('tests/real-files',file.path);
 const pages=[];
 await pdf(fs.readFileSync(absolute),{max:8,pagerender:async page=>{const content=await page.getTextContent();const text=content.items.map(item=>item.str).join(' ').replace(/\s+/gu,' ').trim();pages.push({page:page.pageNumber??page.pageIndex+1,text});return text;}});
 const selected=pages.find(p=>p.text.length>80&&(lang!=='ar'||/[\u0621-\u064a]{3}/u.test(p.text)));
 assert.ok(selected);const passage=selected.text.slice(0,240);
 assert.ok(passage.length>40);files.push({lang,path:absolute,passage,page:selected.page});
}
fs.writeFileSync(path.join(evidence,'passages.json'),JSON.stringify(files,null,2));
const profile=path.join(directory,'profile');fs.mkdirSync(profile);
const env={...process.env,BAGLIB_DATA_DIR:profile,BAGLIB_PRACTICE_PROFILE:profile,BAGLIB_PRACTICE_EVIDENCE:evidence,BAGLIB_PRACTICE_FILES:JSON.stringify(files),BAGLIB_REGISTER_PROTOCOL:'0'};delete env.ELECTRON_RUN_AS_NODE;
try {
 for(const lang of ['ar','en']) {
  const code=await new Promise(resolve=>{
   const child=spawn(electron,['scripts/practice-live/main.cjs',`--user-data-dir=${profile}`],{env:{...env,BAGLIB_PRACTICE_LANG:lang},stdio:'inherit',windowsHide:true});
   const timer=setTimeout(()=>child.kill(),240000);child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});
  });assert.equal(code,0,lang);
 }
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,directory,files},null,2));
} finally {
 assert.equal(path.dirname(path.resolve(profile)),path.resolve(directory));fs.rmSync(profile,{recursive:true,force:true});console.log(JSON.stringify({directory,profileDeleted:!fs.existsSync(profile)}));
}
