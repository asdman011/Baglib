import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

// KEY-390 live check runner: throwaway BAGLIB_DATA_DIR, Next renderer on :3000, real built main.
// Verifies card note types, template generation, cloze variants, character diff,
// source text protection & restore, shared card fork, and sandboxed iframe isolation in Electron.

const rendererAlreadyRunning = await rendererAnswers();

const directory = fs.mkdtempSync(path.resolve('.baglib-data/note-types-live-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

// Check real test files
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const realFiles = [];
for (const lang of ['ar', 'en']) {
  const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  if (file) {
    realFiles.push({ lang, path: path.resolve('tests/real-files', file.path) });
  }
}
fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(realFiles, null, 2));

console.log('[live] Starting or reusing Next.js dev server on port 3000...');
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
      console.log('[live] Next.js dev server ready.');
      break;
    }
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_NOTE_TYPES_PROFILE: profile,
  BAGLIB_NOTE_TYPES_EVIDENCE: evidence,
  BAGLIB_REGISTER_PROTOCOL: '0',
};
delete env.ELECTRON_RUN_AS_NODE;

try {
  for (const lang of ['ar', 'en']) {
    console.log(`[live] Launching Electron for language: ${lang}`);
    const code = await new Promise(resolve => {
      const child = spawn(
        electron,
        ['scripts/note-types-live/main.cjs', `--user-data-dir=${profile}`],
        {
          env: { ...env, BAGLIB_NOTE_TYPES_LANG: lang },
          stdio: 'inherit',
          windowsHide: true,
        }
      );
      const timer = setTimeout(() => {
        console.error(`[live] Timeout exceeded for ${lang}`);
        child.kill();
      }, 180_000);
      child.once('exit', exitCode => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with code ${code} for ${lang}`);
  }

  // Copy evidence to permanent local folder .baglib-data/key390-evidence/
  const key390Evidence = path.resolve('.baglib-data/key390-evidence');
  fs.mkdirSync(key390Evidence, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(key390Evidence, item));
  }

  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify({ passed: true, directory, realFiles }, null, 2)
  );
  console.log('[live] All note types live tests passed successfully!');
} finally {
  console.log('[live] Cleaning up...');
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}

  assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
  fs.rmSync(profile, { recursive: true, force: true });
}
