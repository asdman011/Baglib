// KEY-395 live run: Revision Browser & Deck Manager in ar and en with real data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const evidence = path.resolve('.baglib-data/key395-evidence');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.resolve('.baglib-data/revbrowser-live-'));
const corpus = setupThrowawayCorpus({ targetDir: profile, copyPoetry: false, linkSunnah: false, includeMushafLayout: false });

let server;
try {
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
    BAGLIB_DATA_DIR: profile,
    BAGLIB_REV_PROFILE: profile,
    BAGLIB_REV_EVIDENCE: evidence,
    BAGLIB_REGISTER_PROTOCOL: '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['scripts/revision-browser-live/main.cjs'], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), 180_000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  clearTimeout(timer);
  assert.equal(code, 0, 'Revision browser live run failed');
  console.log('PASS. Evidence ' + evidence);
} finally {
  if (server?.pid) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else server.kill('SIGTERM');
  }
  corpus.cleanup();
  assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('Removed throwaway profile.');
}
