// KEY-427 live run: drag tab out, drag tab back into first window, restart and verify secondary window & tabs return (ar and en).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const evidence = path.resolve('.baglib-data/key427-evidence');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.resolve('.baglib-data/tab-window-live-'));
const corpus = setupThrowawayCorpus({ targetDir: profile, copyPoetry: false, linkSunnah: false, includeMushafLayout: false });

function runPhase(phase, lang) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_TABS_PROFILE: profile,
      BAGLIB_TABS_EVIDENCE: evidence,
      BAGLIB_TABS_PHASE: phase,
      BAGLIB_TABS_LANG: lang,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, ['scripts/tab-window-live/main.cjs'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
          child.kill('SIGKILL');
        }
      } catch {}
      reject(new Error(`Tab window live phase "${phase}" (${lang}) timed out`));
    }, 150_000);
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Tab window live phase "${phase}" (${lang}) exited with code ${code}`));
    });
  });
}

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
  await runPhase('seed', 'ar');
  for (const lang of ['ar', 'en']) {
    await runPhase('session1', lang);
    await runPhase('restart', lang);
  }
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
