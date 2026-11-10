import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'k305-'));
const evidence = path.join(dataRoot, 'KEY-305-evidence');
fs.mkdirSync(evidence, { recursive: true });
let corpus, server;
let code = 1;
try {
  corpus = setupThrowawayCorpus({ targetDir: directory, includeMushafLayout: true });
  if (corpus.sunnah.available) {
    const copy = path.join(directory, 'sunnah', 'research-copy.sqlite');
    fs.copyFileSync(corpus.sunnah.file, copy);
    fs.writeFileSync(path.join(directory, 'sunnah', 'research-source.json'), JSON.stringify({ filename: copy }));
  }
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:3000')).ok; } catch {}
  if (!ready) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','src/renderer','-p','3000','-H','127.0.0.1'], { windowsHide: true, stdio:'ignore' });
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw Error('Renderer unavailable');
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY305_DIR: directory, BAGLIB_KEY305_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL:'0' };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const phase of ['matrix','restart']) {
  code = await new Promise((resolve,reject) => {
    const child = spawn(electron, ['scripts/islamic-ui-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env:{...env,BAGLIB_KEY305_PHASE:phase}, windowsHide:true, stdio:'inherit' });
    const timer = setTimeout(() => child.kill(), 900000);
    child.once('error', reject);
    child.once('exit', result => { clearTimeout(timer); resolve(result ?? 1); });
  });
  if (code !== 0) break;
  }
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' });
  console.log('Corpus cleanup', corpus?.cleanup());
  const resolved = fs.realpathSync(directory);
  if (!resolved.startsWith(dataRoot + path.sep + 'k305-')) throw Error('Cleanup outside task profile refused');
  fs.rmSync(resolved, { recursive:true, force:true });
}
process.exitCode = code;
