import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// 1. Ensure port 3000 is clean before starting
try {
  execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
} catch {}

const directory = fs.mkdtempSync(path.resolve('.baglib-data/quran-wird-live-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

console.log('[live] Setting up throwaway corpus with Quran packs...');
const corpus = setupThrowawayCorpus({
  targetDir: profile,
  copyQuran: true,
  includeMushafLayout: true,
  copyPoetry: false,
  linkSunnah: false,
});
console.log(`[live] Copied ${corpus.quran.copiedFiles} Quran files safely to throwaway profile.`);

// 2. Start Next dev server
console.log('[live] Starting Next.js dev server on port 3000...');
const nextProcess = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
  {
    stdio: 'ignore',
    windowsHide: true,
  }
);

let devServerReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    if (res.status === 200 || res.status === 304 || res.status === 404) {
      devServerReady = true;
      console.log('[live] Next.js dev server is ready.');
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_WIRD_PROFILE: profile,
  BAGLIB_WIRD_EVIDENCE: evidence,
  BAGLIB_REGISTER_PROTOCOL: '0',
};
delete env.ELECTRON_RUN_AS_NODE;

try {
  for (const lang of ['ar', 'en']) {
    console.log(`[live] Launching Electron for language: ${lang}`);
    const code = await new Promise((resolve) => {
      const child = spawn(
        electron,
        ['scripts/quran-wird-live/main.cjs', `--user-data-dir=${profile}`],
        {
          env: { ...env, BAGLIB_WIRD_LANG: lang },
          stdio: 'inherit',
          windowsHide: true,
        }
      );
      const timer = setTimeout(() => {
        console.error(`[live] Timeout exceeded for ${lang}`);
        child.kill();
      }, 180_000);
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with non-zero code for ${lang}`);
  }

  // Copy evidence to permanent local folder .baglib-data/key286-evidence/
  const key286Evidence = path.resolve('.baglib-data/key286-evidence');
  fs.mkdirSync(key286Evidence, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(key286Evidence, item));
  }

  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify({ passed: true, directory }, null, 2)
  );
  console.log('[live] All Quran wird live tests passed successfully!');
} finally {
  console.log('[live] Cleaning up dev server and profile directory...');
  try {
    nextProcess.kill('SIGTERM');
  } catch {}
  try {
    execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}

  assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      directory,
      profileDeleted: !fs.existsSync(profile),
    })
  );
}
