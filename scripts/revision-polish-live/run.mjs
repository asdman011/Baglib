import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

// KEY-407 live check runner: throwaway BAGLIB_DATA_DIR per run, Next renderer on :3000, real built main.
// Runs ar and en in light and dark themes. Evidence is copied to .baglib-data/key407-evidence/.
// Build the main process first (npm run build:main) so migration 032 is included.

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/revision-polish-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

// The flow touches cards, not documents, but the run records the real files it had available.
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const realFiles = ['ar', 'en']
  .map(lang => manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes'))
  .filter(Boolean)
  .map(f => ({ lang: f.lang, path: f.path }));
fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(realFiles, null, 2));

const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], {
      stdio: 'ignore',
      windowsHide: true,
    });

let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    ready = res.status < 500;
  } catch {
    await new Promise(r => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

const profiles = [];
try {
  for (const lang of ['ar', 'en']) {
    for (const theme of ['dark', 'light']) {
      const profile = path.join(directory, `profile-${lang}-${theme}`);
      fs.mkdirSync(profile, { recursive: true });
      profiles.push(profile);
      const env = {
        ...process.env,
        BAGLIB_DATA_DIR: profile,
        BAGLIB_POLISH_PROFILE: profile,
        BAGLIB_POLISH_EVIDENCE: evidence,
        BAGLIB_POLISH_LANG: lang,
        BAGLIB_POLISH_THEME: theme,
        BAGLIB_REGISTER_PROTOCOL: '0',
      };
      delete env.ELECTRON_RUN_AS_NODE;
      console.log(`[live] ${lang} / ${theme}`);
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/revision-polish-live/main.cjs', `--user-data-dir=${profile}`], {
          env,
          stdio: 'inherit',
          windowsHide: true,
        });
        const timer = setTimeout(() => child.kill(), 180_000);
        child.once('exit', exitCode => {
          clearTimeout(timer);
          resolve(exitCode ?? 1);
        });
      });
      assert.equal(code, 0, `Electron exited with ${code} for ${lang}/${theme}`);
    }
  }
  const keep = path.resolve('.baglib-data/key407-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[live] KEY-407 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  for (const profile of profiles) {
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
