// Real app, local fake provider, hash-verified disposable installed corpus.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/assistant-live-'));
const corpus = setupThrowawayCorpus({ targetDir: directory, copyPoetry: false });
try {
  if (!corpus.quran.available) throw new Error('Installed Quran corpus required for KEY-276');
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_ASSISTANT_LIVE_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const alignment = spawnSync(process.execPath, ['scripts/test-runner.js', 'scripts/assistant-live/verify-overlap.ts'], { env, stdio: 'inherit', windowsHide: true });
  if (alignment.status !== 0) throw new Error('Installed overlap verification failed');
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/assistant-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 300000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
} finally {
  const cleanup = corpus.cleanup();
  // Keep evidence at the run root; all profile directories are disposable.
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true });
  fs.writeFileSync(path.join(directory, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
  console.log(JSON.stringify({ directory, code: process.exitCode ?? 1, cleanup }));
}
