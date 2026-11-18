// KEY-414 live check runner: dictionary features (order, multi-word tabs, suggestions, root family,
// history, Reading pad) with the REAL repos/arabic_lexicons-main.zip and a copy of the poetry corpus,
// in Arabic and English. Windows stay off-screen (live-harness-window.ts).
//   node scripts/dictionary-features-live/run.mjs
// The pack is only read; the corpus copy is deleted afterwards and the original checked unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const packZip = path.resolve('repos/arabic_lexicons-main.zip');
assert.ok(fs.existsSync(packZip), 'repos/arabic_lexicons-main.zip exists');

const rendererAlreadyRunning = await rendererAnswers();
const evidence = path.resolve('.baglib-data/key414-evidence');
fs.mkdirSync(evidence, { recursive: true });
const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch('http://127.0.0.1:3000')).status < 500;
  } catch {
    await new Promise(r => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

try {
  for (const lang of ['ar', 'en']) {
    const profile = fs.mkdtempSync(path.resolve(`.baglib-data/dict-live-${lang}-`));
    const corpus = setupThrowawayCorpus({ targetDir: profile, copyQuran: false, linkSunnah: false });
    try {
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: profile,
        BAGLIB_DICT_PROFILE: profile,
        BAGLIB_DICT_EVIDENCE: evidence,
        BAGLIB_DICT_LANG: lang,
        BAGLIB_DICT_ZIP: packZip,
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/dictionary-features-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => child.kill(), 360_000);
        child.once('exit', c => {
          clearTimeout(timer);
          resolve(c ?? 1);
        });
      });
      assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
    } finally {
      const report = corpus.cleanup();
      assert.equal(report.copiesDeleted, true, 'corpus copies deleted');
      assert.equal(report.originalsUnchanged, true, 'original corpus unchanged');
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  console.log('[dictionary-features-live] KEY-414 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
}
