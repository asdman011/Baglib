// Runner for research-editor smoke test (KEY-362).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

const repoRoot = path.resolve('.');
const dataDir = path.join(repoRoot, '.baglib-data');
const profileDir = fs.mkdtempSync(path.join(dataDir, 'KEY-362-live-'));
const evidenceDir = path.join(dataDir, 'KEY-362-evidence');

fs.mkdirSync(evidenceDir, { recursive: true });

// Check for existing throwaway live runs (never touches user's real app)
const existingRuns = () => {
  try {
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Where-Object { $_.CommandLine -like '*.baglib-data*' } | Select-Object -ExpandProperty ProcessId; exit 0",
      ],
      { encoding: 'utf8', windowsHide: true }
    ).trim();
  } catch {
    return '';
  }
};

for (let attempt = 0; existingRuns() && attempt < 30; attempt++) {
  await new Promise(r => setTimeout(r, 1000));
}
assert.equal(existingRuns(), '', 'another live test run must not overlap');

const env = {
  ...process.env,
  BAGLIB_KEY362_PROFILE: profileDir,
  BAGLIB_KEY362_EVIDENCE: evidenceDir,
};
delete env.ELECTRON_RUN_AS_NODE;

console.log('Starting research-editor offline smoke test...');

let exitCode = 1;
try {
  exitCode = await new Promise(resolve => {
    const child = spawn(
      electron,
      ['scripts/research-editor-live/main.cjs'],
      { env, stdio: 'inherit', windowsHide: true }
    );
    const timeout = setTimeout(() => {
      console.error('Smoke test timed out after 60s, terminating...');
      child.kill();
    }, 60000);
    child.once('exit', code => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
} finally {
  // Clean up throwaway profile
  try {
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
}

console.log(`Smoke test exited with code: ${exitCode}`);
process.exit(exitCode);
