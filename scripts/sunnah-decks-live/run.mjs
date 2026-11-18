import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// KEY-396 live check runner: throwaway profiles under .baglib-data/, Next renderer on :3000, the real
// built main (run `npm run build:main` first). The Sunnah research corpus is linked read-only into each
// profile (originals verified unchanged). Evidence goes to .baglib-data/key396-evidence/.


const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/sunnah-decks-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], {
      stdio: 'ignore',
      windowsHide: true,
    });
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch('http://127.0.0.1:3000')).status < 500;
  } catch {
    await new Promise(r => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

const profiles = [];
const corpora = [];
try {
  for (const lang of ['ar', 'en']) {
    const profile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(profile, { recursive: true });
    profiles.push(profile);
    const corpus = setupThrowawayCorpus({ targetDir: profile, copyQuran: false, copyPoetry: false, linkSunnah: true });
    corpora.push(corpus);
    const corpusReady = corpus.sunnah.available;
    console.log(`[sdeck-live] corpus for ${lang}: poetry=${corpus.poetry.available} sunnah=${corpus.sunnah.available}`);
    assert.ok(corpusReady, 'KEY-396 needs the Sunnah research corpus to link');
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_SDECK_PROFILE: profile,
      BAGLIB_SDECK_EVIDENCE: evidence,
      BAGLIB_SDECK_LANG: lang,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log(`[sdeck-live] ${lang}`);
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/sunnah-decks-live/main.cjs', `--user-data-dir=${profile}`], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', exitCode => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }
  const keep = path.resolve('.baglib-data/key396-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[sdeck-live] KEY-396 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  for (const corpus of corpora) {
    const report = corpus.cleanup();
    assert.equal(report.originalsUnchanged, true, 'original corpus files must stay unchanged');
  }
  for (const profile of profiles) {
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
