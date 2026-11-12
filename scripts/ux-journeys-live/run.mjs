import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
import { rendererAnswers } from '../lib/renderer.mjs';

async function waitForElectron() {
  if (process.platform !== 'win32') return;
  while (execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('"electron.exe"')) {
    console.log('Waiting for existing Electron processes to exit.');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
await waitForElectron();
fs.mkdirSync(path.resolve('.baglib-data/KEY-309-evidence'), { recursive: true });
const evidence = fs.mkdtempSync(path.resolve('.baglib-data/KEY-309-evidence/journeys-'));
const profile = fs.mkdtempSync(path.resolve('.baglib-data/ux-journeys-profile-'));
const corpus = setupThrowawayCorpus({ targetDir: profile, includeMushafLayout: true });
let server;
try {
  if (!await rendererAnswers()) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (await rendererAnswers()) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, 'Renderer did not start');
  }
  const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_JOURNEY_PROFILE: profile, BAGLIB_JOURNEY_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['scripts/ux-journeys-live/main.cjs'], { env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0, 'UX journeys live run failed');
  console.log('PASS. Evidence ' + evidence);
} finally {
  if (server?.pid) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else server.kill('SIGTERM');
  }
  console.log('Corpus cleanup', corpus.cleanup());
  // This resolved path was created above, directly inside the project's throwaway data directory.
  assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('Removed throwaway profile.');
}
