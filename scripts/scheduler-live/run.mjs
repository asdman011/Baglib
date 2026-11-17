import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// KEY-389 live check runner: throwaway profile + disposable Quran pack copy, real PDFs, in ar and en.
// Verifies deck tree, preset (1m 10m, 5 new/day), ayah range deck (New = 5), learning card return,
// sibling burying (and no burying across different notes on same ayah), filtered deck prop:r<0.85,
// switching day start to midnight, and Forget returning a card to New.

const rendererAlreadyRunning = await rendererAnswers();

const directory = fs.mkdtempSync(path.resolve('.baglib-data/scheduler-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const realFiles = [];
for (const lang of ['ar', 'en']) {
  const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  if (file) {
    realFiles.push({
      lang,
      path: path.resolve('tests/real-files', file.path),
      sha256: file.sha256,
    });
  }
}
fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(realFiles, null, 2));

console.log('[scheduler-live] Starting or reusing Next.js dev server on port 3000...');
const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
      { stdio: 'ignore', windowsHide: true }
    );

let devServerReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    if (res.status === 200 || res.status === 304 || res.status === 404) {
      devServerReady = true;
      console.log('[scheduler-live] Next.js dev server ready.');
      break;
    }
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

try {
  for (const lang of ['ar', 'en']) {
    const langProfile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(langProfile, { recursive: true });
    const corpus = setupThrowawayCorpus({
      targetDir: langProfile,
      copyPoetry: false,
      linkSunnah: false,
      includeMushafLayout: true,
    });

    try {
      console.log(`[scheduler-live] Launching Electron for language: ${lang}`);
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: langProfile,
        BAGLIB_SCHEDULER_PROFILE: langProfile,
        BAGLIB_SCHEDULER_EVIDENCE: evidence,
        BAGLIB_SCHEDULER_LANG: lang,
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;

      const code = await new Promise(resolve => {
        const child = spawn(
          electron,
          [
            'scripts/scheduler-live/main.cjs',
            `--user-data-dir=${langProfile}`,
            '--disable-features=CalculateNativeWinOcclusion',
          ],
          {
            env,
            stdio: 'inherit',
            windowsHide: true,
          }
        );
        const timer = setTimeout(() => {
          console.error(`[scheduler-live] Timeout exceeded for ${lang}`);
          child.kill();
        }, 240_000);
        child.once('exit', exitCode => {
          clearTimeout(timer);
          resolve(exitCode ?? 1);
        });
      });
      assert.equal(code, 0, `Electron exited with code ${code} for ${lang}`);
    } finally {
      const cleanupReport = corpus.cleanup();
      assert.equal(cleanupReport.copiesDeleted, true, 'Corpus copies must be deleted');
      assert.equal(cleanupReport.originalsUnchanged, true, 'Original corpus files must remain unchanged');
      fs.rmSync(langProfile, { recursive: true, force: true });
    }
  }

  const key389Evidence = path.resolve('.baglib-data/key389-evidence');
  fs.mkdirSync(key389Evidence, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(key389Evidence, item));
  }

  fs.writeFileSync(
    path.join(key389Evidence, 'result.json'),
    JSON.stringify({ passed: true, directory, realFiles }, null, 2)
  );
  console.log('[scheduler-live] All scheduler live checks passed in ar and en!');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  fs.rmSync(directory, { recursive: true, force: true });
}
