import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

if (!(await fetch('http://localhost:3000')).ok) throw Error('Dev renderer required on http://localhost:3000');

const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'wave5-live-'));
const evidence = fs.mkdtempSync(path.join(dataRoot, 'k317-wave5-evidence-'));
const corpus = setupThrowawayCorpus({ targetDir: directory, includeMushafLayout: true });
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_WAVE5_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
let code = 1;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/wave5-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', result => resolve(result ?? 1));
  });
} finally {
  for (const name of fs.readdirSync(directory)) {
    if (/\.(png|json|txt|bib|md)$/.test(name)) fs.copyFileSync(path.join(directory, name), path.join(evidence, name));
  }
  const originals = corpus.cleanup();
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== dataRoot) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, code, originals, profileDeleted: true }));
}
process.exitCode = code;
