import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

// KEY-401 live check runner: a real Arabic and a real English text-layer PDF from tests/real-files
// (imported in place, not copied), throwaway profiles under .baglib-data/, Next renderer on :3000,
// the real built main (run `npm run build:main` first). The Wikipedia lookups are real requests to
// ar/en.wikipedia.org. Evidence goes to .baglib-data/key401-evidence/.

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pdfFor = lang => {
  const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  assert.ok(file, `a real ${lang} text-layer PDF is in the manifest`);
  return path.resolve('tests/real-files', file.path);
};

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/person-decks-live-'));
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
    // The Arabic book's author is named in its title; the English one is a magazine issue.
    const author = lang === 'ar' ? 'عبدالله عزام' : 'New Scientist';
    const lookup = lang === 'ar' ? 'ابن خلدون' : 'Ibn Khaldun';
    used.push({ lang, pdf: path.relative(process.cwd(), pdf), author, lookup });
    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_PERSON_PROFILE: profile,
      BAGLIB_PERSON_EVIDENCE: evidence,
      BAGLIB_PERSON_LANG: lang,
      BAGLIB_PERSON_PDF: pdf,
      BAGLIB_PERSON_AUTHOR: author,
      BAGLIB_PERSON_LOOKUP: lookup,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log(`[person-live] ${lang}: ${path.basename(pdf)}`);
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/person-decks-live/main.cjs', `--user-data-dir=${profile}`], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', exitCode => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }
  fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(used, null, 2));
  const keep = path.resolve('.baglib-data/key401-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[person-live] KEY-401 live check passed');
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
