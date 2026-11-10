import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

const profile = fs.mkdtempSync(path.resolve('.baglib-data/s311-'));
const evidence = path.resolve('.baglib-data/KEY-311-evidence');
fs.mkdirSync(evidence, { recursive: true });
let server;
const url = 'http://localhost:3000';
try {
  try { await fetch(url); } catch {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'], { stdio: 'pipe', windowsHide: true });
    const log = fs.createWriteStream(path.join(evidence, 'renderer.log'));
    server.stdout.pipe(log); server.stderr.pipe(log);
  }
  let ready = false;
  for (let index = 0; index < 120; index++) {
    try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch { /* Wait for compilation. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Renderer ready');
  const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_STATISTICS_PROFILE: profile, BAGLIB_STATISTICS_EVIDENCE: evidence, BAGLIB_DEV_URL: url, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['scripts/statistics-ui-live/statistics-check.cjs', `--user-data-dir=${profile}`], { env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(code, 0, 'Native Statistics checks pass');
} finally {
  if (server?.pid) {
    try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* Already exited. */ }
  }
  // Only the unique throwaway created above is eligible for cleanup.
  assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('Removed throwaway profile', profile);
}
