import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
import { rendererAnswers } from '../lib/renderer.mjs';

// 1. Ensure port 3000 is clean
// KEY-317: reuse a renderer that already answers on :3000 (another agent's or the user's); never free the port by force.
const rendererAlreadyRunning = await rendererAnswers();

const profile = path.resolve('.baglib-data/key302-profile');
const evidence = path.resolve('.baglib-data/KEY-302-evidence/fix1');

fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

// 2. Setup throwaway corpus copies
console.log('[live] Setting up throwaway corpus copies...');
const corpus = setupThrowawayCorpus({
  targetDir: profile,
  includeMushafLayout: true,
});

console.log('[live] Corpus setup complete:', {
  quran: corpus.quran.available,
  sunnah: corpus.sunnah.available,
  poetry: corpus.poetry.available,
});

// 3. Start Next.js dev server on port 3000
console.log('[live] Starting Next.js dev server on port 3000...');
const nextProcess = rendererAlreadyRunning ? null : spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'],
  {
    stdio: 'pipe',
    windowsHide: true,
  }
);

nextProcess?.stdout.on('data', (d) => {
  const str = d.toString();
  if (str.includes('Ready in') || str.includes('started server') || str.includes('Local:')) {
    console.log('[next]', str.trim());
  }
});
nextProcess?.stderr.on('data', (d) => {
  console.error('[next err]', d.toString().trim());
});

let devServerReady = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch('http://localhost:3000');
    if (res.status === 200 || res.status === 304 || res.status === 404) {
      devServerReady = true;
      console.log('[live] Next.js dev server is ready at http://localhost:3000.');
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_DASHBOARD_PROFILE: profile,
  BAGLIB_DASHBOARD_EVIDENCE: evidence,
  BAGLIB_DEV_URL: 'http://localhost:3000',
  BAGLIB_REGISTER_PROTOCOL: '0',
};
delete env.ELECTRON_RUN_AS_NODE;

try {
  console.log('[live] Launching Electron dashboard UI live runner...');
  const child = spawn(electron, ['scripts/dashboard-ui-live/dashboard-check.cjs'], {
    env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  assert.equal(exitCode, 0, `Electron dashboard harness exited with code ${exitCode}`);
  console.log('[live] Dashboard UI live check completed successfully with exit code 0.');
} finally {
  console.log('[live] Shutting down Next.js dev server...');
  try {
    if (process.platform === 'win32' && nextProcess?.pid) {
      execSync(`taskkill /pid ${nextProcess?.pid} /T /F`, { stdio: 'ignore' });
    } else {
      nextProcess?.kill('SIGTERM');
    }
  } catch {}
}
