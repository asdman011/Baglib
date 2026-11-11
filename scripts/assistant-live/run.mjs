// Real app, local fake provider, hash-verified disposable installed corpus.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/assistant-live-'));
const corpus = setupThrowawayCorpus({ targetDir: directory, copyPoetry: false, includeMushafLayout: true });
try {
  if (!corpus.quran.available) throw new Error('Installed Quran corpus required for KEY-276');
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_ASSISTANT_LIVE_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const alignment = spawnSync(process.execPath, ['scripts/test-runner.js', 'scripts/assistant-live/verify-overlap.ts'], { env, stdio: 'inherit', windowsHide: true });
  if (alignment.status !== 0) throw new Error('Installed overlap verification failed');
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/assistant-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    child.once('error', error => { reject(error); });
    child.once('exit', code => { resolve(code ?? 1); });
  });
} finally {
  const cleanup = corpus.cleanup();
  const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-assistant-evidence-'));
  for (const entry of fs.readdirSync(directory)) {
    if (/\.(png|json|txt)$/.test(entry)) fs.copyFileSync(path.join(directory, entry), path.join(evidence, entry));
  }
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== fs.realpathSync('.baglib-data')) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, code: process.exitCode ?? 1, cleanup, profileDeleted: true }));
}
