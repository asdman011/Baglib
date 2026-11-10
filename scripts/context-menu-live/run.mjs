import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'k316-'));
const evidence = path.join(dataRoot, 'KEY-316-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const corpus = setupThrowawayCorpus({ targetDir: directory, includeMushafLayout: true });
// The shared helper records the original research DB read-only. This task exercises a private copy.
if (corpus.sunnah.available) {
  const copy = path.join(directory, 'sunnah', 'research-copy.sqlite');
  fs.copyFileSync(corpus.sunnah.file, copy);
  fs.writeFileSync(path.join(directory, 'sunnah', 'research-source.json'), JSON.stringify({ filename: copy }));
}
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const entries = ['ar', 'en'].map(lang => manifest.files.filter(file => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes').sort((a,b) => a.bytes-b.bytes)[0]);
entries.push(manifest.files.filter(file => file.kind === 'epub').sort((a,b) => a.bytes-b.bytes)[0]);
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const files = entries.map((file,index) => ({ ...file, id: `key316-${index}`, title: `KEY316 ${index} عِلْم Knowledge`, filename: path.resolve('tests/real-files',file.path) }));
for (const file of files) file.before = hash(file.filename);
fs.writeFileSync(path.join(directory,'inputs.json'), JSON.stringify(files));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY316_DIR: directory, BAGLIB_KEY316_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
delete env.ELECTRON_RUN_AS_NODE;
let server;
let code = 1;
try {
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:3000')).ok; } catch {}
  if (!ready) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','src/renderer','-p','3000','-H','127.0.0.1'], { windowsHide: true, stdio: ['ignore', fs.openSync(path.join(evidence,'next.log'),'a'), fs.openSync(path.join(evidence,'next.err'),'a')] });
    for (let attempt=0; attempt<180; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000')).ok) { ready=true; break; } } catch {}
      if (server.exitCode !== null) throw Error('Owned renderer exited');
      await new Promise(resolve => setTimeout(resolve,500));
    }
  }
  if (!ready) throw Error('Renderer did not start');
  code = await new Promise((resolve,reject) => {
    const child = spawn(electron, ['scripts/context-menu-live/main.cjs',`--user-data-dir=${directory}`,'--disable-features=CalculateNativeWinOcclusion'], { env, windowsHide:true, stdio:'inherit' });
    const timer=setTimeout(()=>child.kill(),900000);
    child.once('error',reject);
    child.once('exit',result=>{clearTimeout(timer);resolve(result ?? 1);});
  });
} finally {
  if (server) spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  for (const file of files) if (hash(file.filename)!==file.before) throw Error(`Original changed ${file.filename}`);
  const originals=corpus.cleanup();
  fs.writeFileSync(path.join(evidence,'inputs.json'),JSON.stringify({directory,code,files,originals,missingArabicEpub:true},null,2));
  if (code===0) {
    const resolved=fs.realpathSync(directory);
    if (!resolved.startsWith(dataRoot+path.sep+'k316-')) throw Error('Cleanup outside task profile refused');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
console.log('KEY-316 evidence',evidence);
process.exitCode=code;
