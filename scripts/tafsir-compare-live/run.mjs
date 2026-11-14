// KEY-170: native acceptance with installed Quran packs; never uses the user's profile for writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const existingApps = () => process.platform === 'win32' ? execFileSync('powershell.exe', ['-NoProfile','-Command', "Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0"], {encoding:'utf8',windowsHide:true}).trim() : '';
const waitForSlot = async () => { while (existingApps()) { console.log('KEY-170 waiting for existing Electron/Baglib processes'); await new Promise(resolve=>setTimeout(resolve,30000)); } };
await waitForSlot();
const data = path.resolve('.baglib-data'); fs.mkdirSync(data,{recursive:true});
const directory = fs.mkdtempSync(path.join(data,'KEY-170-live-'));
const evidence = path.join(data,'KEY-170-evidence');fs.mkdirSync(evidence,{recursive:true});
let corpus;
try {
  corpus=setupThrowawayCorpus({targetDir:directory,copyPoetry:false,linkSunnah:false,includeMushafLayout:true});
  assert.ok(corpus.quran.available,'Installed Quran corpus required');
  const env={...process.env,BAGLIB_DATA_DIR:directory,BAGLIB_KEY170_DIR:directory,BAGLIB_KEY170_EVIDENCE:evidence};delete env.ELECTRON_RUN_AS_NODE;
  await waitForSlot();
  const code=await new Promise(resolve=>{
    const child=spawn(electron,['scripts/tafsir-compare-live/main.cjs', '--user-data-dir='+directory,'--disable-features=CalculateNativeWinOcclusion'],{env,stdio:'inherit',windowsHide:true});
    const timeout=setTimeout(()=>child.kill(),240000);
    child.once('exit',code=>{clearTimeout(timeout);resolve(code??1);});
  });
  process.exitCode=code;
} finally {
  const cleanup=corpus?.cleanup();
  const resolved=path.resolve(directory);
  assert.equal(path.dirname(resolved),data);assert.ok(path.basename(resolved).startsWith('KEY-170-live-'));
  fs.rmSync(resolved,{recursive:true,force:true});
  if (cleanup) { assert.equal(cleanup.originalsUnchanged,true);assert.equal(cleanup.copiesDeleted,true); }
  console.log(JSON.stringify({cleanup,profileDeleted:!fs.existsSync(resolved)}));
}
