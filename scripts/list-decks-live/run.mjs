// KEY-399 live check runner: "Revise this list" with a real PDF from tests/real-files and throwaway
// copies of the Sunnah, Quran and poetry corpora, in Arabic and English. Windows stay off-screen.
//   node scripts/list-decks-live/run.mjs
// Corpus copies are deleted afterwards and the originals checked unchanged; real files are only read.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const entry = manifest.files.find(file => file.kind === 'pdf' && file.lang === 'ar' && /text-layer/u.test(file.path));
assert.ok(entry, 'a real Arabic text-layer PDF');
const pdf = path.resolve('tests/real-files', entry.path);
assert.ok(fs.existsSync(pdf), `real file present: ${pdf}`);

const rendererAlreadyRunning = await rendererAnswers();
const evidence = path.resolve('.baglib-data/key399-evidence');
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
    const profile = fs.mkdtempSync(path.resolve(`.baglib-data/ldeck-live-${lang}-`));
    const corpus = setupThrowawayCorpus({ targetDir: profile });
    try {
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: profile,
        BAGLIB_LDECK_PROFILE: profile,
        BAGLIB_LDECK_EVIDENCE: evidence,
        BAGLIB_LDECK_LANG: lang,
        BAGLIB_LDECK_PDF: pdf,
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/list-decks-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => child.kill(), 300_000);
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
  console.log('[list-decks-live] KEY-399 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
}
