import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { rendererAnswers } from '../lib/renderer.mjs';

// 1. Ensure port 3000 is clean before starting
// KEY-317: reuse a renderer that already answers on :3000 (another agent's or the user's); never free the port by force.
const rendererAlreadyRunning = await rendererAnswers();

const directory = fs.mkdtempSync(path.resolve('.baglib-data/today-study-live-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });

// 2. Read real PDF files from manifest
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const files = [];

for (const lang of ['ar', 'en']) {
  const file = manifest.files.find(
    (f) => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes' && f.bytes < 2_000_000
  );
  assert.ok(file, `Real PDF for ${lang} not found in manifest`);
  const absolute = path.resolve('tests/real-files', file.path);
  const pages = [];

  await pdf(fs.readFileSync(absolute), {
    max: 8,
    pagerender: async (page) => {
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/gu, ' ')
        .trim();
      pages.push({ page: page.pageNumber ?? page.pageIndex + 1, text });
      return text;
    },
  });

  const selected = pages.find((p) => p.text.length > 80 && (lang !== 'ar' || /[\u0621-\u064a]{3}/u.test(p.text)));
  assert.ok(selected, `No text passage found for ${lang}`);
  const passage = selected.text.slice(0, 240);
  files.push({ lang, path: absolute, passage, page: selected.page });
}

fs.writeFileSync(path.join(evidence, 'files.json'), JSON.stringify(files, null, 2));

// 3. Start Next dev server
console.log('[live] Starting Next.js dev server on port 3000...');
const nextProcess = rendererAlreadyRunning ? null : spawn(
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
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(devServerReady, 'Next.js dev server failed to start within 60s');

const env = {
  ...process.env,
  BAGLIB_DATA_DIR: profile,
  BAGLIB_TODAY_PROFILE: profile,
  BAGLIB_TODAY_EVIDENCE: evidence,
  BAGLIB_TODAY_FILES: JSON.stringify(files),
  BAGLIB_REGISTER_PROTOCOL: '0',
};
delete env.ELECTRON_RUN_AS_NODE;

try {
  for (const lang of ['ar', 'en']) {
    console.log(`[live] Launching Electron for language: ${lang}`);
    const code = await new Promise((resolve) => {
      const child = spawn(
        electron,
        ['scripts/today-study-live/main.cjs', `--user-data-dir=${profile}`],
        {
          env: { ...env, BAGLIB_TODAY_LANG: lang },
          stdio: 'inherit',
          windowsHide: true,
        }
      );
      const timer = setTimeout(() => {
        console.error(`[live] Timeout exceeded for ${lang}`);
        child.kill();
      }, 180_000);
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with non-zero code for ${lang}`);
  }

  // Copy evidence to permanent local folder .baglib-data/key283-evidence/
  const key283Evidence = path.resolve('.baglib-data/key283-evidence');
  fs.mkdirSync(key283Evidence, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(key283Evidence, item));
  }

  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify({ passed: true, directory, files }, null, 2)
  );
  console.log('[live] All today panel live tests passed successfully!');
} finally {
  console.log('[live] Cleaning up dev server and profile directory...');
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}

  assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      directory,
      profileDeleted: !fs.existsSync(profile),
    })
  );
}
