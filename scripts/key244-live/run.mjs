import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root, 'key244-evidence');
fs.mkdirSync(evidence, { recursive: true });

for (const name of ['failure.txt', 'failure.png', 'result.json']) {
  fs.rmSync(path.join(evidence, name), { force: true });
}

const profile = fs.mkdtempSync(path.join(root, 'k244-'));
const existing = () => execFileSync(
  'powershell.exe',
  ['-NoProfile', '-Command', 'Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'],
  { encoding: 'utf8', windowsHide: true }
).trim();

let server;
try {
  while (existing()) {
    console.log('KEY-244 waiting for other Electron processes to finish...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (!await rendererAnswers()) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 90 && !ready; attempt++) {
      ready = await rendererAnswers();
      if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, 'Renderer did not start');
  }

  const env = {
    ...process.env,
    BAGLIB_KEY244_PROFILE: profile,
    BAGLIB_KEY244_EVIDENCE: evidence,
    BAGLIB_REGISTER_PROTOCOL: '0',
    BAGLIB_DEV_URL: 'http://localhost:3000',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('Starting KEY-244 live verification in Electron...');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      electron,
      ['scripts/key244-live/main.cjs', '--user-data-dir=' + profile],
      { env, stdio: 'inherit', windowsHide: true }
    );
    const timer = setTimeout(() => {
      console.error('KEY-244 live scenario timeout (240s)');
      child.kill();
    }, 240_000);
    child.once('error', reject);
    child.once('exit', exitCode => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });

  assert.equal(code, 0, 'KEY-244 live scenario failed with exit code ' + code);
} finally {
  if (server?.pid) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else server.kill('SIGTERM');
  }
  const target = fs.realpathSync(profile);
  assert.equal(path.dirname(target), root);
  assert.ok(path.basename(target).startsWith('k244-'));
  fs.rmSync(target, { recursive: true, force: true });
  console.log('KEY-244 throwaway profile deleted cleanly.');
}
