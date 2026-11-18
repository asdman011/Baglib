// KEY-392 live check runner: imports a COPY of a real Anki backup (.colpkg) into a throwaway
// profile through the app's IPC, studies an Arabic hadith deck, exports a deck to .apkg and
// re-imports it, in Arabic and English. Windows stay off-screen (live-harness-window.ts).
//   node scripts/anki-package-live/run.mjs [path-to-colpkg]
// The package is copied first and never written; nothing from it is committed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const source = path.resolve(process.argv[2] ?? '.baglib-data/key392-anki/real.colpkg');
assert.ok(fs.existsSync(source), `Anki package not found: ${source}`);

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/anki-live-'));
const evidence = path.resolve('.baglib-data/key392-evidence');
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
    const profile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(profile, { recursive: true });
    const copy = path.join(directory, `collection-${lang}.colpkg`);
    fs.copyFileSync(source, copy);
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_ANKI_PROFILE: profile,
      BAGLIB_ANKI_EVIDENCE: evidence,
      BAGLIB_ANKI_LANG: lang,
      BAGLIB_ANKI_PACKAGE: copy,
      BAGLIB_ANKI_EXPORT: path.join(directory, `export-${lang}.apkg`),
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/anki-package-live/main.cjs', `--user-data-dir=${profile}`], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 300_000);
      child.once('exit', c => {
        clearTimeout(timer);
        resolve(c ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }
  console.log('[anki-package-live] KEY-392 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  fs.rmSync(directory, { recursive: true, force: true });
}
