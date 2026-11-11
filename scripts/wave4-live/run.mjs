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
child.once('exit', code => {
  const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-wave4-evidence-'));
  for (const name of fs.readdirSync(directory)) {
    if (/\.(png|json|txt)$/.test(name)) fs.copyFileSync(path.join(directory, name), path.join(evidence, name));
  }
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== fs.realpathSync('.baglib-data')) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, code, profileDeleted: true }));
  process.exitCode = code ?? 1;
});
