import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import electron from 'electron';
const directory=fs.mkdtempSync(path.resolve('.baglib-data/wave4-live-'));
if(process.env.BAGLIB_WAVE4_REAL_COPY){
  const source=path.resolve(process.env.BAGLIB_WAVE4_REAL_COPY);
  if(!source.includes(`${path.sep}.baglib-data${path.sep}wave4-real-copy-`))throw new Error('Verified disposable copy required');
  fs.mkdirSync(path.join(directory,'data'));
  fs.copyFileSync(source,path.join(directory,'data','baglib.db'));
}
const env={...process.env,BAGLIB_DATA_DIR:directory,BAGLIB_WAVE4_LIVE_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,['scripts/wave4-live/main.cjs',`--user-data-dir=${directory}`],{env,stdio:'inherit',windowsHide:true});
const timer=setTimeout(()=>child.kill(),240000);
child.once('exit',code=>{clearTimeout(timer);console.log(JSON.stringify({directory,code}));process.exitCode=code??1;});
