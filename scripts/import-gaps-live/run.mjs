import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { zipSync, strToU8 } from 'fflate';
import electron from 'electron';
const apps = () => execFileSync('powershell.exe', ['-NoProfile','-Command','Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'], { encoding:'utf8', windowsHide:true }).trim();
assert.equal(apps(),'','Exclusive native slot required. Existing apps stay open.');
const root = path.resolve('.baglib-data');
const directory = fs.mkdtempSync(path.join(root,'KEY-48-live-'));
const evidence = path.join(root,'KEY-48-evidence');fs.mkdirSync(evidence,{recursive:true});
const corpus = path.join(directory,'books');
const nested = path.join(corpus,'one/two/three');fs.mkdirSync(nested,{recursive:true});
const originals=[];
try {
  const manifest=JSON.parse(fs.readFileSync('tests/real-files/manifest.json','utf8'));
  // The supplied manifest has English-only EPUB and WMA. Copy every available format/language pair.
  const selected=[];
  for(const kind of new Set(manifest.files.map(file=>file.kind)))for(const lang of ['ar','en']){
    const file=manifest.files.find(file=>file.kind===kind&&file.lang===lang&&(kind!=='pdf'||file.textLayer==='yes'));
    if(file)selected.push(file);
  }
  for(const file of selected){
    const source=path.resolve('tests/real-files',file.path);
    originals.push({source,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')});
    fs.copyFileSync(source,path.join(nested,`real-${file.kind}-${file.lang}${path.extname(source)}`));
  }
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lQAAAABJRU5ErkJggg==','base64');
  for(let index=0;index<300;index++){
    const title=index%2?`كِتاب معرفة ${index}`:`Unique Study Volume ${index}`;
    const folder=[corpus,path.dirname(nested),nested][index%3];
    if(index%3===0)fs.writeFileSync(path.join(folder,`book-${index}.fb2`),`<?xml version="1.0"?><FictionBook xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>${title}</book-title><author><first-name>Academic Writer</first-name></author><lang>${index%2?'ar':'en'}</lang><coverpage><image l:href="#art"/></coverpage></title-info></description><binary id="art" content-type="image/png">${png.toString('base64')}</binary></FictionBook>`);
    else if(index%3===1)fs.writeFileSync(path.join(folder,`book-${index}.cbz`),zipSync({'page10.png':new Uint8Array([1]),'page2.png':png,'ComicInfo.xml':strToU8(`<ComicInfo><Title>${title}</Title><Writer>Academic Writer</Writer><LanguageISO>${index%2?'ar':'en'}</LanguageISO></ComicInfo>`)}));
    else fs.writeFileSync(path.join(folder,`book-${index}.txt`),`${title}\nUnique content payload ${index}`);
  }
  // Generated Arabic EPUB supplements the absent real Arabic EPUB.
  fs.writeFileSync(path.join(nested,'generated-ar.epub'),zipSync({mimetype:strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),'content.opf':strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>كتاب عربي تجريبي</dc:title><dc:creator>كاتب عربي</dc:creator><dc:language>ar</dc:language></metadata><manifest/><spine/></package>')}));
  fs.writeFileSync(path.join(nested,'twin-first.txt'),'Identical payload for both batch twins');fs.copyFileSync(path.join(nested,'twin-first.txt'),path.join(nested,'twin-second.txt'));
  fs.writeFileSync(path.join(nested,'corrupt.cbz'),Buffer.from([0,0,0,0,1]));fs.writeFileSync(path.join(nested,'unsupported.exe'),'unsupported');
  fs.writeFileSync(path.join(evidence,'real-file-baselines.json'),JSON.stringify(originals,null,2));
  buildSync({entryPoints:['scripts/import-gaps-live/fixture.tsx'],outfile:path.join(directory,'fixture.js'),bundle:true,platform:'browser',define:{'process.env.NODE_ENV':'"development"'}});
  for(const [source,target] of [['scripts/import-gaps-live/main.ts','main.cjs'],['src/preload/index.ts','preload.cjs'],['src/main/metadata-worker.ts','metadata-worker.js']])buildSync({entryPoints:[source],outfile:path.join(directory,target),bundle:true,platform:'node',format:'cjs',packages:'external'});
  const css=fs.readFileSync('src/renderer/app/globals.css','utf8').replace('@import "./ui-motion.css";',fs.readFileSync('src/renderer/app/ui-motion.css','utf8'))+'\n@source "../../src/renderer/components/library/ImportWizardModal.tsx";';
  fs.writeFileSync(path.join(directory,'style.css'),(await postcss([tailwind()]).process(css,{from:path.join(directory,'input.css')})).css);
  fs.writeFileSync(path.join(directory,'index.html'),'<!doctype html><html class="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
  const matrix=[];
  for(const lang of ['ar','en'])for(const mode of ['full','cancel']){
    assert.equal(apps(),'','Exclusive native slot');
    const profile=path.join(directory,`${lang}-${mode}`);fs.mkdirSync(profile);
    const env={...process.env,BAGLIB_DATA_DIR:profile,BAGLIB_KEY48_DIRECTORY:directory,BAGLIB_KEY48_PROFILE:profile,BAGLIB_KEY48_EVIDENCE:evidence,BAGLIB_KEY48_LANG:lang,BAGLIB_KEY48_MODE:mode};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise(resolve=>{const child=spawn(electron,[path.join(directory,'main.cjs')],{env,stdio:'inherit',windowsHide:true});const timer=setTimeout(()=>child.kill(),600000);child.once('exit',code=>{clearTimeout(timer);resolve(code??1);});});
    assert.equal(code,0,`${lang} ${mode} native acceptance`);matrix.push(JSON.parse(fs.readFileSync(path.join(evidence,`${lang}-${mode}.json`),'utf8')));
  }
  fs.writeFileSync(path.join(evidence,'matrix.json'),JSON.stringify(matrix,null,2));console.log(JSON.stringify({nativeCases:matrix.length,matrix}));
}finally{
  for(const original of originals)assert.equal(createHash('sha256').update(fs.readFileSync(original.source)).digest('hex'),original.sha256,'Original real file unchanged');
  assert.equal(path.dirname(path.resolve(directory)),root);assert.ok(path.basename(directory).startsWith('KEY-48-live-'));
  fs.rmSync(directory,{recursive:true,force:true});console.log(JSON.stringify({copiedFolderDeleted:!fs.existsSync(directory),originalsUnchanged:true}));
}
