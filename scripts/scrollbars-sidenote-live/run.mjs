import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';

// 1. Ensure port 3000 is clean
try {
  execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
} catch {}

const profile = path.resolve('.baglib-data/k315-profile');
const evidence = path.resolve('.baglib-data/KEY-315-evidence');

try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {}
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

// 2. Start Next.js dev server on port 3000
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
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 30s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_K315_PROFILE: profile,
  BAGLIB_K315_EVIDENCE: evidence,
  BAGLIB_REGISTER_PROTOCOL: '0',
};

try {
  console.log('[live] Launching Electron KEY-315 scrollbars & side-note live runner...');
  const child = spawn(electron, ['scripts/scrollbars-sidenote-live/main.cjs'], {
    env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  assert.equal(exitCode, 0, `Electron KEY-315 harness exited with code ${exitCode}`);
  console.log('[live] KEY-315 live check completed successfully with exit code 0.');
} finally {
  console.log('[live] Shutting down Next.js dev server...');
  try {
    if (process.platform === 'win32' && nextProcess.pid) {
      execSync(`taskkill /pid ${nextProcess.pid} /T /F`, { stdio: 'ignore' });
    } else {
      nextProcess.kill('SIGTERM');
    }
  } catch {}
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
}
