// KEY-415 live check runner: personal lists hold a lecture moment, a whole note and an exact page
// of a real PDF, in Arabic and English. Real files from tests/real-files; windows stay off-screen.
//   node scripts/list-kinds-live/run.mjs
// The files are only read; each profile is a throwaway one under .baglib-data/.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pick = (kind, lang, pattern = /./u) => {
  const entry = manifest.files.find(file => file.kind === kind && file.lang === lang && pattern.test(file.path));
  assert.ok(entry, `a real ${lang} ${kind}`);
  return path.resolve('tests/real-files', entry.path);
};
const files = {
  ar: { pdf: pick('pdf', 'ar', /text-layer/u), video: pick('video', 'ar') },
  en: { pdf: pick('pdf', 'en', /text-layer/u), video: pick('video', 'en') },
};

const rendererAlreadyRunning = await rendererAnswers();
const evidence = path.resolve('.baglib-data/key415-evidence');
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
    const profile = fs.mkdtempSync(path.resolve(`.baglib-data/listkinds-live-${lang}-`));
    try {
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: profile,
        BAGLIB_LISTKINDS_PROFILE: profile,
        BAGLIB_LISTKINDS_EVIDENCE: evidence,
        BAGLIB_LISTKINDS_LANG: lang,
        BAGLIB_LISTKINDS_FILES: JSON.stringify(files[lang]),
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/list-kinds-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => child.kill(), 300_000);
        child.once('exit', c => {
          clearTimeout(timer);
          resolve(c ?? 1);
        });
      });
      assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  console.log('[list-kinds-live] KEY-415 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
}
