import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';

import next from 'next';
import http from 'node:http';
import { rendererAnswers } from '../lib/renderer.mjs';

// Reuse another agent's renderer or own Next in this foreground runner.
const overall = setTimeout(() => {
  console.error('KEY-450 runner hard timeout');
  process.exit(1);
}, 240000);

let renderer, server;
if (!(await rendererAnswers())) {
  renderer = next({
    dev: true,
    dir: path.resolve('src/renderer'),
    hostname: '127.0.0.1',
    port: 3000,
  });
  await renderer.prepare();
  server = http.createServer(renderer.getRequestHandler());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3000, '127.0.0.1', resolve);
  });
}

const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root, 'key450-evidence');
fs.mkdirSync(evidence, { recursive: true });
for (const name of ['failure.txt', 'failure.png', 'result.json']) {
  fs.rmSync(path.join(evidence, name), { force: true });
}
const profile = fs.mkdtempSync(path.join(root, 'k450-'));
const env = {
  ...process.env,
  BAGLIB_KEY450_PROFILE: profile,
  BAGLIB_KEY450_EVIDENCE: evidence,
  BAGLIB_REGISTER_PROTOCOL: '0',
  BAGLIB_DEV_URL: 'http://localhost:3000',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.BAGLIB_LIVE_VISIBLE;

let exitCode = 0;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      electron,
      ['scripts/key450-live/main.cjs', '--user-data-dir=' + profile],
      { env, stdio: 'inherit', windowsHide: true }
    );
    const timer = setTimeout(() => child.kill(), 210000);
    child.once('error', reject);
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert.equal(code, 0, 'KEY-450 live check failed');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  const target = fs.realpathSync(profile);
  assert.equal(path.dirname(target), root);
  assert.ok(path.basename(target).startsWith('k450-'));
  fs.rmSync(target, { recursive: true, force: true });
  console.log('KEY-450 throwaway profile deleted');
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await renderer?.close();
  clearTimeout(overall);
}

process.exit(exitCode);
