import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import electron from 'electron';
const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root,'KEY-366-evidence'); fs.mkdirSync(evidence,{recursive:true});
for(const name of ['failure.txt','failure.png','result.json']) fs.rmSync(path.join(evidence,name),{force:true});
const profile = fs.mkdtempSync(path.join(root,'k366-'));
const existing = () => execFileSync('powershell.exe',['-NoProfile','-Command','Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'],{encoding:'utf8',windowsHide:true}).trim();
try {
  await build({entryPoints:['scripts/research-editor-blocks-live/initialize.ts'],outfile:path.join(profile,'initialize.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
  fs.mkdirSync(path.join(profile,'partitions'),{recursive:true});
  const installed = path.join(process.env.APPDATA,'baglib','partitions','bayan_poetry.sqlite');
  assert.ok(fs.existsSync(installed),'real installed poetry corpus');
  fs.copyFileSync(installed,path.join(profile,'partitions/bayan_poetry.sqlite'));
  while(existing()) { console.log('KEY-366 waiting for other Electron processes; none will be closed'); await new Promise(resolve=>setTimeout(resolve,15000)); }
  const env={...process.env,BAGLIB_KEY366_PROFILE:profile,BAGLIB_KEY366_EVIDENCE:evidence,BAGLIB_REGISTER_PROTOCOL:'0',BAGLIB_DEV_URL:'app://-/'};
  delete env.ELECTRON_RUN_AS_NODE;
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(electron,['scripts/research-editor-blocks-live/main.cjs','--user-data-dir='+profile],{env,stdio:'inherit',windowsHide:true});
    const timer=setTimeout(()=>{console.error('KEY-366 owned process timeout');child.kill();},300000);
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});
  });
  assert.equal(code,0,'native blocks matrix');
} finally {
  const target=fs.realpathSync(profile);assert.equal(path.dirname(target),root);assert.ok(path.basename(target).startsWith('k366-'));
  fs.rmSync(target,{recursive:true,force:true}); console.log('KEY-366 throwaway profile deleted');
}
