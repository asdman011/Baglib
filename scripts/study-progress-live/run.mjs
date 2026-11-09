import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import pdf from 'pdf-parse/lib/pdf-parse.js';

// 1. Ensure port 3000 is clean before starting
try {
  execSync('node scripts/ensure-port-free.js', { stdio: 'inherit' });
} catch {}

const directory = fs.mkdtempSync(path.resolve('.baglib-data/study-progress-live-'));
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
const nextProcess = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
  {
    stdio: 'ignore',
    windowsHide: true,
  }
);

const cleanup = () => {
  try {
    nextProcess.kill('SIGKILL');
  } catch {}
  try {
    execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

// Wait for Next.js server to respond
console.log('[live] Waiting for Next.js server...');
const start = Date.now();
while (Date.now() - start < 60000) {
  try {
    const res = await fetch('http://127.0.0.1:3000');
    if (res.ok || res.status === 404 || res.status === 200) {
      console.log('[live] Next.js server is ready.');
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

// 4. Run Electron verification for Arabic and English
try {
  for (const lang of ['ar', 'en']) {
    console.log(`[live] Launching Electron for language: ${lang}...`);
    const child = spawn(electron, [path.resolve('scripts/study-progress-live/main.cjs')], {
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        BAGLIB_PROGRESS_PROFILE: profile,
        BAGLIB_PROGRESS_EVIDENCE: evidence,
        BAGLIB_PROGRESS_LANG: lang,
        BAGLIB_PROGRESS_FILES: JSON.stringify(files),
      },
      stdio: 'inherit',
    });

    const exitCode = await new Promise((resolve) => {
      child.on('exit', resolve);
    });

    assert.equal(exitCode, 0, `Electron run for ${lang} failed with exit code ${exitCode}`);
  }

  console.log('[live] All live verification runs completed successfully!');

  // Copy evidence to .baglib-data/key284-evidence/
  const persistentEvidenceDir = path.resolve('.baglib-data/key284-evidence');
  fs.mkdirSync(persistentEvidenceDir, { recursive: true });

  for (const file of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, file), path.join(persistentEvidenceDir, file));
  }
  console.log(`[live] Evidence copied to ${persistentEvidenceDir}`);
} finally {
  cleanup();
  // Delete throwaway profile directory
  try {
    fs.rmSync(directory, { recursive: true, force: true });
    console.log(`[live] Throwaway profile deleted: ${directory}`);
  } catch (err) {
    console.warn(`[live] Could not delete throwaway directory: ${err.message}`);
  }
}
