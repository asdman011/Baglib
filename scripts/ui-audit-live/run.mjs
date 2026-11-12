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

const profile = path.resolve('.baglib-data/key295-profile');
const evidence = path.resolve('.baglib-data/KEY-295-evidence');

fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

// 2. Setup throwaway corpus copies (Quran, Sunnah, Poetry)
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
console.log('[live] Starting Next.js Turbopack dev server on port 3000...');
const nextProcess = rendererAlreadyRunning ? null : spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
  {
    stdio: 'ignore',
    windowsHide: true,
  }
);

let devServerReady = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    if (res.status === 200 || res.status === 304 || res.status === 404) {
      devServerReady = true;
      console.log('[live] Next.js dev server is ready.');
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 20s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_AUDIT_PROFILE: profile,
  BAGLIB_AUDIT_EVIDENCE: evidence,
  BAGLIB_REGISTER_PROTOCOL: '0',
};

try {
  console.log('[live] Launching Electron UI audit runner...');
  const child = spawn(electron, ['scripts/ui-audit-live/audit.cjs'], {
    env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  assert.equal(exitCode, 0, `Electron audit harness exited with code ${exitCode}`);
  console.log('[live] UI audit completed successfully with exit code 0.');
} finally {
  console.log('[live] Shutting down Next.js dev server...');
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}

  console.log('[live] Verifying and cleaning up throwaway corpus...');
  try {
    const cleanupResult = corpus.cleanup();
    console.log('[live] Corpus cleanup verified:', cleanupResult);
  } catch (err) {
    console.error('[live] Corpus cleanup error:', err);
  }

  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
  } catch {}
}
