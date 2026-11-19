// KEY-423 live restart run: tabs persist and restore across real Electron restarts in ar and en with real PDFs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const evidence = path.resolve('.baglib-data/key423-evidence');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.resolve('.baglib-data/restore-live-'));

function runElectronPhase(phase, lang) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_RESTORE_PROFILE: profile,
      BAGLIB_RESTORE_EVIDENCE: evidence,
      BAGLIB_RESTORE_PHASE: phase,
      BAGLIB_RESTORE_LANG: lang,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(electron, ['scripts/workspace-restore-live/main.cjs'], {
      env,
      stdio: 'inherit',
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
          child.kill('SIGKILL');
        }
      } catch {}
      reject(new Error(`Electron phase "${phase}" (${lang}) timed out after 120s`));
    }, 120_000);

    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Electron phase "${phase}" (${lang}) exited with code ${code}`));
    });
  });
}

let server;
try {
  if (!await rendererAnswers()) {
    server = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
      { stdio: 'ignore', windowsHide: true },
    );
    let ready = false;
    for (let attempt = 0; attempt < 90 && !ready; attempt += 1) {
      ready = await rendererAnswers();
      if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, 'Renderer did not start');
  }

  await runElectronPhase('seed', 'ar');
  for (const lang of ['ar', 'en']) {
    await runElectronPhase('session1', lang);
    await runElectronPhase('relaunch-default', lang);
    await runElectronPhase('relaunch-last', lang);
    await runElectronPhase('relaunch-fresh', lang);
  }
  console.log('PASS. Evidence ' + evidence);
} finally {
  if (server?.pid) {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      server.kill('SIGTERM');
    }
  }
  assert.equal(path.dirname(profile), path.resolve('.baglib-data'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('Removed throwaway profile.');
}
