import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

// KEY-412 live check runner: a real Arabic and a real English text-layer PDF from tests/real-files
// (imported in place, not copied), throwaway profiles under .baglib-data/, Next renderer on :3000,
// the real built main (run `npm run build:main` first). Highlights use real sentences read from the
// PDF's text layer, with their real page numbers. Evidence goes to .baglib-data/key412-evidence/.

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pdfFor = lang => {
  const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  assert.ok(file, `a real ${lang} text-layer PDF is in the manifest`);
  return path.resolve('tests/real-files', file.path);
};

/** Two real passages (6-14 words) from the first pages of the PDF, with their page numbers. */
async function realPassages(file, lang) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  // Arabic letters, including the presentation forms some PDF text layers use (kept verbatim).
  const letters = lang === 'ar' ? /[ء-يﭐ-﷿ﹰ-﻿]/gu : /[A-Za-z]/gu;
  const found = [];
  for (let page = 1; page <= Math.min(doc.numPages, 12) && found.length < 2; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    const words = content.items.map(item => item.str ?? '').join(' ').replace(/\s+/gu, ' ').trim().split(' ');
    // An 8-word run with enough letters, a little into the page (past headers).
    for (let start = Math.min(10, words.length); start + 8 <= words.length; start += 4) {
      const text = words.slice(start, start + 8).join(' ');
      if ((text.match(letters) ?? []).length >= 25) {
        found.push({ page, text });
        break;
      }
    }
  }
  await doc.destroy();
  assert.equal(found.length, 2, `two real passages found in the ${lang} PDF`);
  return found;
}

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/revise-next-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch('http://127.0.0.1:3000')).status < 500;
  } catch {
    await new Promise(r => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

const profiles = [];
try {
  const used = [];
  for (const lang of ['ar', 'en']) {
    const profile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(profile, { recursive: true });
    profiles.push(profile);
    const pdf = pdfFor(lang);
    const passages = await realPassages(pdf, lang);
    used.push({ lang, pdf: path.relative(process.cwd(), pdf), passages });
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_RNEXT_PROFILE: profile,
      BAGLIB_RNEXT_EVIDENCE: evidence,
      BAGLIB_RNEXT_LANG: lang,
      BAGLIB_RNEXT_PDF: pdf,
      BAGLIB_RNEXT_PASSAGES: JSON.stringify(passages),
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log(`[rnext-live] ${lang}: ${path.basename(pdf)}`);
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/revise-next-live/main.cjs', `--user-data-dir=${profile}`], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', exitCode => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }
  fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(used, null, 2));
  const keep = path.resolve('.baglib-data/key412-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[rnext-live] KEY-412 live check passed');
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
