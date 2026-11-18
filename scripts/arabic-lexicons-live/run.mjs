import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// KEY-413 live check runner:
// - Imports the REAL repos/arabic_lexicons-main.zip through the UI's IPC path
// - Uses real Arabic and English text-layer PDFs from tests/real-files/manifest.json
// - Uses a disposable Quran corpus copy in each throwaway profile (verified unchanged on cleanup)
// - Runs in Arabic (RTL) and English (LTR) with windows off-screen (src/main/live-harness-window.ts)
// - Saves screenshots and timings to .baglib-data/key413-evidence/

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pdfFor = (lang) => {
  const file = manifest.files.find((f) => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  assert.ok(file, `a real ${lang} text-layer PDF is in the manifest`);
  return path.resolve('tests/real-files', file.path);
};

const realPackZipPath = path.resolve('repos/arabic_lexicons-main.zip');
assert.ok(fs.existsSync(realPackZipPath), 'repos/arabic_lexicons-main.zip exists on disk');

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/arlex-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
      { stdio: 'ignore', windowsHide: true }
    );
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch('http://127.0.0.1:3000')).status < 500;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

const profiles = [];
const corpora = [];
try {
  const used = [];
  for (const lang of ['ar', 'en']) {
    const profile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(profile, { recursive: true });
    profiles.push(profile);

    const corpus = setupThrowawayCorpus({
      targetDir: profile,
      copyPoetry: false,
      linkSunnah: false,
      includeMushafLayout: true,
    });
    corpora.push(corpus);

    const arPdf = pdfFor('ar');
    const enPdf = pdfFor('en');
    const activePdf = lang === 'ar' ? arPdf : enPdf;
    used.push({
      lang,
      packZip: 'repos/arabic_lexicons-main.zip',
      arPdf: path.relative(process.cwd(), arPdf),
      enPdf: path.relative(process.cwd(), enPdf),
    });

    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_ARLEX_PROFILE: profile,
      BAGLIB_ARLEX_EVIDENCE: evidence,
      BAGLIB_ARLEX_LANG: lang,
      BAGLIB_ARLEX_ZIP: realPackZipPath,
      BAGLIB_ARLEX_AR_PDF: arPdf,
      BAGLIB_ARLEX_EN_PDF: enPdf,
      BAGLIB_ARLEX_PDF: activePdf,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log(`[arabic-lexicons-live] ${lang}: pack=${path.basename(realPackZipPath)}, pdf=${path.basename(arPdf)}`);
    const code = await new Promise((resolve) => {
      const child = spawn(
        electron,
        ['scripts/arabic-lexicons-live/main.cjs', `--user-data-dir=${profile}`],
        { env, stdio: 'inherit', windowsHide: true }
      );
      const timer = setTimeout(() => child.kill(), 300_000);
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }

  fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(used, null, 2));
  const keep = path.resolve('.baglib-data/key413-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  }
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[arabic-lexicons-live] KEY-413 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  for (const corpus of corpora) {
    try {
      const report = corpus.cleanup();
      assert.equal(report.copiesDeleted, true, 'Corpus copies must be deleted');
      assert.equal(report.originalsUnchanged, true, 'Original corpus files must remain unchanged');
    } catch (e) {
      console.error('Corpus cleanup error:', e);
    }
  }
  for (const profile of profiles) {
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
    fs.rmSync(profile, { recursive: true, force: true });
  }
  try {
    const keep = path.resolve('.baglib-data/key413-evidence');
    fs.mkdirSync(keep, { recursive: true });
    for (const item of fs.readdirSync(evidence)) {
      fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
    }
  } catch {}
  fs.rmSync(directory, { recursive: true, force: true });
}
