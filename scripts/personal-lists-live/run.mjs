// KEY-386 live check runner: personal lists across the Library (real PDFs from tests/real-files),
// Sunnah, Quran and Poetry (throwaway copies of the installed corpora), and the Notes → Lists hub,
// in Arabic and English. Windows stay off-screen (live-harness-window.ts).
//   node scripts/personal-lists-live/run.mjs
// Corpus copies are deleted afterwards and the originals are checked unchanged; real files are only read.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pick = lang => manifest.files.find(file => file.kind === 'pdf' && file.lang === lang && /text-layer/u.test(file.path));
const files = ['ar', 'en'].map(lang => {
  const file = pick(lang);
  assert.ok(file, `real ${lang} text-layer PDF in the manifest`);
  const full = path.resolve('tests/real-files', file.path);
  assert.ok(fs.existsSync(full), `real file present: ${full}`);
  return { lang, path: full };
});

const rendererAlreadyRunning = await rendererAnswers();
const evidence = path.resolve('.baglib-data/key386-evidence');
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
    const profile = fs.mkdtempSync(path.resolve(`.baglib-data/lists-live-${lang}-`));
    const corpus = setupThrowawayCorpus({ targetDir: profile, includeMushafLayout: true });
    try {
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: profile,
        BAGLIB_LISTS_PROFILE: profile,
        BAGLIB_LISTS_EVIDENCE: evidence,
        BAGLIB_LISTS_LANG: lang,
        BAGLIB_LISTS_FILES: JSON.stringify(files),
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/personal-lists-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
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
  console.log('[personal-lists-live] KEY-386 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
}
